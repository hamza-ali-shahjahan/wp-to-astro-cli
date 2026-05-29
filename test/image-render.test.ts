import { describe, it, expect } from "vitest";
import { renderBlock } from "../src/emitters/astro/render-block.js";

describe("renderBlock: image", () => {
  it("renders image with alt and no caption", () => {
    expect(
      renderBlock({ type: "image", src: "./photo.webp", alt: "A photo" }),
    ).toBe("![A photo](./photo.webp)\n\n");
  });

  it("renders image with caption (separate paragraph in italics)", () => {
    expect(
      renderBlock({
        type: "image",
        src: "./photo.webp",
        alt: "A photo",
        caption: "Photographed in 2024",
      }),
    ).toBe("![A photo](./photo.webp)\n\n*Photographed in 2024*\n\n");
  });

  it("escapes closing bracket in alt text", () => {
    expect(
      renderBlock({ type: "image", src: "./a.webp", alt: "img [draft]" }),
    ).toBe("![img [draft\\]](./a.webp)\n\n");
  });

  it("renders image with empty alt", () => {
    expect(renderBlock({ type: "image", src: "./a.webp", alt: "" })).toBe(
      "![](./a.webp)\n\n",
    );
  });
});
