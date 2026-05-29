# Spec — Pass 4: WordPress REST adapter

**Status:** Locked. v0.4.0.
**Builds on:** Pass 1–3.
**Last updated:** 2026-05-28.

## Goal

Make `wp-to-astro migrate` work against a live WordPress install (REST API) in addition to a WXR file. REST is preferred because it returns higher-fidelity data — `content.raw` carries the original Gutenberg comments, and integrated plugins expose structured fields (Yoast `yoast_head_json`, etc.) that WXR loses.

## In scope

### CLI auto-detection

`migrate` accepts either a file path or a URL as its first argument. Detection is by prefix:

```bash
wp-to-astro migrate ./export.xml --out ./site                                    # WXR (file)
wp-to-astro migrate https://example.com --out ./site --auth-user admin --auth-pass "xxxx ..."   # REST
```

A bare `./` or absolute path → WXR. Anything starting with `http://` or `https://` → REST. Anything else (e.g. `example.com`) → error with usage hint.

### Authentication: WordPress Application Passwords

The REST adapter requires Basic auth via Application Password (WP 5.6+, on by default). User flow:

1. WP admin → Users → Profile → "Application Passwords" → generate one named e.g. "wp-to-astro"
2. WordPress returns a 24-char space-separated password (e.g. `xxxx xxxx xxxx xxxx xxxx xxxx`)
3. Pass to CLI:

```bash
wp-to-astro migrate https://example.com --out ./site \
  --auth-user my_admin \
  --auth-pass "xxxx xxxx xxxx xxxx xxxx xxxx"

# Or via env var (recommended for secrets in CI)
WP_AUTH_USER=my_admin WP_AUTH_PASS='xxxx ...' \
  wp-to-astro migrate https://example.com --out ./site
```

Both flags are required for REST. Missing auth → exit 1 with a clear error pointing at the Application Passwords admin page.

### REST endpoints consumed

| Endpoint                            | Why                                                       |
| ----------------------------------- | --------------------------------------------------------- |
| `GET /wp-json/wp/v2/posts?context=edit&per_page=100` | Posts with `content.raw` Gutenberg markup |
| `GET /wp-json/wp/v2/pages?context=edit&per_page=100` | Pages                                         |
| `GET /wp-json/wp/v2/settings`       | `permalink_structure`, `url`, `title` (consumed by Pass 6) |

All endpoints use `?context=edit` (auth required) so `content.raw` is included.

### Pagination

WordPress REST returns the `X-WP-TotalPages` response header. The adapter iterates from page 1 until either:
- `page > totalPages`, OR
- response is `400 Bad Request` (WP returns 400 once you've exceeded `totalPages`)

`per_page=100` is the WP default max.

### Yoast SEO capture (data, no rendering yet)

When the Yoast SEO plugin is installed and "Show in REST" is enabled, every post response includes a `yoast_head_json` field with a structured schema. The REST adapter extracts:

- `title` → `seo.title`
- `description` → `seo.description`
- `canonical` → `seo.canonical`
- `robots` (joined) → `seo.robots`
- `og_image[0].url` → `seo.ogImage`
- `og_type` → `seo.ogType`
- `twitter_card` → `seo.twitterCard`
- `schema['@graph']` → `seo.schema` (preserved as JSON)

Pass 4 puts these into IR but does NOT yet emit them into MDX — Pass 5 owns rendering. Pass 4's deliverable is data capture only.

### RankMath: explicitly deferred

RankMath's `rank_math_head` REST field returns an HTML string, not JSON. Parsing it is non-trivial and deferred to a future pass. Document in the spec.

### IR additions (0.4.0)

```ts
// New: optional SEO metadata, attached to Post / Page
type SeoMeta = {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  schema?: unknown[];
};

type Post = { /* …existing… */ seo?: SeoMeta };
type Page = { /* …existing… */ seo?: SeoMeta };

// New: optional site-level config (used by Pass 6 for redirects)
type SiteConfig = {
  title?: string;
  description?: string;
  baseUrl?: string;
  permalinkStructure?: string;   // e.g. "/%year%/%monthnum%/%postname%/" or "/%postname%/"
};

type Site = {
  version: "0.4.0";
  posts: Post[];
  pages: Page[];
  config?: SiteConfig;
};
```

## Out of scope (deferred)

- RankMath SEO (HTML head parsing)
- ACF custom fields via REST (Pass 7+)
- Custom post types via REST (Pass 7+)
- OAuth-based auth (App Password is sufficient)
- REST as a fallback when WXR is the primary (other direction)
- Caching REST responses to disk
- Resumable / partial migrations
- Concurrent endpoint fetching (sequential is fast enough for now)

## Contracts

### Public adapter API

```ts
type RestAuth = { user: string; pass: string };

// Returns IR Site. Throws RestParseError on auth failure, network failure that
// can't be recovered, or malformed REST responses.
function parseRest(baseUrl: string, auth: RestAuth, opts?: { fetcher?: typeof fetch }): Promise<Site>;
```

`baseUrl` may include or omit `/wp-json/wp/v2/` — adapter normalizes.

### Error model

- HTTP 401 / 403 → throw `RestAuthError` with "check your Application Password" hint
- HTTP 5xx → retry once after 1s, then throw
- Network/DNS error → throw immediately
- JSON parse error → throw with endpoint name

All errors bubble up to the CLI which maps to exit code 2.

## Acceptance criteria

1. All 66 prior tests stay green.
2. New unit tests:
   - `rest-client.test.ts` — pagination assembly (totalPages header, empty page termination), auth header format, error mapping (401, 500-then-retry)
   - `rest-mappers.test.ts` — WpPost → IR Post, WpPage → IR Page, Yoast extraction (with + without yoast_head_json)
3. New integration test: stub fetcher returns full mock REST responses for /posts, /pages, /settings → `parseRest` returns expected Site IR.
4. CLI integration: `migrate https://...` routes through REST; bad arg shape (e.g. `example.com` without scheme) errors usefully.
5. Backwards compat: `migrate ./export.xml` still works exactly as before.

## Risks specific to Pass 4

1. **Auth secrets in CLI args.** `ps`-style process listings expose `--auth-pass`. Document env-var preference in README.
2. **Rate limits.** Some WP installs have rate limiting via security plugins. We don't currently throttle; document.
3. **HTTPS certificate trust.** We use Node's default trust store. Self-signed certs will fail. Document workaround (NODE_EXTRA_CA_CERTS).
4. **REST endpoint URL variants.** Some WP installs prefix paths weirdly. Pass 4 assumes the standard `/wp-json/` prefix.
