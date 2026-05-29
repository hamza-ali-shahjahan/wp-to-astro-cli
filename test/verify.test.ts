import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runVerify } from "../src/cli/verify.js";

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

async function scaffold(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wp-to-astro-verify-"));
  await fs.mkdir(path.join(dir, "src", "content", "posts"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "content", "config.ts"),
    "export const collections = {};\n",
  );
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "x", version: "0.1.0" }) + "\n",
  );
  await fs.writeFile(
    path.join(dir, "src", "content", "posts", "good.mdx"),
    "---\ntitle: 'Hello'\nslug: 'hello'\ndate: '2024-01-01'\n---\n\nBody.\n",
  );
  return dir;
}

describe("runVerify", () => {
  it("returns 0 on a well-formed migrated dir", async () => {
    const dir = await scaffold();
    const code = await runVerify(dir);
    expect(code).toBe(0);
  });

  it("returns 1 when the dir does not exist", async () => {
    const code = await runVerify("/no/such/dir");
    expect(code).toBe(1);
  });

  it("returns 2 when config.ts is missing", async () => {
    const dir = await scaffold();
    await fs.rm(path.join(dir, "src", "content", "config.ts"));
    const code = await runVerify(dir);
    expect(code).toBe(2);
  });

  it("returns 2 when an MDX file has no frontmatter", async () => {
    const dir = await scaffold();
    await fs.writeFile(
      path.join(dir, "src", "content", "posts", "bad.mdx"),
      "Just body. No frontmatter.\n",
    );
    const code = await runVerify(dir);
    expect(code).toBe(2);
  });

  it("returns 2 when an MDX file's frontmatter lacks required 'title'", async () => {
    const dir = await scaffold();
    await fs.writeFile(
      path.join(dir, "src", "content", "posts", "noTitle.mdx"),
      "---\nslug: 'no-title'\n---\n\nBody.\n",
    );
    const code = await runVerify(dir);
    expect(code).toBe(2);
  });

  it("returns 2 when _redirects has a malformed line", async () => {
    const dir = await scaffold();
    await fs.writeFile(path.join(dir, "_redirects"), "this is not a redirect\n");
    const code = await runVerify(dir);
    expect(code).toBe(2);
  });

  it("accepts a well-formed _redirects", async () => {
    const dir = await scaffold();
    await fs.writeFile(
      path.join(dir, "_redirects"),
      "/old/ /new/ 301\n# a comment line is ignored\n/other/ /thing/ 302\n",
    );
    const code = await runVerify(dir);
    expect(code).toBe(0);
  });

  it("returns 2 when vercel.json has no redirects array", async () => {
    const dir = await scaffold();
    await fs.writeFile(
      path.join(dir, "vercel.json"),
      JSON.stringify({ wrong: "shape" }),
    );
    const code = await runVerify(dir);
    expect(code).toBe(2);
  });
});
