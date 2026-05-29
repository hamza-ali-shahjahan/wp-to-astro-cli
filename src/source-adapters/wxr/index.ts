import { readWxrItems, type WxrItem } from "./xml.js";
import { parseContentBlocks } from "./blocks.js";
import { slugify } from "../../util/slug.js";
import {
  IR_VERSION,
  SiteSchema,
  type Page,
  type Post,
  type Site,
} from "../../ir/schema.js";

/**
 * Parse a WordPress WXR XML export file into the IR.
 *
 * Pass 2: emits posts (`wp:post_type === "post"`) and pages
 * (`wp:post_type === "page"`). All other post types (attachments, CPTs) are
 * silently dropped.
 */
export async function parseWxr(filepath: string): Promise<Site> {
  const items = await readWxrItems(filepath);
  const posts: Post[] = items
    .filter((it) => it.postType === "post")
    .map(toPost);
  const pages: Page[] = items
    .filter((it) => it.postType === "page")
    .map(toPage);
  const site: Site = {
    version: IR_VERSION,
    posts,
    pages,
  };
  return SiteSchema.parse(site);
}

function toPost(it: WxrItem): Post {
  // SECURITY: always run the WordPress-supplied slug through slugify. WXR is
  // untrusted input — slugify maps any non-`[a-z0-9]` character to `-`, which
  // neutralizes path separators and dots.
  const source =
    it.postName !== undefined && it.postName.length > 0 ? it.postName : it.title;
  const slug = slugify(source);
  const date = requireIsoDate(it, slug);
  const post: Post = {
    slug,
    title: it.title,
    date,
    blocks: parseContentBlocks(it.contentEncoded),
  };
  if (it.excerpt !== undefined && it.excerpt.length > 0) {
    post.excerpt = it.excerpt;
  }
  return post;
}

function toPage(it: WxrItem): Page {
  const source =
    it.postName !== undefined && it.postName.length > 0 ? it.postName : it.title;
  const slug = slugify(source);
  const date = optionalIsoDate(it);
  const page: Page = {
    slug,
    title: it.title,
    blocks: parseContentBlocks(it.contentEncoded),
  };
  if (date !== undefined) {
    page.date = date;
  }
  if (it.excerpt !== undefined && it.excerpt.length > 0) {
    page.excerpt = it.excerpt;
  }
  return page;
}

/**
 * Best-effort date normalization. WordPress stores `wp:post_date_gmt` as
 * `"YYYY-MM-DD HH:MM:SS"` (UTC, no timezone). WordPress's "no date" sentinel
 * is `0000-00-00 00:00:00` — explicit; do NOT fall back to `pubDate` in that
 * case (caller meant "no date").
 *
 * For other unparseable gmt values, fall back to `pubDate` (RFC 822).
 * Returns undefined if no date is recoverable.
 */
function maybeIsoDate(it: WxrItem): string | undefined {
  const gmt = it.postDateGmt;
  if (gmt !== undefined && gmt.length > 0) {
    if (/^0000-00-00/.test(gmt)) return undefined;
    const d = new Date(gmt.replace(" ", "T") + "Z");
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const pub = it.pubDate;
  if (pub !== undefined && pub.length > 0) {
    const d = new Date(pub);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function requireIsoDate(it: WxrItem, slug: string): string {
  const d = maybeIsoDate(it);
  if (d === undefined) {
    throw new Error(
      `WXR parse: post '${slug}' has no valid date (wp:post_date_gmt or pubDate required)`,
    );
  }
  return d;
}

function optionalIsoDate(it: WxrItem): string | undefined {
  return maybeIsoDate(it);
}
