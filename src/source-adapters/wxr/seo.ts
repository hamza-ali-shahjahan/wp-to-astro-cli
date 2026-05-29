import type { SeoMeta } from "../../ir/schema.js";

/**
 * Extract Yoast SEO metadata from a WXR item's `<wp:postmeta>` entries.
 *
 * Yoast SEO stores its per-post fields as WordPress postmeta with `_yoast_wpseo_*`
 * keys. Only a subset is worth round-tripping into IR SeoMeta:
 *
 *   - `_yoast_wpseo_title`               → seo.title
 *   - `_yoast_wpseo_metadesc`            → seo.description
 *   - `_yoast_wpseo_canonical`           → seo.canonical
 *   - `_yoast_wpseo_meta-robots-noindex` + `_yoast_wpseo_meta-robots-nofollow`
 *                                        → seo.robots (joined "noindex, nofollow")
 *   - `_yoast_wpseo_opengraph-image`     → seo.ogImage
 *
 * Returns `undefined` when no recognized Yoast keys are present — caller
 * should leave `post.seo` undefined in that case.
 */
export function extractSeoFromPostmeta(
  postmeta: Array<{ key: string; value: string }>,
): SeoMeta | undefined {
  if (postmeta.length === 0) return undefined;

  const meta = new Map(postmeta.map((m) => [m.key, m.value]));
  const seo: SeoMeta = {};

  const title = meta.get("_yoast_wpseo_title");
  if (title !== undefined && title.length > 0) seo.title = title;

  const description = meta.get("_yoast_wpseo_metadesc");
  if (description !== undefined && description.length > 0) {
    seo.description = description;
  }

  const canonical = meta.get("_yoast_wpseo_canonical");
  if (canonical !== undefined && canonical.length > 0) {
    seo.canonical = canonical;
  }

  // Robots: only emit if at least one of the keys is present. Yoast stores
  // "1" for true, "0" or absent for false.
  const noindexKey = "_yoast_wpseo_meta-robots-noindex";
  const nofollowKey = "_yoast_wpseo_meta-robots-nofollow";
  if (meta.has(noindexKey) || meta.has(nofollowKey)) {
    const noindex = meta.get(noindexKey) === "1";
    const nofollow = meta.get(nofollowKey) === "1";
    seo.robots = `${noindex ? "noindex" : "index"}, ${nofollow ? "nofollow" : "follow"}`;
  }

  const ogImage = meta.get("_yoast_wpseo_opengraph-image");
  if (ogImage !== undefined && ogImage.length > 0) seo.ogImage = ogImage;

  return Object.keys(seo).length > 0 ? seo : undefined;
}
