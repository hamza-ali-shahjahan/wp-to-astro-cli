# Plan — Pass 1 tasks

Derived from `docs/spec-pass-1.md`. TDD order: tests + fixtures first, then implementation bottom-up.

## Task list

| # | Task | Acceptance | Depends on |
|---|------|-----------|------------|
| T0 | Scaffold tooling | `pnpm install` succeeds; `pnpm exec tsc --noEmit` runs (with no source files yet, exits 0); vitest discoverable | — |
| T1 | Fixtures + failing tests | `test/fixtures/input/sample.wxr` + `test/fixtures/expected/**.mdx` committed; `pnpm test` runs and fails (no impl yet) | T0 |
| T2 | IR schema | `src/ir/schema.ts` exports `IR_VERSION`, `BlockSchema`, `PostSchema`, `SiteSchema`. Round-trip unit test green. | T1 |
| T3 | WXR XML parser | `src/source-adapters/wxr/xml.ts` parses fixture; unit test extracts ≥1 post with `content:encoded` non-empty | T2 |
| T4 | Gutenberg block mapper | `src/source-adapters/wxr/blocks.ts` maps paragraph + heading correctly; everything else → `raw` with TODO; HTML-entity-decode test passes | T3 |
| T5 | WXR adapter composition | `src/source-adapters/wxr/index.ts` exports `parseWxr(filepath)`; returns a `SiteSchema`-valid object | T4 |
| T6 | Render-block pure fn | `src/emitters/astro/render-block.ts` per-variant unit tests green; trailing `\n\n` invariant covered | T2 |
| T7 | Frontmatter helper | `src/emitters/astro/frontmatter.ts` round-trip test: title/slug/date in → valid YAML between `---` fences out | T2 |
| T8 | Astro emitter | `src/emitters/astro/index.ts` writes posts + config + package.json; git init+commit; non-empty-dir guard | T5, T6, T7 |
| T9 | CLI wiring | `src/cli/{index,migrate}.ts` + `bin/wp-to-astro.mjs`; help/usage/error paths exit with correct codes | T8 |
| T10 | Golden test green | `test/migrate.golden.test.ts` passes end-to-end on fixture | T9 |
| T11 | Five-axis review | Diff reviewed for correctness, readability, architecture, security (XXE), performance; blockers fixed | T10 |
| T12 | Ship checklist | All acceptance criteria from spec §"Acceptance criteria" satisfied; initial project git commit recorded | T11 |

## Implementation notes

- **`fast-xml-parser` options:** `{ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true, htmlEntities: false, allowBooleanAttributes: true, cdataPropName: '__cdata' }` — preserves CDATA payload, decodes XML entities, no DTD/external entity loading.
- **HTML entity decode:** before feeding `content:encoded` to the Gutenberg parser, replace `&lt;` / `&gt;` / `&amp;` / `&quot;` / `&#39;` and decimal/hex numeric entities. Keep this in `wxr/blocks.ts` as a private `decodeEntities` helper — no `he` dependency needed for the v1 surface.
- **Slug derivation:** prefer `<wp:post_name>` if present and non-empty; else slugify the title (lowercase, `[^a-z0-9-]` → `-`, collapse runs of `-`, trim).
- **Date format:** WXR uses `<wp:post_date_gmt>` in `YYYY-MM-DD HH:MM:SS` UTC. Convert to ISO 8601 (`new Date(value + 'Z').toISOString()`); if invalid, fall back to `<pubDate>` (RFC 822); if both invalid, throw.
- **Heading level coerce:** Gutenberg stores `attrs.level` as a number 1–6. Pass 1 clamps `1` to `2` (we never emit `<h1>` from content — that belongs to the page layout).
- **MDX escape:** in paragraph text, escape `{` and `}` to prevent accidental JSX interpretation. We do not escape inside `raw` blocks — they're already opaque HTML.

## Status legend (used in build messages)

- 🟡 in_progress — task active
- ✅ done — acceptance criteria satisfied
- 🔁 revising — review surfaced a blocker, fixing
