import { readWxrItems, type WxrItem } from "./xml.js";
import { parseContentBlocks } from "./blocks.js";
import { slugify } from "../../util/slug.js";
import {
  IR_VERSION,
  SiteSchema,
  type Post,
  type Site,
} from "../../ir/schema.js";

/**
 * Parse a WordPress WXR XML export file into the IR.
 *
 * Pass 1 only emits `wp:post_type === "post"` items. Pages, attachments, and
 * custom post types are silently dropped (logged at INFO level by the CLI).
 */
export async function parseWxr(filepath: string): Promise<Site> {
  const items = await readWxrItems(filepath);
  const posts: Post[] = items.filter((it) => it.postType === "post").map(toPost);
  const site: Site = {
    version: IR_VERSION,
    posts,
    pages: [],
  };
  return SiteSchema.parse(site);
}

function toPost(it: WxrItem): Post {
  // SECURITY: always run the WordPress-supplied slug through slugify. WXR is
  // untrusted input — a hostile or hand-edited export could put path-traversal
  // segments (`../`, `\`, absolute paths) into <wp:post_name>. Slugify maps any
  // non-`[a-z0-9]` character to `-`, which neutralizes path separators and
  // dots, so the result is always a safe filename component.
  const source =
    it.postName !== undefined && it.postName.length > 0 ? it.postName : it.title;
  const slug = slugify(source);
  const date = isoDate(it.postDateGmt, it.pubDate, slug);
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

/**
 * Best-effort date normalization. WordPress stores `wp:post_date_gmt` as
 * `"YYYY-MM-DD HH:MM:SS"` (UTC, no timezone). Falls back to `pubDate`
 * (RFC 822) if `gmt` is missing or malformed. Throws if neither is parseable.
 */
function isoDate(
  gmt: string | undefined,
  pub: string | undefined,
  postSlug: string,
): string {
  if (gmt !== undefined && gmt.length > 0) {
    const d = new Date(gmt.replace(" ", "T") + "Z");
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (pub !== undefined && pub.length > 0) {
    const d = new Date(pub);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  throw new Error(
    `WXR parse: post '${postSlug}' has no valid date (wp:post_date_gmt or pubDate required)`,
  );
}
