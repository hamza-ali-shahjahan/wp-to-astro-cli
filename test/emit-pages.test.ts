import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitAstro } from "../src/emitters/astro/index.js";
import { IR_VERSION, type Site } from "../src/ir/schema.js";

describe("Astro emitter: pages", () => {
  it("writes pages to src/content/pages/ and posts to src/content/posts/", async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "wp-to-astro-pages-"));
    const site: Site = {
      version: IR_VERSION,
      posts: [
        {
          slug: "post-one",
          title: "Post One",
          date: "2024-04-01T00:00:00.000Z",
          blocks: [{ type: "paragraph", text: "post body" }],
        },
      ],
      pages: [
        {
          slug: "about",
          title: "About",
          blocks: [{ type: "paragraph", text: "page body" }],
        },
      ],
    };
    await emitAstro(site, outDir, { force: true });
    const postContent = await fs.readFile(
      path.join(outDir, "src/content/posts/post-one.mdx"),
      "utf-8",
    );
    const pageContent = await fs.readFile(
      path.join(outDir, "src/content/pages/about.mdx"),
      "utf-8",
    );
    expect(postContent).toContain("post body");
    expect(pageContent).toContain("page body");
    // Page without date should not have a `date:` line in frontmatter.
    expect(pageContent).not.toMatch(/^date:/m);
    // Page must still have title + slug.
    expect(pageContent).toMatch(/^title: 'About'$/m);
    expect(pageContent).toMatch(/^slug: 'about'$/m);
  });

  it("allows a post and a page to share the same slug (separate namespaces)", async () => {
    const outDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wp-to-astro-collide-"),
    );
    const site: Site = {
      version: IR_VERSION,
      posts: [
        {
          slug: "about",
          title: "About post",
          date: "2024-04-01T00:00:00.000Z",
          blocks: [{ type: "paragraph", text: "post" }],
        },
      ],
      pages: [
        {
          slug: "about",
          title: "About page",
          blocks: [{ type: "paragraph", text: "page" }],
        },
      ],
    };
    await expect(emitAstro(site, outDir, { force: true })).resolves.toBeDefined();
    const postContent = await fs.readFile(
      path.join(outDir, "src/content/posts/about.mdx"),
      "utf-8",
    );
    const pageContent = await fs.readFile(
      path.join(outDir, "src/content/pages/about.mdx"),
      "utf-8",
    );
    expect(postContent).toContain("About post");
    expect(pageContent).toContain("About page");
  });
});
