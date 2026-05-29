import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import {
  processImages,
  type ImageFetcher,
} from "../src/emitters/astro/image-pipeline.js";

async function makeRedPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

// 1x1 transparent GIF (smallest valid GIF).
const GIF_BYTES = Buffer.from("R0lGODlhAQABAAAAACw=", "base64");

async function mktempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "wp-to-astro-img-"));
}

describe("processImages", () => {
  it("downloads a PNG and converts to WebP", async () => {
    const outDir = await mktempDir();
    const png = await makeRedPng();
    const fetcher: ImageFetcher = async () => ({
      ok: true,
      buffer: png,
      contentType: "image/png",
    });
    const result = await processImages(
      ["https://example.com/photo.png"],
      outDir,
      { fetcher, concurrency: 1 },
    );

    expect(result.urlMap.size).toBe(1);
    const localPath = result.urlMap.get("https://example.com/photo.png");
    expect(localPath).toMatch(/^\.\.\/\.\.\/assets\/images\/photo-[a-f0-9]{8}\.webp$/);
    expect(result.filesWritten).toHaveLength(1);
    const writtenPath = result.filesWritten[0];
    expect(writtenPath).toBeDefined();
    const full = path.join(outDir, writtenPath as string);
    const stat = await fs.stat(full);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("preserves GIF bytes (no WebP conversion)", async () => {
    const outDir = await mktempDir();
    const fetcher: ImageFetcher = async () => ({
      ok: true,
      buffer: GIF_BYTES,
      contentType: "image/gif",
    });
    const result = await processImages(
      ["https://example.com/anim.gif"],
      outDir,
      { fetcher, concurrency: 1 },
    );
    expect(result.urlMap.size).toBe(1);
    const local = result.urlMap.get("https://example.com/anim.gif");
    expect(local).toMatch(/\.gif$/);
  });

  it("skips images larger than maxBytes", async () => {
    const outDir = await mktempDir();
    const png = await makeRedPng();
    const fetcher: ImageFetcher = async () => ({
      ok: true,
      buffer: png,
      contentType: "image/png",
    });
    const result = await processImages(
      ["https://example.com/big.png"],
      outDir,
      { fetcher, maxBytes: 10, concurrency: 1 },
    );
    expect(result.urlMap.size).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/too large/i);
  });

  it("skips images the fetcher rejects", async () => {
    const outDir = await mktempDir();
    const fetcher: ImageFetcher = async () => ({ ok: false, reason: "404" });
    const result = await processImages(
      ["https://example.com/missing.png"],
      outDir,
      { fetcher, concurrency: 1 },
    );
    expect(result.urlMap.size).toBe(0);
    expect(result.skipped).toEqual([
      { url: "https://example.com/missing.png", reason: "404" },
    ]);
  });

  it("skips non-image content types", async () => {
    const outDir = await mktempDir();
    const fetcher: ImageFetcher = async () => ({
      ok: true,
      buffer: Buffer.from("<html>"),
      contentType: "text/html",
    });
    const result = await processImages(
      ["https://example.com/oops.png"],
      outDir,
      { fetcher, concurrency: 1 },
    );
    expect(result.urlMap.size).toBe(0);
    expect(result.skipped[0]?.reason).toMatch(/non-image/i);
  });

  it("rejects non-http(s) URLs at the pipeline layer (even with an injected fetcher that would accept them)", async () => {
    // The test fetcher would happily return bytes for ANY URL, but the
    // pipeline's SSRF gate sits above the fetcher boundary — so file:// is
    // refused before the fetcher is even called.
    let called = false;
    const fetcher: ImageFetcher = async () => {
      called = true;
      return {
        ok: true,
        buffer: Buffer.from("hi"),
        contentType: "image/png",
      };
    };
    const result = await processImages(
      ["file:///etc/passwd"],
      await mktempDir(),
      { fetcher, concurrency: 1 },
    );
    expect(called).toBe(false);
    expect(result.urlMap.size).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/unsupported URL scheme/i);
  });

  it("dedupes repeated URLs", async () => {
    const outDir = await mktempDir();
    const png = await makeRedPng();
    let calls = 0;
    const fetcher: ImageFetcher = async () => {
      calls++;
      return { ok: true, buffer: png, contentType: "image/png" };
    };
    await processImages(
      [
        "https://example.com/same.png",
        "https://example.com/same.png",
        "https://example.com/same.png",
      ],
      outDir,
      { fetcher, concurrency: 1 },
    );
    expect(calls).toBe(1);
  });
});
