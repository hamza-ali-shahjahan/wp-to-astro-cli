# wp-to-astro

> Open-source CLI that migrates WordPress sites to clean Astro + MDX codebases.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Status:** Alpha (v0.6.1). Supports both WXR XML files and live WordPress installs via REST. Output is designed for AI-agent editing — discrete `.mdx` files with deterministic frontmatter schemas. More on that soon.

## Install

```bash
pnpm add -g wp-to-astro
# or run directly without installing
npx wp-to-astro migrate path/to/wordpress.xml --out ./my-astro-site
```

## Usage

### From a WXR XML export (offline, no auth needed)

```bash
# In WordPress admin: Tools → Export → All content → Download Export File.
wp-to-astro migrate ./my-wordpress-export.xml --out ./my-astro-site --force
```

### From a live WordPress install (REST, needs an Application Password)

1. In WP admin: **Users → Profile → Application Passwords** → generate one named e.g. `wp-to-astro`. WordPress shows a 24-character space-separated value.
2. Run:

```bash
wp-to-astro migrate https://example.com --out ./my-astro-site \
  --auth-user my_admin \
  --auth-pass "xxxx xxxx xxxx xxxx xxxx xxxx"

# Or via env vars (recommended for CI / shell history hygiene)
WP_AUTH_USER=my_admin WP_AUTH_PASS='xxxx xxxx xxxx xxxx xxxx xxxx' \
  wp-to-astro migrate https://example.com --out ./my-astro-site --force
```

The output directory contains:

```
my-astro-site/
├── src/
│   ├── assets/images/                # downloaded + WebP-converted assets
│   │   └── photo-abc12345.webp
│   └── content/
│       ├── config.ts                 # Astro content-collection schema (posts + pages + seo)
│       ├── posts/
│       │   ├── hello-world.mdx
│       │   └── …
│       └── pages/
│           └── about.mdx
├── package.json                      # astro + @astrojs/mdx deps (not yet installed)
├── _redirects                        # Netlify 301s from old WP URLs
├── vercel.json                       # Vercel 301s (same map)
└── .git/                             # initial commit "Initial migration from WXR"
```

Then:

```bash
cd ./my-astro-site
pnpm install
pnpm add astro @astrojs/mdx
npx astro check
```

### Verify a migrated project

```bash
wp-to-astro verify ./my-astro-site
```

Structural sanity check — validates `config.ts`, `package.json`, MDX frontmatter, and redirect files. Doesn't run `astro build` (do that yourself when ready).

## What's mapped today (v0.6.1)

| Gutenberg block               | Result                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| `core/paragraph`              | Markdown paragraph (inline HTML preserved)                    |
| `core/heading` (level 2–6)    | `##`–`######`                                                 |
| `core/heading` (level 1)      | Clamped to `##` (h1 belongs to the page layout)               |
| `core/list` (WP 6.0+, flat)   | Markdown `-` / `1.` list (ordered + unordered)                |
| `core/list` (pre-6.0 or nested) | Raw HTML with TODO marker                                   |
| `core/quote`                  | Markdown blockquote + optional `— Citation` paragraph         |
| `core/code`                   | Triple-backtick fence + optional language                     |
| `core/separator`              | `<hr />`                                                      |
| `core/image`                  | Downloaded, PNG/JPG → WebP via `sharp`, MDX `![alt](path)`    |
| Any other block               | Raw HTML wrapped in `{/* TODO: unmapped block: ... */}`       |

| Other                         | Result                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| Pages (`wp:post_type=page`)   | `src/content/pages/<slug>.mdx`                                |
| Yoast SEO postmeta (WXR)      | Nested `seo:` block in MDX frontmatter                        |
| Yoast `yoast_head_json` (REST) | Same — `seo: { title, description, canonical, robots, ogImage, … }` |
| WordPress permalink structure | `_redirects` (Netlify) + `vercel.json` (Vercel) 301 maps      |
| ACF, RankMath, Elementor, Divi | **Not supported** — see roadmap                              |

## Known compatibility issues (read before you migrate something you care about)

End-to-end tested against the canonical [WordPress Theme Unit Test Data](https://github.com/WordPress/theme-test-data) (58 posts + 21 pages). The migration completes cleanly and the output passes structural verification, but **~77% (44 of 57) of those posts render in `astro dev` without manual cleanup**. The remaining 13 hit one or more of these v0.7-tracked issues:

- **Unclosed void HTML tags** (`<br>`, `<hr>`, `<img>` without `/`) — valid HTML, invalid in MDX/JSX. Common in classic-editor content; needs sanitization at emission time.
- **HTML comments inside body content** (`<!-- … -->`) — MDX wants `{/* … */}` syntax.
- **Stray `<` or `!` characters** from old classic-editor raw HTML — MDX parser chokes.
- **WordPress permalink structure not exposed via `/wp-json/wp/v2/settings`** — so REST-source migrations don't auto-generate redirects (WXR-source works because the structure is implicit in the post URLs).
- **Non-Latin script slugs** (Greek, Arabic, etc.) currently URL-encode to hex strings — slugify needs a non-Latin fallback.

If you're trying this on a real site, expect ~1 in 7 posts to need a hand-edit. The v0.7 release will close most of this gap; in the meantime the unmapped content is preserved as raw HTML with a `{/* TODO: unmapped block ... */}` marker so nothing is silently lost — you can search for those markers in the migrated MDX files and either fix or accept.

The 44 that *do* migrate cleanly include all the common content shapes (paragraphs, headings, lists, images, quotes, code blocks, separators, pages with SEO metadata, redirect maps for date-based permalinks). For a modern (post-2020) WordPress blog where most content was authored in the block editor, the success rate is typically much higher than the theme-test fixture's 77% — the fixture is deliberately exhaustive of edge cases.

## CLI reference

```bash
wp-to-astro migrate <source> --out <dir> [options]
  source                  WXR file path OR https:// URL of a live WP install
  -o, --out <dir>         Output directory for the Astro project (required)
  -f, --force             Overwrite a non-empty output directory
  --skip-images           Skip the image download/conversion pipeline
  --auth-user <user>      WP username (REST only; env: WP_AUTH_USER)
  --auth-pass <pw>        WP Application Password (REST only; env: WP_AUTH_PASS)

wp-to-astro verify <site-dir>
  Lightweight structural sanity check on a migrated project.

wp-to-astro --version    Print the version and exit
wp-to-astro --help       Print help and exit
```

## Security notes

A few things worth knowing before you point this at someone else's WordPress install:

- **Image URLs are fetched as-is.** `core/image` blocks reference URLs that the WXR or REST source supplies. The default fetcher rejects non-`http(s)` schemes but does NOT filter private IPs. If you're migrating an export you didn't generate yourself, use `--skip-images` (URLs stay remote) until an allowlist flag lands.
- **Unmapped Gutenberg blocks are emitted as raw HTML.** If the source WXR contains a `<script>` (e.g. from a custom embed block or a malicious WXR), it ends up inside an MDX file. Astro will execute it at build time / page-view time. Inspect the `{/* TODO: unmapped block ... */}` markers in your migrated content before deploying if the source isn't trusted.
- **WXR files are size-capped at 200 MB.** Larger exports must be split or migrated via REST.
- **Application Passwords on argv are visible in `ps`.** Prefer `WP_AUTH_USER` / `WP_AUTH_PASS` env vars.
- **CDATA + entity-encoded Gutenberg comments are normalized**, but the underlying XML parser (`fast-xml-parser`) is configured to refuse external DTDs and entity expansion — XXE is not a path.

## Architecture

`source-adapter → IR → emitter`. The IR (intermediate representation) is a versioned Zod schema in `src/ir/schema.ts` — adapters parse to IR, emitters render from IR. Each side is independently testable and swappable. See `docs/decisions.md`.

Current adapters: WXR XML, WordPress REST API.
Current emitter: Astro + MDX.

Add a new source: implement `parse<X>(input) → Site` matching the IR.
Add a new emitter: implement `emit<X>(site, outDir, opts) → EmitResult`.

## Roadmap

Done in 6 passes (this v0.6.1 release):

| Pass | Focus                                                              |
| ---- | ------------------------------------------------------------------ |
| 1    | WXR spine: paragraph + heading                                     |
| 2    | List, quote, code, separator + pages                               |
| 3    | Image pipeline (sharp WebP, asset rewrite)                         |
| 4    | WordPress REST adapter (Application Password auth)                 |
| 5    | Yoast SEO postmeta + `yoast_head_json` → MDX frontmatter           |
| 6    | 301 redirect map (Netlify + Vercel) + `verify` subcommand          |

Deferred to future passes:

- More Gutenberg blocks: `core/gallery`, `core/cover`, `core/embed`, `core/table`, `core/buttons`, `core/columns` (nested-content blocks)
- Premium adapters: ACF Pro fields, Elementor templates, Beaver Builder, Divi
- RankMath SEO postmeta + `rank_math_head` HTML parsing
- Nested lists (currently fall through to raw)
- AI rewrite layer (Claude/GPT pass to clean up legacy formatting, generate missing alt text)
- Hosted dashboard (Next.js + Supabase + Stripe + GitHub App + Inngest queue)
- `--permalink <structure>` CLI override for WXR redirect generation
- `verify --build` flag to run `astro check` / `astro build`
- URL crawl + redirect health check
- `core/list` nested-list support
- WooCommerce product catalog static export
- SSRF allowlist for image downloads (currently trusts the source's URLs)

## Built with Hamzaish

wp-to-astro was built through [Hamzaish](https://github.com/hamza-ali-shahjahan/hamzaish), an AI-native startup factory — six gated passes from empty directory to a published npm package in two sessions. The `/full-cycle` orchestration ran setup → spec → plan → test → build → review → ship at every step; cross-product learnings from the build (output validation for codegen tools, OSS publishing gotchas, the "your `tool check` is the wrong check for content collections" pattern) went back into Hamzaish's brain so the next product moves faster.

What Hamzaish *didn't* save me from: its own #1 validation rule — "5 conversations with target-profile users before production code." I built six passes before talking to a single WordPress refugee. That's the current sprint; if you've migrated off WP recently and want a test migration for free, [open an issue](https://github.com/hamza-ali-shahjahan/wp-to-astro-cli/issues/new) and I'll run yours as the test case.

## Development

```bash
pnpm install
pnpm test              # vitest — 127 tests across 23 files
pnpm build             # tsc → dist/ + copy .tmpl templates
pnpm dev migrate ...   # tsx-driven, no build needed

# Manually verify after a change
node bin/wp-to-astro.mjs migrate test/fixtures/input/sample-pass5.wxr --out /tmp/out --force --skip-images
node bin/wp-to-astro.mjs verify /tmp/out
```

## License

Apache-2.0. See [LICENSE](./LICENSE).
