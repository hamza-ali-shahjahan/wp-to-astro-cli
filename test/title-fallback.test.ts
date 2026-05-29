import { describe, it, expect } from "vitest";
import { titleFromSlug } from "../src/util/slug.js";
import { postFromRest, pageFromRest } from "../src/source-adapters/rest/mappers.js";
import type { WpPost } from "../src/source-adapters/rest/types.js";

describe("titleFromSlug", () => {
  it("title-cases each hyphen-separated word", () => {
    expect(titleFromSlug("hello-world")).toBe("Hello World");
    expect(titleFromSlug("edge-case-no-title")).toBe("Edge Case No Title");
  });

  it("handles a single word", () => {
    expect(titleFromSlug("welcome")).toBe("Welcome");
  });

  it("collapses repeated and leading/trailing hyphens", () => {
    expect(titleFromSlug("---foo---bar---")).toBe("Foo Bar");
  });

  it("returns an empty string when the slug has no usable parts", () => {
    expect(titleFromSlug("---")).toBe("");
  });
});

function emptyTitleWpPost(slug: string): WpPost {
  return {
    id: 1,
    slug,
    date_gmt: "2024-01-01T00:00:00",
    title: { raw: "", rendered: "" },
    content: {
      raw: "<!-- wp:paragraph -->\n<p>Body.</p>\n<!-- /wp:paragraph -->",
      rendered: "<p>Body.</p>",
    },
  };
}

describe("REST mappers: empty-title fallback", () => {
  it("postFromRest derives title from slug when source title is empty", () => {
    const post = postFromRest(emptyTitleWpPost("untitled-post"));
    expect(post.title).toBe("Untitled Post");
  });

  it("pageFromRest derives title from slug when source title is empty", () => {
    const page = pageFromRest(emptyTitleWpPost("about-me"));
    expect(page.title).toBe("About Me");
  });
});
