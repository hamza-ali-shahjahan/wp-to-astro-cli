# Changelog

All notable changes to wp-to-astro will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] — 2026-05-30

**Bugfix:** emitted Astro content-collection schema no longer includes `slug`,
which Astro reserves and rejects with `ContentSchemaContainsSlugError`.

Surfaced by running a real-world migration through `astro dev` (a deeper
validation surface than `astro check`, which only validates `.astro` files
and never touches content collections — the v0.6.0 smoke test missed it).

### Fixed

- `src/emitters/astro/templates/config.ts.tmpl` — removed `slug: z.string()`
  from both `postSchema` and `pageSchema`. Added a comment explaining why.
- Pass 1 / 2 / 3 / 5 expected `content/config.ts` fixtures updated to match.

The emitted MDX frontmatter still carries `slug:` for human readability and
non-Astro tooling. Astro silently ignores unknown frontmatter fields.

### Known issues deferred to v0.7

The same real-world test surfaced four other compatibility gaps that v0.6.1
does NOT fix — they need a deeper "sanitize raw HTML for MDX" pass:

- Non-self-closed void HTML tags (`<br>` → must be `<br />` for MDX)
- HTML comments (`<!-- … -->` → MDX needs `{/* … */}`)
- Stray `<` / `!` characters in body content from raw classic-editor blocks
- WordPress permalink structure is not exposed via the `/wp-json/wp/v2/settings`
  REST endpoint by default, so REST-based migrations don't get redirects.
  Workaround until v0.7 lands `--permalink`: use WXR (which still doesn't
  carry the structure either) and edit the redirect file by hand, or set
  the structure via a future CLI flag.

In our smoke test, 44 of 57 real-world posts rendered cleanly; the failing
13 were impacted by one or more of the above.

## [0.6.0] — 2026-05-29

**Pass 6: 301 redirect generation + `verify` subcommand.**

### Added

- `src/emitters/astro/redirects.ts`:
  - `applyPermalink(template, post)` — applies WP permalink placeholders (`%postname%`, `%year%`, `%monthnum%`, `%day%`, `%hour%`, `%minute%`, `%second%`) to a post's slug + date. Returns null on unsupported placeholders (`%category%`, `%author%`, etc.) — silent skip, no broken redirect.
  - `generateRedirects(site)` — returns `{ netlify, vercelJson, count }` or null when the site has no permalink structure or it's the trivial `/%postname%/` pattern.
- Emitter wires the redirect generator into `emitAstro`. When non-null, writes:
  - `_redirects` (Netlify format: `OLD NEW 301`)
  - `vercel.json` (`{ "redirects": [{ source, destination, permanent: true }] }`)
- New CLI subcommand: `wp-to-astro verify <site-dir>`. Lightweight structural sanity check (no subprocesses, no astro build). Walks the migrated tree and validates:
  - `src/content/config.ts` exists
  - `package.json` parses
  - every `.mdx` under `src/content/{posts,pages}/` has a `---`-delimited YAML frontmatter with required `title` + `slug`
  - if present, `_redirects` lines are `<from> <to> <code>` with a valid status code
  - if present, `vercel.json` has a top-level `redirects` array
- `EmitResult.redirects` count exposed to migrate CLI output
- 20 new tests across `redirects.test.ts` (applyPermalink edge cases, format generation), `emit-redirects.test.ts` (integration through emitAstro), and `verify.test.ts` (all pass/fail paths)

### Design notes

- **The "new URL" target is hard-coded to `/<slug>/`** — matching the most common Astro routing pattern. Users with different routes edit `_redirects` after migration.
- **Pages don't get redirects** — pages already live at `/<slug>/` in both WP and Astro by default.
- **Permalink structure comes from `site.config.permalinkStructure`** — populated by the REST adapter from `/wp-json/wp/v2/settings`. WXR doesn't directly export the permalink option; WXR migrations get no redirects unless the user manually sets `site.config` via a future `--permalink` CLI flag (deferred).
- **Verify is structural-only in v1.** Running `astro check` or `astro build` requires installing dependencies — that's a separate, heavier operation the user can run themselves. Documented as a follow-up.

### Not in this pass

- `.htaccess` format (deferred; less commonly needed)
- `--permalink <structure>` CLI override for WXR migrations
- Running `astro check` / `astro build` from `verify`
- URL crawl + redirect health check
- Lighthouse integration

## [0.5.0] — 2026-05-29

**Pass 5: SEO metadata emission.** Yoast SEO postmeta from WXR (and `yoast_head_json` from REST) now flow through to MDX frontmatter under a `seo:` key.

### Added

- WXR adapter parses `<wp:postmeta>` entries (was previously ignored)
- `src/source-adapters/wxr/seo.ts` — `extractSeoFromPostmeta` reads Yoast postmeta keys:
  - `_yoast_wpseo_title` → `seo.title`
  - `_yoast_wpseo_metadesc` → `seo.description`
  - `_yoast_wpseo_canonical` → `seo.canonical`
  - `_yoast_wpseo_meta-robots-noindex` + `_yoast_wpseo_meta-robots-nofollow` → joined `seo.robots`
  - `_yoast_wpseo_opengraph-image` → `seo.ogImage`
- `buildFrontmatter` emits a nested `seo:` block when present (yaml.stringify with `sortMapEntries: true` alphabetizes nested fields too)
- Emitted Astro `src/content/config.ts` now declares the `seo` schema on both `posts` and `pages` collections so Astro validates the field
- 9 new tests across `wxr-seo.test.ts` (Yoast extraction edge cases) and `migrate.golden-pass5.test.ts` (end-to-end MDX with nested seo)

### Changed

- Pass 1 / Pass 2 / Pass 3 expected `content/config.ts` fixtures updated to include the additive `seo` schema. No prior MDX changes — posts without SEO postmeta produce identical frontmatter to before.
- `WxrItem` shape gains `postmeta: Array<{key, value}>`
- `FrontmatterMeta` now accepts an optional `seo` field
- No IR version bump — the `SeoMeta` schema added in 0.4.0 is reused unchanged

### What's still pending

- Yoast `og_type`, `twitter_card`, schema graph in WXR are captured in the IR via REST but not extracted from WXR postmeta (Yoast doesn't store those as discrete postmeta entries — would require parsing the head_json blob which Yoast doesn't write to postmeta)
- RankMath postmeta (`rank_math_*` keys) — same shape, deferred
- ACF SEO plugins — deferred

## [0.4.0] — 2026-05-28

**Pass 4: WordPress REST API source adapter.** `wp-to-astro migrate` now works against a live WordPress install in addition to a WXR file.

### Added

- `migrate` accepts a URL as its source argument (auto-detected: starts with `http://` or `https://` → REST; else → WXR file)
- `--auth-user` / `--auth-pass` CLI flags, or `WP_AUTH_USER` / `WP_AUTH_PASS` env vars (env-var preferred for secrets)
- `src/source-adapters/rest/` — REST client with Basic-auth (Application Password), paginated `/posts` and `/pages` fetching via `X-WP-TotalPages`, retry-once on 5xx, dedicated `RestAuthError` / `RestParseError` types
- REST adapter fetches `/wp-json/wp/v2/settings` to populate `site.config` (title, description, baseUrl, permalinkStructure) — consumed by Pass 6
- Yoast SEO `yoast_head_json` extracted into IR `Post.seo` / `Page.seo` (rendering deferred to Pass 5)
- Helpful auth-failure error message with a direct link to the WordPress Application Passwords admin page

### IR additions (0.4.0)

- `SeoMeta` schema — optional `seo?` on `Post` / `Page`. Fields: `title`, `description`, `canonical`, `robots`, `ogImage`, `ogType`, `twitterCard`, `schema` (JSON-LD `@graph`).
- `SiteConfig` schema — optional `config?` on `Site`. Fields: `title`, `description`, `baseUrl`, `permalinkStructure`.

### Changed

- **IR version: `0.3.0` → `0.4.0`** — additive: new optional fields only. WXR adapter still works without changes (produces a Site without `seo` or `config`).

### Tests

- 31 new tests: `rest-client.test.ts` (URL normalization, auth header, pagination, error mapping), `rest-mappers.test.ts` (DTO → IR, Yoast extraction, settings → SiteConfig), `rest-integration.test.ts` (stub fetcher → full Site).
- Total: 97 passing across 18 files.

### Not in this pass

- RankMath SEO (`rank_math_head` is HTML, not JSON; parser deferred)
- ACF custom fields via REST
- Custom post types
- OAuth / JWT auth (App Password is sufficient for most cases)
- REST response caching to disk
- Concurrent endpoint fetching

## [0.3.0] — 2026-05-28

**Pass 3: image pipeline.** WordPress media URLs are now downloaded, optimized, and localized into the migrated Astro project.

### Added

- New IR block variant: `image` — `{ src, alt, width?, height?, caption? }`
- `core/image` Gutenberg block mapping — extracts `src`, `alt`, optional `<figcaption>`, and `attrs.width` / `attrs.height` when present
- HTML-entity decoding for image `src` URLs (handles `&amp;` in query strings)
- `image-pipeline.ts` — concurrent download (default 4 workers), PNG/JPG → WebP via `sharp` (quality 80), GIF / SVG / WebP / AVIF preserved verbatim, 5 MB per-file cap, 30s per-request timeout
- Asset placement at `<outDir>/src/assets/images/<stem>-<sha256[0..8]><ext>` — content-hashed filenames give stable de-dup of identical bytes
- MDX rendering rewrites image `src` from remote URL → MDX-relative path (`../../assets/images/...`) when the pipeline downloaded the file
- `--skip-images` CLI flag — keeps URLs remote, useful offline
- Injectable `fetcher` in `EmitOptions` for testability (default is native `fetch`)
- New runtime dep: `sharp` 0.34.x (~30 MB native bindings)
- 17 new tests across `image-block.test.ts`, `image-render.test.ts`, `image-pipeline.test.ts`, and `migrate.golden-pass3.test.ts`

### Changed

- **IR version: `0.2.0` → `0.3.0`** — additive: `Block` union gains `ImageBlock`. Adapters / emitters consuming IR externally need to handle the new variant.
- `EmitResult` gains `images` and `imagesSkipped` counts
- CLI output reports image processing counts

### Failure handling

The pipeline never aborts a migration on a single bad image. Per-image failures are logged to stderr and fall through to keeping the original URL in MDX:

- HTTP error, DNS failure, timeout
- Response > 5 MB
- Non-image content-type
- `sharp` conversion error
- Fetcher throws

### Not in this pass

- `core/gallery`, `core/cover` (Pass 4)
- Retry / backoff
- SSRF allowlist — Pass 3 assumes the user trusts their own WXR's image URLs
- Animated GIF → MP4
- Same-image-different-URL deduplication by content-hash across URLs
- Responsive `<Image>` component output (markdown image syntax is sufficient; Astro's build pipeline handles optimization)

## [0.2.0] — 2026-05-28

**Pass 2: 5 more Gutenberg blocks + pages.** Additive to 0.1.0.

### Added

- 4 new IR block variants: `list`, `quote`, `code`, `separator`
- `core/list` mapping for WP 6.0+ flat lists (with `core/list-item` innerBlocks); ordered + unordered
- `core/quote` mapping with optional `<cite>` extraction
- `core/code` mapping with HTML-entity decode of inner code text + optional `language` attribute
- `core/separator` mapping → MDX `<hr />`
- WordPress page emission: `wp:post_type === "page"` items now produce `src/content/pages/<slug>.mdx`
- Emitted Astro `src/content/config.ts` now declares both `posts` and `pages` collections
- `Page.date` is optional — WordPress's `0000-00-00 00:00:00` sentinel is honored as "no date"
- Per-collection slug namespaces: a post and a page may share a slug
- CLI output reports both post and page counts

### Changed

- **IR version: `0.1.0` → `0.2.0`** (breaking for external IR consumers; `SiteSchema.pages` is now `Page[]` instead of `never[]`)
- Pre-6.0 flat `core/list` blocks now produce a more specific TODO marker: `unmapped block: core/list (pre-6.0 flat structure)`
- Pass 1 fixture's expected `another-post.mdx` and `config.ts` updated to reflect the new TODO string and the added `pages` collection (additive; MDX output otherwise unchanged)

### Still deferred

- Nested lists (any vintage) — raw fallback with TODO
- Image pipeline (`core/image`, sharp WebP, `<Image>` rewriting) — Pass 3
- WordPress REST adapter — Pass 4
- SEO metadata (Yoast / RankMath) — Pass 5
- 301 redirect maps — Pass 6
- Code-block syntax highlighting — out of v1

## [0.1.0] — 2026-05-28

**Pass 1: WXR → Astro spine slice.** First public release.

### Added

- CLI `wp-to-astro migrate <wxr-file> --out <dir> [--force]`
- WordPress WXR XML adapter (`@wordpress/block-serialization-default-parser` based)
- `core/paragraph` and `core/heading` Gutenberg block mappings
- Raw-block fallback for any unmapped Gutenberg block (`{/* TODO: unmapped block: ... */}`)
- HTML-entity decode pass for re-imported WordPress content
- Astro emitter:
  - `src/content/posts/<slug>.mdx` one file per post
  - `src/content/config.ts` Astro content collection
  - `package.json` skeleton with astro + @astrojs/mdx
  - `git init` + `"Initial migration from WXR"` commit
- Versioned Zod IR (`IR_VERSION = "0.1.0"`) — the contract between source adapters and emitters
- 34-test suite (unit + golden-file) covering schema, block mapping, entity decode, render, dedupe, security
- Path-traversal-safe slug derivation (`<wp:post_name>` is always passed through `slugify`)
- Duplicate-slug detection (refuses to silently overwrite)
- `--force` flag required for non-empty output directories

### Known limitations (deferred)

- Only `wp:post_type === "post"` items are emitted (pages, attachments, custom post types skipped)
- No image pipeline (WebP, `<Image>` rewrite) — Pass 2
- No WordPress REST adapter — Pass 3
- No SEO metadata (Yoast / RankMath) — Pass 3
- No 301 redirect map — Pass 4
- No support for ACF, Elementor, Divi, WooCommerce — out of v1 scope

See `docs/spec-pass-1.md` for the full scope.
