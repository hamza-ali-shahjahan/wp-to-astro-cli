import { describe, it, expect } from "vitest";
import { parseContentBlocks } from "../src/source-adapters/wxr/blocks.js";

describe("WXR Gutenberg block mapper", () => {
  it("maps a single paragraph", () => {
    const blocks = parseContentBlocks(
      "<!-- wp:paragraph -->\n<p>Hello.</p>\n<!-- /wp:paragraph -->",
    );
    expect(blocks).toEqual([{ type: "paragraph", text: "Hello." }]);
  });

  it("maps a heading with explicit level", () => {
    const blocks = parseContentBlocks(
      '<!-- wp:heading {"level":3} -->\n<h3>Section</h3>\n<!-- /wp:heading -->',
    );
    expect(blocks).toEqual([{ type: "heading", level: 3, text: "Section" }]);
  });

  it("defaults heading level to 2 when omitted", () => {
    const blocks = parseContentBlocks(
      "<!-- wp:heading -->\n<h2>Welcome</h2>\n<!-- /wp:heading -->",
    );
    expect(blocks).toEqual([{ type: "heading", level: 2, text: "Welcome" }]);
  });

  it("clamps heading level 1 to level 2", () => {
    const blocks = parseContentBlocks(
      '<!-- wp:heading {"level":1} -->\n<h1>Title</h1>\n<!-- /wp:heading -->',
    );
    expect(blocks).toEqual([{ type: "heading", level: 2, text: "Title" }]);
  });

  it("emits a raw block for an unmapped block (pre-6.0 flat list)", () => {
    const blocks = parseContentBlocks(
      "<!-- wp:list -->\n<ul><li>x</li></ul>\n<!-- /wp:list -->",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "raw",
      todo: expect.stringContaining("core/list"),
    });
  });

  // Regression: re-imported WP content has Gutenberg comments HTML-entity-encoded.
  // If we don't decode before parsing, every post becomes one big `raw` block.
  it("decodes HTML-entity-encoded Gutenberg comments before parsing", () => {
    const blocks = parseContentBlocks(
      "&lt;!-- wp:paragraph --&gt;\n&lt;p&gt;Decoded.&lt;/p&gt;\n&lt;!-- /wp:paragraph --&gt;",
    );
    expect(blocks).toEqual([{ type: "paragraph", text: "Decoded." }]);
  });

  it("preserves inline HTML inside a paragraph", () => {
    const blocks = parseContentBlocks(
      "<!-- wp:paragraph -->\n<p>Hello <strong>world</strong>.</p>\n<!-- /wp:paragraph -->",
    );
    expect(blocks).toEqual([
      { type: "paragraph", text: "Hello <strong>world</strong>." },
    ]);
  });

  it("handles multiple consecutive blocks", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:heading -->",
        "<h2>A</h2>",
        "<!-- /wp:heading -->",
        "",
        "<!-- wp:paragraph -->",
        "<p>B</p>",
        "<!-- /wp:paragraph -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "A" },
      { type: "paragraph", text: "B" },
    ]);
  });
});
