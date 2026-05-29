import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defaultFetcher } from "../src/emitters/astro/image-pipeline.js";

// Silence the pipeline's stderr warnings during these tests.
let stderrSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  stderrSpy.mockRestore();
});

describe("defaultFetcher: SSRF defense", () => {
  it("rejects file:// schemes before touching the network", async () => {
    // If this hit the network, the test would either time out (30s) or
    // exfiltrate the user's /etc/passwd into the result. It does neither.
    const result = await defaultFetcher("file:///etc/passwd");
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("unsupported URL scheme"),
    });
  });

  it("rejects data: URLs", async () => {
    const result = await defaultFetcher("data:image/png;base64,AAAA");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unsupported URL scheme/);
    }
  });

  it("rejects gopher: URLs", async () => {
    const result = await defaultFetcher("gopher://example.com/");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unsupported URL scheme/);
    }
  });

  it("rejects unparseable input strings", async () => {
    const result = await defaultFetcher("not a url");
    expect(result).toEqual({ ok: false, reason: "invalid URL" });
  });

  // Note: we don't test that the http(s) path actually fetches — that's a
  // network call. The image-pipeline.test.ts suite covers the fetch path
  // via an injected stub fetcher.
});
