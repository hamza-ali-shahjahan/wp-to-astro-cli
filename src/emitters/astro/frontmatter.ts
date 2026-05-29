import { stringify as yamlStringify } from "yaml";

/**
 * Build a YAML frontmatter block for a post.
 *
 * - Single-quoted strings (deterministic; sidesteps YAML's timestamp coercion
 *   for date-shaped values like `2024-01-01T12:00:00.000Z`, which Astro's
 *   content-collection schema must see as `z.string()`).
 * - Keys sorted alphabetically (stable diffs).
 * - `lineWidth: 0` disables YAML's line-folding so long titles don't wrap.
 * - Output ends with `---\n\n` so the post body starts after a blank line.
 */
export type FrontmatterMeta = {
  title: string;
  slug: string;
  date: string;
  excerpt?: string;
};

export function buildFrontmatter(meta: FrontmatterMeta): string {
  const obj: Record<string, string> = {
    date: meta.date,
    slug: meta.slug,
    title: meta.title,
  };
  if (meta.excerpt !== undefined) obj["excerpt"] = meta.excerpt;
  const body = yamlStringify(obj, {
    defaultStringType: "QUOTE_SINGLE",
    defaultKeyType: "PLAIN",
    sortMapEntries: true,
    lineWidth: 0,
  });
  return `---\n${body}---\n\n`;
}
