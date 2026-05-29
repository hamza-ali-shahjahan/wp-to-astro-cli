import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitAstro, EmitterError } from "../src/emitters/astro/index.js";
import { IR_VERSION, type Site } from "../src/ir/schema.js";

describe("Astro emitter: dedupe + safety", () => {
  it("throws an EmitterError when two posts share a slug", async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "wp-to-astro-dedupe-"));
    const site: Site = {
      version: IR_VERSION,
      posts: [
        {
          slug: "duplicate",
          title: "First",
          date: "2024-01-01T00:00:00.000Z",
          blocks: [{ type: "paragraph", text: "first" }],
        },
        {
          slug: "duplicate",
          title: "Second",
          date: "2024-01-02T00:00:00.000Z",
          blocks: [{ type: "paragraph", text: "second" }],
        },
      ],
      pages: [],
    };
    await expect(emitAstro(site, outDir, { force: true })).rejects.toThrow(
      EmitterError,
    );
    await expect(emitAstro(site, outDir, { force: true })).rejects.toThrow(
      /duplicate/i,
    );
  });

  it("refuses to write into a non-empty dir without force", async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "wp-to-astro-nonempty-"));
    await fs.writeFile(path.join(outDir, "preexisting.txt"), "hi");
    const site: Site = {
      version: IR_VERSION,
      posts: [
        {
          slug: "a",
          title: "A",
          date: "2024-01-01T00:00:00.000Z",
          blocks: [{ type: "paragraph", text: "a" }],
        },
      ],
      pages: [],
    };
    await expect(emitAstro(site, outDir)).rejects.toThrow(EmitterError);
    await expect(emitAstro(site, outDir)).rejects.toThrow(/not empty/i);
  });
});
