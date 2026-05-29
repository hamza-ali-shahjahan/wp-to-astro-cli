import { describe, it, expect } from "vitest";
import { parseContentBlocks } from "../src/source-adapters/wxr/blocks.js";

describe("WXR list block mapping (modern WP 6.0+)", () => {
  it("maps an unordered list with two items", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:list -->",
        '<ul class="wp-block-list"><!-- wp:list-item -->',
        "<li>One</li>",
        "<!-- /wp:list-item -->",
        "",
        "<!-- wp:list-item -->",
        "<li>Two</li>",
        "<!-- /wp:list-item --></ul>",
        "<!-- /wp:list -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [{ text: "One" }, { text: "Two" }],
      },
    ]);
  });

  it("maps an ordered list", () => {
    const blocks = parseContentBlocks(
      [
        '<!-- wp:list {"ordered":true} -->',
        '<ol class="wp-block-list"><!-- wp:list-item -->',
        "<li>First</li>",
        "<!-- /wp:list-item -->",
        "",
        "<!-- wp:list-item -->",
        "<li>Second</li>",
        "<!-- /wp:list-item --></ol>",
        "<!-- /wp:list -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        items: [{ text: "First" }, { text: "Second" }],
      },
    ]);
  });

  it("falls back to raw for a pre-6.0 flat list (no list-item innerBlocks)", () => {
    const blocks = parseContentBlocks(
      "<!-- wp:list -->\n<ul><li>x</li></ul>\n<!-- /wp:list -->",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "raw",
      todo: expect.stringContaining("core/list"),
    });
  });
});
