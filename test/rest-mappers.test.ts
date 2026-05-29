import { describe, it, expect } from "vitest";
import {
  postFromRest,
  pageFromRest,
  extractSeo,
  configFromSettings,
} from "../src/source-adapters/rest/mappers.js";
import type { WpPost, YoastHeadJson } from "../src/source-adapters/rest/types.js";

function basePost(overrides: Partial<WpPost> = {}): WpPost {
  return {
    id: 1,
    slug: "hello",
    date_gmt: "2024-01-01T12:00:00",
    title: { raw: "Hello", rendered: "Hello" },
    content: {
      raw: "<!-- wp:paragraph -->\n<p>Hi.</p>\n<!-- /wp:paragraph -->",
      rendered: "<p>Hi.</p>",
    },
    ...overrides,
  };
}

describe("postFromRest", () => {
  it("maps the basic fields", () => {
    const post = postFromRest(basePost());
    expect(post).toEqual({
      slug: "hello",
      title: "Hello",
      date: "2024-01-01T12:00:00.000Z",
      blocks: [{ type: "paragraph", text: "Hi." }],
    });
  });

  it("decodes HTML entities in the title", () => {
    const post = postFromRest(
      basePost({ title: { raw: "Why &#8220;hello&#8221;", rendered: "ignored" } }),
    );
    expect(post.title).toBe('Why "hello"');
  });

  it("falls back to rendered content when raw is missing", () => {
    const post = postFromRest(
      basePost({
        content: { rendered: "<p>just rendered.</p>" } as WpPost["content"],
      }),
    );
    // rendered content has no Gutenberg comments so falls through to raw.
    expect(post.blocks[0]?.type).toBe("raw");
  });

  it("includes excerpt when non-empty", () => {
    const post = postFromRest(
      basePost({ excerpt: { raw: "  A short excerpt.  ", rendered: "" } }),
    );
    expect(post.excerpt).toBe("A short excerpt.");
  });

  it("omits excerpt when blank", () => {
    const post = postFromRest(
      basePost({ excerpt: { raw: "   ", rendered: "" } }),
    );
    expect(post.excerpt).toBeUndefined();
  });

  it("attaches SEO when Yoast head_json is present", () => {
    const yoast: YoastHeadJson = {
      title: "Custom title",
      description: "Custom desc",
      canonical: "https://example.com/hello/",
      robots: { index: "index", follow: "follow" },
      og_type: "article",
      og_image: [{ url: "https://example.com/og.jpg" }],
    };
    const post = postFromRest(basePost({ yoast_head_json: yoast }));
    expect(post.seo).toEqual({
      title: "Custom title",
      description: "Custom desc",
      canonical: "https://example.com/hello/",
      robots: "index, follow",
      ogType: "article",
      ogImage: "https://example.com/og.jpg",
    });
  });

  it("throws on date_gmt = 0000-00-00 (posts require a date)", () => {
    expect(() =>
      postFromRest(basePost({ date_gmt: "0000-00-00T00:00:00" })),
    ).toThrow(/no valid date/i);
  });
});

describe("pageFromRest", () => {
  it("treats 0000-00-00 date_gmt as optional and omits the field", () => {
    const page = pageFromRest(basePost({ date_gmt: "0000-00-00T00:00:00" }));
    expect(page.date).toBeUndefined();
    expect(page.slug).toBe("hello");
  });

  it("includes date when present", () => {
    const page = pageFromRest(basePost({ date_gmt: "2024-02-02T10:00:00" }));
    expect(page.date).toBe("2024-02-02T10:00:00.000Z");
  });
});

describe("extractSeo", () => {
  it("returns undefined for undefined input", () => {
    expect(extractSeo(undefined)).toBeUndefined();
  });

  it("returns undefined when all fields are absent", () => {
    expect(extractSeo({})).toBeUndefined();
  });

  it("handles string-form robots from older Yoast", () => {
    expect(extractSeo({ robots: "noindex, nofollow" })).toEqual({
      robots: "noindex, nofollow",
    });
  });

  it("extracts the JSON-LD @graph", () => {
    const graph = [{ "@type": "Person", name: "Alice" }];
    const seo = extractSeo({
      schema: { "@graph": graph } as YoastHeadJson["schema"],
    });
    expect(seo?.schema).toEqual(graph);
  });
});

describe("configFromSettings", () => {
  it("maps WP settings to SiteConfig", () => {
    const cfg = configFromSettings({
      title: "My site",
      description: "A blog",
      url: "https://example.com",
      permalink_structure: "/%postname%/",
    });
    expect(cfg).toEqual({
      title: "My site",
      description: "A blog",
      baseUrl: "https://example.com",
      permalinkStructure: "/%postname%/",
    });
  });

  it("returns undefined when all fields are absent", () => {
    expect(configFromSettings({})).toBeUndefined();
  });

  it("omits permalink_structure when empty string", () => {
    expect(configFromSettings({ permalink_structure: "" })).toBeUndefined();
  });
});
