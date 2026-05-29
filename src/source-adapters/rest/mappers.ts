import { parseContentBlocks } from "../wxr/blocks.js";
import { slugify, titleFromSlug } from "../../util/slug.js";
import type {
  Page,
  Post,
  SeoMeta,
  SiteConfig,
} from "../../ir/schema.js";
import type { WpPost, WpPage, WpSettings, YoastHeadJson } from "./types.js";

/**
 * Map a WordPress REST `WpPost` to IR `Post`.
 *
 * Prefers `content.raw` (which carries Gutenberg comments) over
 * `content.rendered` (which is post-Gutenberg-rendered HTML). `?context=edit`
 * is what makes `raw` available; the client always requests it.
 */
export function postFromRest(p: WpPost): Post {
  const slug = slugify(p.slug || titleFallback(p.title));
  const date = isoDate(p.date_gmt, slug);
  const blocks = parseContentBlocks(p.content.raw ?? p.content.rendered);
  const rawTitle = decodeHtml(p.title.raw ?? p.title.rendered);
  const post: Post = {
    slug,
    title: rawTitle.length > 0 ? rawTitle : titleFromSlug(slug),
    date,
    blocks,
  };
  const excerpt = (p.excerpt?.raw ?? p.excerpt?.rendered ?? "").trim();
  if (excerpt.length > 0) post.excerpt = excerpt;
  const seo = extractSeo(p.yoast_head_json);
  if (seo !== undefined) post.seo = seo;
  return post;
}

/** Pages mirror posts but `date` is optional and rarely meaningful. */
export function pageFromRest(p: WpPage): Page {
  const slug = slugify(p.slug || titleFallback(p.title));
  const blocks = parseContentBlocks(p.content.raw ?? p.content.rendered);
  const rawTitle = decodeHtml(p.title.raw ?? p.title.rendered);
  const page: Page = {
    slug,
    title: rawTitle.length > 0 ? rawTitle : titleFromSlug(slug),
    blocks,
  };
  const date = optionalIsoDate(p.date_gmt);
  if (date !== undefined) page.date = date;
  const excerpt = (p.excerpt?.raw ?? p.excerpt?.rendered ?? "").trim();
  if (excerpt.length > 0) page.excerpt = excerpt;
  const seo = extractSeo(p.yoast_head_json);
  if (seo !== undefined) page.seo = seo;
  return page;
}

/**
 * Extract Yoast head JSON into our internal `SeoMeta` shape. Returns undefined
 * when Yoast isn't installed / hasn't exposed itself to REST.
 */
export function extractSeo(y: YoastHeadJson | undefined): SeoMeta | undefined {
  if (y === undefined) return undefined;
  const seo: SeoMeta = {};
  if (y.title !== undefined) seo.title = y.title;
  if (y.description !== undefined) seo.description = y.description;
  if (y.canonical !== undefined) seo.canonical = y.canonical;
  if (y.robots !== undefined) {
    seo.robots =
      typeof y.robots === "string"
        ? y.robots
        : Object.values(y.robots).join(", ");
  }
  if (y.og_type !== undefined) seo.ogType = y.og_type;
  if (y.twitter_card !== undefined) seo.twitterCard = y.twitter_card;
  const firstImg = y.og_image?.[0]?.url;
  if (typeof firstImg === "string" && firstImg.length > 0) seo.ogImage = firstImg;
  if (y.schema && Array.isArray(y.schema["@graph"])) {
    seo.schema = y.schema["@graph"] as unknown[];
  }
  return Object.keys(seo).length > 0 ? seo : undefined;
}

export function configFromSettings(s: WpSettings): SiteConfig | undefined {
  const cfg: SiteConfig = {};
  if (s.title !== undefined) cfg.title = s.title;
  if (s.description !== undefined) cfg.description = s.description;
  if (s.url !== undefined) cfg.baseUrl = s.url;
  if (s.permalink_structure !== undefined && s.permalink_structure.length > 0) {
    cfg.permalinkStructure = s.permalink_structure;
  }
  return Object.keys(cfg).length > 0 ? cfg : undefined;
}

function titleFallback(t: { raw?: string; rendered: string }): string {
  const text = t.raw ?? t.rendered;
  return decodeHtml(text);
}

function isoDate(gmt: string, slug: string): string {
  if (gmt.length === 0 || /^0000-00-00/.test(gmt)) {
    throw new Error(
      `REST parse: post '${slug}' has no valid date_gmt`,
    );
  }
  // REST returns ISO-without-tz like "2024-01-01T12:00:00".
  const tz = /Z|[+-]\d\d:\d\d$/.test(gmt) ? "" : "Z";
  const d = new Date(gmt + tz);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`REST parse: post '${slug}' has unparseable date_gmt '${gmt}'`);
  }
  return d.toISOString();
}

function optionalIsoDate(gmt: string): string | undefined {
  if (gmt.length === 0 || /^0000-00-00/.test(gmt)) return undefined;
  const tz = /Z|[+-]\d\d:\d\d$/.test(gmt) ? "" : "Z";
  const d = new Date(gmt + tz);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * Decode HTML entities that WordPress puts into `title.rendered`. We avoid
 * pulling in a full decoder — same narrow set as `blocks.ts`.
 */
function decodeHtml(s: string): string {
  return s
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8230;/g, "…")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
