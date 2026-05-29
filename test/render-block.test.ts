import { describe, it, expect } from "vitest";
import { renderBlock } from "../src/emitters/astro/render-block.js";

describe("renderBlock (Astro emitter)", () => {
  it("renders a paragraph as plain text + trailing blank line", () => {
    const out = renderBlock({ type: "paragraph", text: "Hello world." });
    expect(out).toBe("Hello world.\n\n");
  });

  it("preserves inline HTML in a paragraph", () => {
    const out = renderBlock({
      type: "paragraph",
      text: "Hello <strong>world</strong>.",
    });
    expect(out).toBe("Hello <strong>world</strong>.\n\n");
  });

  it("renders a level-2 heading as ##", () => {
    const out = renderBlock({ type: "heading", level: 2, text: "Welcome" });
    expect(out).toBe("## Welcome\n\n");
  });

  it("renders a level-3 heading as ###", () => {
    const out = renderBlock({ type: "heading", level: 3, text: "Sub" });
    expect(out).toBe("### Sub\n\n");
  });

  it("renders a level-6 heading as ######", () => {
    const out = renderBlock({ type: "heading", level: 6, text: "Tiny" });
    expect(out).toBe("###### Tiny\n\n");
  });

  it("renders a raw block with MDX TODO comment and the original HTML", () => {
    const out = renderBlock({
      type: "raw",
      html: "<ul><li>x</li></ul>",
      todo: "unmapped block: core/list",
    });
    expect(out).toBe(
      "{/* TODO: unmapped block: core/list */}\n<ul><li>x</li></ul>\n\n",
    );
  });

  it("always ends with exactly one trailing \\n\\n (invariant)", () => {
    const cases = [
      { type: "paragraph", text: "x" } as const,
      { type: "heading", level: 2, text: "y" } as const,
      { type: "raw", html: "<i></i>", todo: "unmapped block: core/z" } as const,
    ];
    for (const c of cases) {
      const out = renderBlock(c);
      expect(out.endsWith("\n\n")).toBe(true);
      expect(out.endsWith("\n\n\n")).toBe(false);
    }
  });
});
