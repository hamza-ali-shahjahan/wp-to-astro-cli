import {
  normalizeBaseUrl,
  fetchAllPosts,
  fetchAllPages,
  fetchSettings,
  type RestAuth,
  type RestClientOptions,
} from "./client.js";
import { postFromRest, pageFromRest, configFromSettings } from "./mappers.js";
import { IR_VERSION, SiteSchema, type Site } from "../../ir/schema.js";

export {
  RestAuthError,
  RestParseError,
  type RestAuth,
} from "./client.js";

/**
 * Parse a live WordPress site via the REST API into the IR.
 *
 * Requires an Application Password — see `docs/spec-pass-4.md` for setup.
 * Fetches `/posts` + `/pages` (all paginated pages) and `/settings`.
 *
 * Yoast `yoast_head_json` is captured into IR `seo` when present; rendering
 * into MDX frontmatter happens in Pass 5.
 */
export async function parseRest(
  baseUrl: string,
  auth: RestAuth,
  opts: RestClientOptions = {},
): Promise<Site> {
  const root = normalizeBaseUrl(baseUrl);

  // Settings is small and useful to fail fast on auth issues.
  const settings = await fetchSettings(root, auth, opts);

  const [wpPosts, wpPages] = await Promise.all([
    fetchAllPosts(root, auth, opts),
    fetchAllPages(root, auth, opts),
  ]);

  const posts = wpPosts.map(postFromRest);
  const pages = wpPages.map(pageFromRest);

  const site: Site = {
    version: IR_VERSION,
    posts,
    pages,
  };
  const config = configFromSettings(settings);
  if (config !== undefined) site.config = config;
  return SiteSchema.parse(site);
}
