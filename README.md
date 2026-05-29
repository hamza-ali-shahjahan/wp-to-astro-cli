# wp-to-astro

> Open-source CLI that migrates WordPress sites to clean Astro + MDX codebases.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Status:** Pass 1 (alpha). WXR XML in → Astro MDX project out. `core/paragraph` and `core/heading` blocks are mapped; everything else is preserved as raw HTML with a TODO marker. See `docs/spec-pass-1.md`.

Output is designed for AI-agent editing. More on that soon.

## Install

```bash
pnpm add -g wp-to-astro
# or run directly
npx wp-to-astro migrate path/to/wordpress.xml --out ./my-astro-site
```

## Usage

```bash
# In WordPress admin: Tools → Export → Download Export File (choose "All content").
# That gives you a .xml file (WXR format). Then:

wp-to-astro migrate ./my-wordpress-export.xml --out ./my-astro-site --force
```

The output directory will contain:

```
my-astro-site/
├── src/
│   └── content/
│       ├── config.ts            # Astro content collection schema
│       └── posts/
│           ├── hello-world.mdx
│           └── …
├── package.json                 # astro + @astrojs/mdx deps (not yet installed)
└── .git/                        # initial commit "Initial migration from WXR"
```

Then:

```bash
cd ./my-astro-site
pnpm install
pnpm add astro @astrojs/mdx
npx astro check
```

## What's mapped today (Pass 1)

| Source                        | Result                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| `core/paragraph`              | Markdown paragraph                                            |
| `core/heading` (level 2–6)    | Markdown `##`, `###`, `####`, `#####`, `######`               |
| `core/heading` (level 1)      | Clamped to `##` (h1 belongs to the page layout, not content)  |
| Any other block               | Raw HTML wrapped in MDX `{/* TODO: unmapped block: ... */}`   |
| Pages, attachments, CPTs      | Skipped (Pass 1 only emits posts)                             |
| ACF, Yoast, RankMath, redirects | Not yet — see roadmap                                       |

## Roadmap

| Pass | Focus                                                                   |
| ---- | ----------------------------------------------------------------------- |
| 1    | WXR → Astro spine: paragraph + heading mapping (**this release**)       |
| 2    | +5 core Gutenberg blocks, image pipeline (sharp → WebP), pages          |
| 3    | WordPress REST adapter, Yoast / RankMath SEO metadata                   |
| 4    | 301 redirect map, polished Astro starter templates, `verify` command    |
| 5+   | Hosted dashboard, ACF Pro, AI rewrite pass                              |

## Development

```bash
pnpm install
pnpm test              # vitest
pnpm build             # tsc → dist/
pnpm dev migrate ...   # tsx-driven, no build needed
```

## License

Apache-2.0. See [LICENSE](./LICENSE).
