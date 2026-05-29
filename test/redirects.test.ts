import { describe, it, expect } from "vitest";
import {
  applyPermalink,
  generateRedirects,
} from "../src/emitters/astro/redirects.js";
import { IR_VERSION, type Post, type Site } from "../src/ir/schema.js";

function p(slug: string, date: string): Post {
  return {
    slug,
    title: slug,
    date,
    blocks: [{ type: "paragraph", text: "x" }],
  };
}

describe("applyPermalink", () => {
  const post = p("hello-world", "2024-03-15T12:00:00.000Z");

  it("expands %postname%", () => {
    expect(applyPermalink("/%postname%/", post)).toBe("/hello-world/");
  });

  it("expands date placeholders", () => {
    expect(applyPermalink("/%year%/%monthnum%/%day%/%postname%/", post)).toBe(
      "/2024/03/15/hello-world/",
    );
  });

  it("expands a mix and normalizes trailing slash", () => {
    expect(applyPermalink("/%year%/%postname%", post)).toBe("/2024/hello-world/");
  });

  // Note: applyPermalink no longer rejects unsupported placeholders — that's
  // generateRedirects's job (validation happens once per site, not per post).
  // Unknown placeholders pass through unsubstituted and produce a literal in
  // the URL; generateRedirects refuses to emit before reaching this function.

  it("returns null for unparseable dates", () => {
    const broken = p("x", "not a date");
    expect(applyPermalink("/%year%/%postname%/", broken)).toBeNull();
  });
});

function site(structure: string | undefined, posts: Post[]): Site {
  const s: Site = { version: IR_VERSION, posts, pages: [] };
  if (structure !== undefined) {
    s.config = { permalinkStructure: structure };
  }
  return s;
}

describe("generateRedirects", () => {
  it("returns null when there is no permalink structure", () => {
    expect(generateRedirects(site(undefined, []))).toBeNull();
  });

  it("returns null when the structure is /%postname%/ (no redirect needed)", () => {
    expect(
      generateRedirects(
        site("/%postname%/", [p("hello", "2024-01-01T00:00:00.000Z")]),
      ),
    ).toBeNull();
  });

  it("emits 301 lines in Netlify format", () => {
    const out = generateRedirects(
      site("/%year%/%monthnum%/%postname%/", [
        p("hello-world", "2024-03-15T12:00:00.000Z"),
        p("another", "2024-04-01T09:00:00.000Z"),
      ]),
    );
    expect(out).not.toBeNull();
    expect(out!.count).toBe(2);
    expect(out!.netlify).toBe(
      "/2024/03/hello-world/ /hello-world/ 301\n" +
        "/2024/04/another/ /another/ 301\n",
    );
  });

  it("emits permanent: true entries in Vercel format", () => {
    const out = generateRedirects(
      site("/%year%/%postname%/", [p("hello", "2024-03-15T12:00:00.000Z")]),
    );
    const vercel = JSON.parse(out!.vercelJson);
    expect(vercel).toEqual({
      redirects: [
        {
          source: "/2024/hello/",
          destination: "/hello/",
          permanent: true,
        },
      ],
    });
  });

  it("skips posts with unsupported placeholders", () => {
    const out = generateRedirects(
      site("/%category%/%postname%/", [p("x", "2024-01-01T00:00:00.000Z")]),
    );
    expect(out).toBeNull(); // all skipped → no rules
  });
});
