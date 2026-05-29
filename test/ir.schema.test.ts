import { describe, it, expect } from "vitest";
import {
  IR_VERSION,
  SiteSchema,
  BlockSchema,
  PostSchema,
  type Site,
} from "../src/ir/schema.js";
import { slugify } from "../src/util/slug.js";

describe("IR schema (v0.1.0)", () => {
  it("exposes IR_VERSION as '0.4.0'", () => {
    expect(IR_VERSION).toBe("0.4.0");
  });

  it("accepts a paragraph block", () => {
    const r = BlockSchema.safeParse({ type: "paragraph", text: "hi" });
    expect(r.success).toBe(true);
  });

  it("accepts a heading block at level 2", () => {
    const r = BlockSchema.safeParse({ type: "heading", level: 2, text: "Welcome" });
    expect(r.success).toBe(true);
  });

  it("rejects a heading at level 1 (not in union)", () => {
    const r = BlockSchema.safeParse({ type: "heading", level: 1, text: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects a heading at level 7", () => {
    const r = BlockSchema.safeParse({ type: "heading", level: 7, text: "x" });
    expect(r.success).toBe(false);
  });

  it("accepts a raw block", () => {
    const r = BlockSchema.safeParse({
      type: "raw",
      html: "<div>...</div>",
      todo: "unmapped block: core/foo",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown block type", () => {
    const r = BlockSchema.safeParse({ type: "image", url: "..." });
    expect(r.success).toBe(false);
  });

  it("validates a Post", () => {
    const r = PostSchema.safeParse({
      slug: "hello",
      title: "Hello",
      date: "2024-01-01T00:00:00.000Z",
      blocks: [{ type: "paragraph", text: "hi" }],
    });
    expect(r.success).toBe(true);
  });

  it("validates a full Site at the current version", () => {
    const site: Site = {
      version: IR_VERSION,
      posts: [
        {
          slug: "hello",
          title: "Hello",
          date: "2024-01-01T00:00:00.000Z",
          blocks: [{ type: "paragraph", text: "hi" }],
        },
      ],
      pages: [],
    };
    const r = SiteSchema.safeParse(site);
    expect(r.success).toBe(true);
  });

  it("rejects a Site with the wrong version literal", () => {
    const r = SiteSchema.safeParse({
      version: "9.9.9",
      posts: [],
      pages: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("slugify (security-relevant)", () => {
  it("neutralizes a path-traversal slug", () => {
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
  });

  it("neutralizes absolute paths and backslashes", () => {
    expect(slugify("/etc/passwd")).toBe("etc-passwd");
    expect(slugify("C:\\\\Windows\\\\system32")).toBe("c-windows-system32");
  });

  it("collapses runs of separators", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("falls back to 'untitled' on empty/whitespace input", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("...")).toBe("untitled");
  });

  it("strips diacritics", () => {
    expect(slugify("café résumé")).toBe("cafe-resume");
  });
});
