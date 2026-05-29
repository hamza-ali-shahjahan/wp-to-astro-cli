import type { Post, Site } from "../../ir/schema.js";

export type RedirectMap = {
  /** Netlify `_redirects` file contents (one rule per line). */
  netlify: string;
  /** Vercel `vercel.json` file contents (JSON with a `redirects` array). */
  vercelJson: string;
  /** Number of rules generated. */
  count: number;
};

/**
 * Generate redirect files from a site's permalink structure.
 *
 * Returns `null` when:
 *   - `site.config?.permalinkStructure` is absent or empty
 *   - the structure is `/%postname%/` (old URL == new URL — no redirect needed)
 *
 * The "new URL" target is assumed to be `/<slug>/` for every post — this matches
 * the most common Astro routing pattern (`src/pages/[slug].astro`). If your
 * routing differs, edit `_redirects` after migration.
 *
 * Only supports the common WordPress permalink placeholders:
 *   `%postname%`, `%year%`, `%monthnum%`, `%day%`, `%hour%`, `%minute%`, `%second%`
 *
 * Unsupported placeholders (`%category%`, `%author%`, `%post_id%`) cause the
 * post to be skipped with a stderr warning — we'd rather emit no redirect
 * than a wrong one.
 *
 * Pages are NOT included — pages typically already live at `/<slug>/` in both
 * WP and Astro, so no redirect is needed.
 */
export function generateRedirects(site: Site): RedirectMap | null {
  const structure = site.config?.permalinkStructure;
  if (structure === undefined || structure.length === 0) return null;
  if (structure === "/%postname%/" || structure === "%postname%") return null;

  const rules: Array<{ from: string; to: string }> = [];
  for (const post of site.posts) {
    const oldPath = applyPermalink(structure, post);
    if (oldPath === null) continue; // unsupported placeholder, skipped
    const newPath = `/${post.slug}/`;
    if (oldPath === newPath) continue;
    rules.push({ from: oldPath, to: newPath });
  }

  if (rules.length === 0) return null;

  const netlify =
    rules.map((r) => `${r.from} ${r.to} 301`).join("\n") + "\n";
  const vercel = {
    redirects: rules.map((r) => ({
      source: r.from,
      destination: r.to,
      permanent: true,
    })),
  };
  const vercelJson = JSON.stringify(vercel, null, 2) + "\n";

  return { netlify, vercelJson, count: rules.length };
}

/**
 * Apply a WordPress permalink structure template to a post, returning the
 * URL that post used to live at on the source WP site.
 *
 * Returns null if the template uses a placeholder we can't resolve from IR.
 */
export function applyPermalink(template: string, post: Post): string | null {
  const d = new Date(post.date);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const substitutions: Record<string, string> = {
    "%postname%": post.slug,
    "%year%": String(d.getUTCFullYear()),
    "%monthnum%": pad(d.getUTCMonth() + 1),
    "%day%": pad(d.getUTCDate()),
    "%hour%": pad(d.getUTCHours()),
    "%minute%": pad(d.getUTCMinutes()),
    "%second%": pad(d.getUTCSeconds()),
  };

  // Reject the template if it contains a placeholder we don't support.
  const unknownPlaceholder = /%(?!postname|year|monthnum|day|hour|minute|second)[a-z_]+%/i;
  if (unknownPlaceholder.test(template)) {
    process.stderr.write(
      `wp-to-astro: redirect skipped for '${post.slug}' — unsupported placeholder in '${template}'\n`,
    );
    return null;
  }

  let out = template;
  for (const [key, value] of Object.entries(substitutions)) {
    out = out.split(key).join(value);
  }
  // Ensure leading slash + single trailing slash.
  if (!out.startsWith("/")) out = `/${out}`;
  if (!out.endsWith("/")) out = `${out}/`;
  return out;
}
