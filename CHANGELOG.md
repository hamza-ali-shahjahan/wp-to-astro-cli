# Changelog

All notable changes to wp-to-astro will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
