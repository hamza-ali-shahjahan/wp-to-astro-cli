import { describe, it, expect } from "vitest";
import { parseContentBlocks } from "../src/source-adapters/wxr/blocks.js";

describe("WXR quote block mapping", () => {
  it("extracts text and citation when both present", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:quote -->",
        '<blockquote class="wp-block-quote"><p>To be.</p><cite>Hamlet</cite></blockquote>',
        "<!-- /wp:quote -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { type: "quote", text: "To be.", citation: "Hamlet" },
    ]);
  });

  it("omits citation when <cite> is absent", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:quote -->",
        '<blockquote class="wp-block-quote"><p>An aphorism.</p></blockquote>',
        "<!-- /wp:quote -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([{ type: "quote", text: "An aphorism." }]);
  });

  it("preserves inline HTML in quote text", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:quote -->",
        '<blockquote class="wp-block-quote"><p>Hello <em>world</em>.</p></blockquote>',
        "<!-- /wp:quote -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([{ type: "quote", text: "Hello <em>world</em>." }]);
  });
});
