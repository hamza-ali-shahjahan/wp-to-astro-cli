import { stringify as yamlStringify } from "yaml";
import type { SeoMeta } from "../../ir/schema.js";

/**
 * Build a YAML frontmatter block for a post or page.
 *
 * - Single-quoted strings (deterministic; sidesteps YAML's timestamp coercion
 *   for date-shaped values like `2024-01-01T12:00:00.000Z`, which Astro's
 *   content-collection schema must see as `z.string()`).
 * - Keys sorted alphabetically (stable diffs) — yaml's `sortMapEntries: true`
 *   sorts nested maps too, so `seo:` fields are also alphabetized.
 * - `lineWidth: 0` disables YAML line-folding so long titles don't wrap.
 * - Undefined fields are omitted — pages without a date get no `date:` line.
 * - Output ends with `---\n\n` so the body starts after a blank line.
 */
export type FrontmatterMeta = {
  title: string;
  slug: string;
  date?: string;
  excerpt?: string;
  seo?: SeoMeta;
};

export function buildFrontmatter(meta: FrontmatterMeta): string {
  const obj: Record<string, unknown> = {};
  if (meta.date !== undefined) obj["date"] = meta.date;
  if (meta.excerpt !== undefined) obj["excerpt"] = meta.excerpt;
  if (meta.seo !== undefined && Object.keys(meta.seo).length > 0) {
    obj["seo"] = meta.seo;
  }
  obj["slug"] = meta.slug;
  obj["title"] = meta.title;
  const body = yamlStringify(obj, {
    defaultStringType: "QUOTE_SINGLE",
    defaultKeyType: "PLAIN",
    sortMapEntries: true,
    lineWidth: 0,
  });
  return `---\n${body}---\n\n`;
}
