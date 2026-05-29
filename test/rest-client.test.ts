import { describe, it, expect, vi } from "vitest";
import {
  normalizeBaseUrl,
  authHeader,
  getAllPages,
  getOne,
  RestAuthError,
  RestParseError,
  type RestFetcher,
} from "../src/source-adapters/rest/client.js";

describe("normalizeBaseUrl", () => {
  it.each([
    ["https://example.com", "https://example.com/wp-json/wp/v2"],
    ["https://example.com/", "https://example.com/wp-json/wp/v2"],
    ["https://example.com/wp-json", "https://example.com/wp-json/wp/v2"],
    ["https://example.com/wp-json/", "https://example.com/wp-json/wp/v2"],
    ["https://example.com/wp-json/wp/v2", "https://example.com/wp-json/wp/v2"],
    ["https://example.com/wp-json/wp/v2/", "https://example.com/wp-json/wp/v2"],
  ])("normalizes %s → %s", (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });
});

describe("authHeader", () => {
  it("produces Basic auth from Application Password (preserves spaces)", () => {
    const h = authHeader({ user: "admin", pass: "xxxx yyyy zzzz" });
    // base64("admin:xxxx yyyy zzzz") = YWRtaW46eHh4eCB5eXl5IHp6eno=
    expect(h).toBe("Basic YWRtaW46eHh4eCB5eXl5IHp6eno=");
  });
});

function jsonResponse(
  body: unknown,
  init: { status?: number; totalPages?: number } = {},
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.totalPages !== undefined) {
    headers.set("X-WP-TotalPages", String(init.totalPages));
  }
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

/** Parse the page number from a paginated REST URL. */
function pageOf(url: string): number {
  const u = new URL(url);
  return parseInt(u.searchParams.get("page") ?? "1", 10);
}

describe("getOne", () => {
  it("returns the parsed body on success", async () => {
    const fetcher: RestFetcher = vi.fn(async () =>
      jsonResponse({ title: "Hello" }),
    );
    const out = await getOne(
      "https://example.com/wp-json/wp/v2",
      "/settings",
      { user: "u", pass: "p" },
      { fetcher },
    );
    expect(out).toEqual({ title: "Hello" });
  });

  it("maps 401 to RestAuthError", async () => {
    const fetcher: RestFetcher = vi.fn(async () =>
      new Response("nope", { status: 401 }),
    );
    await expect(
      getOne(
        "https://example.com/wp-json/wp/v2",
        "/settings",
        { user: "u", pass: "p" },
        { fetcher },
      ),
    ).rejects.toBeInstanceOf(RestAuthError);
  });

  it("retries once on 500 then succeeds", async () => {
    let calls = 0;
    const fetcher: RestFetcher = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response("oops", { status: 500 });
      return jsonResponse({ ok: true });
    });
    const out = await getOne(
      "https://example.com/wp-json/wp/v2",
      "/settings",
      { user: "u", pass: "p" },
      { fetcher },
    );
    expect(out).toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});

describe("getAllPages", () => {
  it("walks pages until X-WP-TotalPages is exhausted", async () => {
    const fetcher: RestFetcher = vi.fn(async (input) => {
      const page = pageOf(String(input));
      if (page === 1) return jsonResponse([{ id: 1 }, { id: 2 }], { totalPages: 2 });
      if (page === 2) return jsonResponse([{ id: 3 }], { totalPages: 2 });
      throw new Error(`unexpected page ${page}`);
    });
    const out = await getAllPages<{ id: number }>(
      "https://example.com/wp-json/wp/v2",
      "/posts?context=edit",
      { user: "u", pass: "p" },
      { fetcher },
    );
    expect(out).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it("stops at an empty page when no totalPages header", async () => {
    const fetcher: RestFetcher = vi.fn(async (input) => {
      const page = pageOf(String(input));
      if (page === 1) {
        // 200 with one item but no totalPages header at all.
        return new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = await getAllPages<{ id: number }>(
      "https://example.com/wp-json/wp/v2",
      "/posts?context=edit",
      { user: "u", pass: "p" },
      { fetcher },
    );
    // With no totalPages header, defaults to 1; client breaks after page 1.
    expect(out).toEqual([{ id: 1 }]);
  });

  it("treats 400 past page 1 as end-of-pagination", async () => {
    const fetcher: RestFetcher = vi.fn(async (input) => {
      const page = pageOf(String(input));
      if (page === 1) return jsonResponse([{ id: 1 }], { totalPages: 99 });
      return new Response('{"code":"rest_post_invalid_page_number"}', {
        status: 400,
      });
    });
    const out = await getAllPages<{ id: number }>(
      "https://example.com/wp-json/wp/v2",
      "/posts?context=edit",
      { user: "u", pass: "p" },
      { fetcher },
    );
    expect(out).toEqual([{ id: 1 }]);
  });

  it("throws RestParseError (does NOT loop forever) on persistent 5xx", async () => {
    let calls = 0;
    const fetcher: RestFetcher = vi.fn(async () => {
      calls++;
      return new Response("oh no", { status: 503 });
    });
    await expect(
      getAllPages<{ id: number }>(
        "https://example.com/wp-json/wp/v2",
        "/posts?context=edit",
        { user: "u", pass: "p" },
        { fetcher },
      ),
    ).rejects.toBeInstanceOf(RestParseError);
    // Original fetch + one retry = 2. Any more = the infinite-retry bug.
    expect(calls).toBe(2);
  });

  it("maps a non-array response to RestParseError", async () => {
    const fetcher: RestFetcher = vi.fn(
      async () => jsonResponse({ code: "rest_no_route" }),
    );
    await expect(
      getAllPages<{ id: number }>(
        "https://example.com/wp-json/wp/v2",
        "/garbage",
        { user: "u", pass: "p" },
        { fetcher },
      ),
    ).rejects.toBeInstanceOf(RestParseError);
  });
});
