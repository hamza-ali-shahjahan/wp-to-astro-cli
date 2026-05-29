import { describe, it, expect } from "vitest";
import { parseContentBlocks } from "../src/source-adapters/wxr/blocks.js";

describe("WXR core/image block mapping", () => {
  it("extracts src + alt + caption", () => {
    const blocks = parseContentBlocks(
      [
        '<!-- wp:image {"id":42} -->',
        '<figure class="wp-block-image"><img src="https://example.com/photo.png" alt="A photo" class="wp-image-42"/><figcaption>Hello caption.</figcaption></figure>',
        "<!-- /wp:image -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      {
        type: "image",
        src: "https://example.com/photo.png",
        alt: "A photo",
        caption: "Hello caption.",
      },
    ]);
  });

  it("handles empty alt and no caption", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:image -->",
        '<figure class="wp-block-image"><img src="https://example.com/x.jpg" alt=""/></figure>',
        "<!-- /wp:image -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { type: "image", src: "https://example.com/x.jpg", alt: "" },
    ]);
  });

  it("preserves inline HTML in caption", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:image -->",
        '<figure class="wp-block-image"><img src="https://example.com/a.png" alt="A"/><figcaption>Photo by <em>Alice</em></figcaption></figure>',
        "<!-- /wp:image -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      {
        type: "image",
        src: "https://example.com/a.png",
        alt: "A",
        caption: "Photo by <em>Alice</em>",
      },
    ]);
  });

  it("captures width and height when present in attrs", () => {
    const blocks = parseContentBlocks(
      [
        '<!-- wp:image {"width":640,"height":480} -->',
        '<figure class="wp-block-image"><img src="https://example.com/q.png" alt=""/></figure>',
        "<!-- /wp:image -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      {
        type: "image",
        src: "https://example.com/q.png",
        alt: "",
        width: 640,
        height: 480,
      },
    ]);
  });

  it("decodes HTML-entity-escaped URLs", () => {
    const blocks = parseContentBlocks(
      [
        "<!-- wp:image -->",
        '<figure class="wp-block-image"><img src="https://example.com/path?a=1&amp;b=2" alt="qs"/></figure>',
        "<!-- /wp:image -->",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      {
        type: "image",
        src: "https://example.com/path?a=1&b=2",
        alt: "qs",
      },
    ]);
  });
});
