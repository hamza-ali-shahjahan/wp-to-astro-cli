import { describe, it, expect } from "vitest";
import { extractSeoFromPostmeta } from "../src/source-adapters/wxr/seo.js";

describe("extractSeoFromPostmeta (Yoast)", () => {
  it("returns undefined when no postmeta", () => {
    expect(extractSeoFromPostmeta([])).toBeUndefined();
  });

  it("returns undefined when no Yoast keys present", () => {
    expect(
      extractSeoFromPostmeta([{ key: "_thumbnail_id", value: "42" }]),
    ).toBeUndefined();
  });

  it("extracts title + description", () => {
    expect(
      extractSeoFromPostmeta([
        { key: "_yoast_wpseo_title", value: "Custom Title" },
        { key: "_yoast_wpseo_metadesc", value: "Custom description." },
      ]),
    ).toEqual({
      title: "Custom Title",
      description: "Custom description.",
    });
  });

  it("extracts canonical and ogImage", () => {
    expect(
      extractSeoFromPostmeta([
        { key: "_yoast_wpseo_canonical", value: "https://example.com/x/" },
        { key: "_yoast_wpseo_opengraph-image", value: "https://example.com/og.jpg" },
      ]),
    ).toEqual({
      canonical: "https://example.com/x/",
      ogImage: "https://example.com/og.jpg",
    });
  });

  it("joins noindex + nofollow into a robots string", () => {
    expect(
      extractSeoFromPostmeta([
        { key: "_yoast_wpseo_meta-robots-noindex", value: "1" },
        { key: "_yoast_wpseo_meta-robots-nofollow", value: "1" },
      ]),
    ).toEqual({ robots: "noindex, nofollow" });
  });

  it("emits 'index, follow' when both flags are 0", () => {
    expect(
      extractSeoFromPostmeta([
        { key: "_yoast_wpseo_meta-robots-noindex", value: "0" },
        { key: "_yoast_wpseo_meta-robots-nofollow", value: "0" },
      ]),
    ).toEqual({ robots: "index, follow" });
  });

  it("omits robots when neither flag is present", () => {
    expect(
      extractSeoFromPostmeta([
        { key: "_yoast_wpseo_title", value: "X" },
      ]),
    ).toEqual({ title: "X" });
  });

  it("omits empty-string Yoast values", () => {
    expect(
      extractSeoFromPostmeta([
        { key: "_yoast_wpseo_title", value: "" },
        { key: "_yoast_wpseo_metadesc", value: "Real description." },
      ]),
    ).toEqual({ description: "Real description." });
  });
});
