# Changelog

All notable changes to wp-to-astro will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
