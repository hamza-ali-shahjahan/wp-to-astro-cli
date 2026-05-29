import { describe, it, expect } from "vitest";
import { parseContentBlocks } from "../src/source-adapters/wxr/blocks.js";
import { renderBlock } from "../src/emitters/astro/render-block.js";

describe("WXR separator block mapping", () => {
  it("maps a Gutenberg separator to the singleton variant", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:separator -->",
        '<hr class="wp-block-separator has-alpha-channel-opacity"/>',
        "<!-- /wp:separator -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([{ type: "separator" }]);
  });

  it("renders the separator as <hr /> + trailing blank", () => {
    expect(renderBlock({ type: "separator" })).toBe("<hr />\n\n");
  });
});
