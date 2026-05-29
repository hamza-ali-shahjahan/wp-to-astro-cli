import { describe, it, expect, vi } from "vitest";
import { parseRest } from "../src/source-adapters/rest/index.js";
import { IR_VERSION } from "../src/ir/schema.js";
import type { RestFetcher } from "../src/source-adapters/rest/client.js";

function jsonResponse(body: unknown, totalPages?: number): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (totalPages !== undefined) headers.set("X-WP-TotalPages", String(totalPages));
  return new Response(JSON.stringify(body), { status: 200, headers });
}

describe("parseRest integration", () => {
  it("assembles a full Site IR from stub WP REST responses", async () => {
    const fetcher: RestFetcher = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/settings")) {
        return jsonResponse({
          title: "Stub Site",
          description: "Test",
          url: "https://stub.example.com",
          permalink_structure: "/%postname%/",
        });
      }
      if (url.includes("/posts")) {
        if (url.includes("page=1")) {
          return jsonResponse(
            [
              {
                id: 1,
                slug: "post-one",
                date_gmt: "2024-03-01T09:00:00",
                title: { raw: "Post one", rendered: "Post one" },
                content: {
                  raw: "<!-- wp:paragraph -->\n<p>Body of post one.</p>\n<!-- /wp:paragraph -->",
                  rendered: "<p>Body of post one.</p>",
                },
                yoast_head_json: {
                  title: "Post one — SEO",
                  description: "Post one description",
                  canonical: "https://stub.example.com/post-one/",
                  og_image: [{ url: "https://stub.example.com/og.jpg" }],
                  robots: { index: "index", follow: "follow" },
                },
              },
            ],
            1,
          );
        }
        return jsonResponse([], 1);
      }
      if (url.includes("/pages")) {
        if (url.includes("page=1")) {
          return jsonResponse(
            [
              {
                id: 10,
                slug: "about",
                date_gmt: "0000-00-00T00:00:00",
                title: { raw: "About", rendered: "About" },
                content: {
                  raw: "<!-- wp:paragraph -->\n<p>About body.</p>\n<!-- /wp:paragraph -->",
                  rendered: "<p>About body.</p>",
                },
              },
            ],
            1,
          );
        }
        return jsonResponse([], 1);
      }
      throw new Error(`unexpected URL: ${url}`);
    });

    const site = await parseRest(
      "https://stub.example.com",
      { user: "admin", pass: "test test test test test test" },
      { fetcher },
    );

    expect(site.version).toBe(IR_VERSION);
    expect(site.posts).toHaveLength(1);
    expect(site.pages).toHaveLength(1);

    const post = site.posts[0]!;
    expect(post.slug).toBe("post-one");
    expect(post.title).toBe("Post one");
    expect(post.date).toBe("2024-03-01T09:00:00.000Z");
    expect(post.blocks).toEqual([{ type: "paragraph", text: "Body of post one." }]);
    expect(post.seo).toEqual({
      title: "Post one — SEO",
      description: "Post one description",
      canonical: "https://stub.example.com/post-one/",
      ogImage: "https://stub.example.com/og.jpg",
      robots: "index, follow",
    });

    const page = site.pages[0]!;
    expect(page.slug).toBe("about");
    expect(page.title).toBe("About");
    expect(page.date).toBeUndefined();
    expect(page.blocks).toEqual([{ type: "paragraph", text: "About body." }]);

    expect(site.config).toEqual({
      title: "Stub Site",
      description: "Test",
      baseUrl: "https://stub.example.com",
      permalinkStructure: "/%postname%/",
    });
  });
});
