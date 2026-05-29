import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitAstro } from "../src/emitters/astro/index.js";
import { IR_VERSION, type Site } from "../src/ir/schema.js";

describe("emitAstro: redirects integration", () => {
  it("writes _redirects + vercel.json when permalinkStructure is non-trivial", async () => {
    const outDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wp-to-astro-redir-"),
    );
    const site: Site = {
      version: IR_VERSION,
      posts: [
        {
          slug: "hello-world",
          title: "Hello",
          date: "2024-03-15T12:00:00.000Z",
          blocks: [{ type: "paragraph", text: "Hi." }],
        },
      ],
      pages: [],
      config: {
        permalinkStructure: "/%year%/%monthnum%/%postname%/",
      },
    };
    const result = await emitAstro(site, outDir, {
      force: true,
      skipImages: true,
    });
    expect(result.redirects).toBe(1);

    const redirectsContent = await fs.readFile(
      path.join(outDir, "_redirects"),
      "utf-8",
    );
    expect(redirectsContent).toBe(
      "/2024/03/hello-world/ /hello-world/ 301\n",
    );

    const vercelContent = JSON.parse(
      await fs.readFile(path.join(outDir, "vercel.json"), "utf-8"),
    );
    expect(vercelContent.redirects).toHaveLength(1);
    expect(vercelContent.redirects[0]).toMatchObject({
      source: "/2024/03/hello-world/",
      destination: "/hello-world/",
      permanent: true,
    });
  });

  it("does NOT write redirect files when permalink is /%postname%/", async () => {
    const outDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wp-to-astro-noredir-"),
    );
    const site: Site = {
      version: IR_VERSION,
      posts: [
        {
          slug: "x",
          title: "X",
          date: "2024-01-01T00:00:00.000Z",
          blocks: [{ type: "paragraph", text: "x" }],
        },
      ],
      pages: [],
      config: { permalinkStructure: "/%postname%/" },
    };
    const result = await emitAstro(site, outDir, {
      force: true,
      skipImages: true,
    });
    expect(result.redirects).toBe(0);
    await expect(fs.stat(path.join(outDir, "_redirects"))).rejects.toThrow();
    await expect(fs.stat(path.join(outDir, "vercel.json"))).rejects.toThrow();
  });
});
