# Plan — Pass 2 tasks

Derived from `docs/spec-pass-2.md`. TDD order: bump IR + extend fixtures + new failing tests, then extend adapter, then extend emitter.

## Task list

| # | Task | Acceptance | Depends on |
|---|------|-----------|------------|
| T0 | Bump IR to 0.2.0 + extend schema | `IR_VERSION === "0.2.0"`; new block variants + `PageSchema`; existing schema tests updated for the new version literal | — |
| T1 | Pass 2 fixtures + golden | `test/fixtures/input/sample-pass2.wxr` + `test/fixtures/expected-pass2/` committed; `test/migrate.golden-pass2.test.ts` red until impl | T0 |
| T2 | Per-block unit tests | `test/list-block.test.ts`, `test/quote-block.test.ts`, `test/code-block.test.ts`, `test/separator-block.test.ts` — initially red | T0 |
| T3 | Extend WXR block mapper | `parseContentBlocks` maps the 4 new block types; modern lists with `core/list-item` innerBlocks → typed `list`; pre-6.0 lists → raw fallback retained | T2 |
| T4 | Extend WXR adapter for pages | `parseWxr` filters `wp:post_type === "page"` into IR `Page`s with optional date; posts unchanged | T0 |
| T5 | Extend Astro `render-block` | Cases for `list`, `quote`, `code`, `separator`. Invariant: every variant ends with `\n\n` | T0 |
| T6 | Extend Astro emitter for pages | Writes `src/content/pages/<slug>.mdx`; updated `content/config.ts` template includes `pages` collection; slug de-dupe is per-collection (posts and pages are separate namespaces) | T4, T5 |
| T7 | Frontmatter handles optional date | Pages without date omit the `date:` key cleanly | T0 |
| T8 | Pass 2 golden green | `migrate.golden-pass2.test.ts` passes end-to-end | T3–T7 |
| T9 | Pass 1 golden still green | Original `migrate.golden.test.ts` byte-identical | T8 |
| T10 | Five-axis review | Diff reviewed; blockers fixed | T9 |
| T11 | Dogfood + astro check on Pass 2 output | `npx astro check` reports 0 errors with posts + pages | T10 |
| T12 | Commit + CHANGELOG entry | `0.2.0` entry; commit on the project repo | T11 |

## Implementation notes

- **Modern WP list shape.** A `core/list` block with WP 6.0+ has `innerBlocks: [core/list-item, core/list-item, ...]`. Each `core/list-item`'s innerHTML is `<li>...text...</li>` (possibly wrapped in newlines). If a list has **no** innerBlocks (pre-6.0 or hand-written), keep the existing raw fallback — do not attempt HTML parsing.
- **Quote shape.** Gutenberg quote innerHTML is roughly `<blockquote class="wp-block-quote"><p>Text.</p><cite>Author</cite></blockquote>`. Citation is optional. The `<cite>` element may also be missing — that's the common case for unattributed quotes.
- **Code shape.** Gutenberg code innerHTML is `<pre class="wp-block-code"><code>content</code></pre>`. Inside `<code>`, HTML entities are escaped (`&lt;`, `&gt;`, `&amp;`). We decode them back to raw characters before emitting inside a triple-backtick fence — MDX treats fenced content as literal so no further escaping is needed.
- **Separator shape.** Gutenberg separator innerHTML is `<hr class="wp-block-separator has-alpha-channel-opacity"/>`. We ignore innerHTML and emit a markdown `---` separator (Pass 2 uses thematic break syntax).
- **Page slug namespace.** A post and a page may legally share `slug: "about"`. The emitter's `seenSlugs` set lives per-collection.
- **Frontmatter optional date.** `buildFrontmatter` already filters undefined entries; ensure `meta.date` can be `undefined` for pages without changing the existing post call sites (which always pass a string).
- **Backwards compat:** the original `sample.wxr` Pass 1 fixture exercises pre-6.0 `core/list` which keeps falling through to raw — the Pass 1 golden test stays green by construction.

## What stays out of Pass 2

- Nested lists (any vintage) — raw fallback
- Anything image-related (Pass 3)
- Anything REST or SEO-related (Pass 4+)
- Code highlighting (out of v1)
