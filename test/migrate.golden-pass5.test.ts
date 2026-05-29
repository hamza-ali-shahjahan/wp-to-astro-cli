import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { parseWxr } from "../src/source-adapters/wxr/index.js";
import { emitAstro } from "../src/emitters/astro/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_INPUT = path.resolve(__dirname, "fixtures/input/sample-pass5.wxr");
const FIXTURE_EXPECTED = path.resolve(__dirname, "fixtures/expected-pass5");

async function listTree(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".git") continue;
        await walk(full);
      } else {
        out.push(path.relative(root, full));
      }
    }
  }
  await walk(root);
  return out.sort();
}

describe("golden migration (Pass 5): Yoast SEO postmeta → MDX frontmatter", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await fs.mkdtemp(path.join(os.tmpdir(), "wp-to-astro-pass5-"));
    const site = await parseWxr(FIXTURE_INPUT);
    await emitAstro(site, outDir, { force: true, skipImages: true });
  });

  it("emits the expected file tree", async () => {
    const actual = await listTree(outDir);
    const expected = await listTree(FIXTURE_EXPECTED);
    expect(actual).toEqual(expected);
  });

  it("emits byte-identical file contents (including nested seo: in frontmatter)", async () => {
    const files = await listTree(FIXTURE_EXPECTED);
    for (const rel of files) {
      const actualContent = await fs.readFile(path.join(outDir, rel), "utf-8");
      const expectedContent = await fs.readFile(
        path.join(FIXTURE_EXPECTED, rel),
        "utf-8",
      );
      expect(actualContent, `mismatch in ${rel}`).toBe(expectedContent);
    }
  });
});
