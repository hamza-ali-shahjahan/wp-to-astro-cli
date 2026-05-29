import { describe, it, expect } from "vitest";
import { parseContentBlocks } from "../src/source-adapters/wxr/blocks.js";

describe("WXR code block mapping", () => {
  it("extracts code content without a language", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:code -->",
        '<pre class="wp-block-code"><code>const x = 1;</code></pre>',
        "<!-- /wp:code -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([{ type: "code", content: "const x = 1;" }]);
  });

  it("decodes HTML entities inside the code", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:code -->",
        '<pre class="wp-block-code"><code>if (a &lt; b &amp;&amp; c &gt; d) {}</code></pre>',
        "<!-- /wp:code -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { type: "code", content: "if (a < b && c > d) {}" },
    ]);
  });

  it("captures a language attribute when present", () => {
    const blocks = parseContentBlocks(
      [
        '<!-- wp:code {"language":"typescript"} -->',
        '<pre class="wp-block-code"><code>const x: number = 1;</code></pre>',
        "<!-- /wp:code -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      {
        type: "code",
        language: "typescript",
        content: "const x: number = 1;",
      },
    ]);
  });
});
