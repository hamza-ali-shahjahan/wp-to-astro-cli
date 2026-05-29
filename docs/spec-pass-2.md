# Spec — Pass 2: 5 more blocks + pages

**Status:** Locked. v0.2.0.
**Builds on:** Pass 1 (`docs/spec-pass-1.md`). Read that first.
**Last updated:** 2026-05-28.

## Goal

Make the migrated Astro project usable for a real blog: list items, quotes, code, separators, and pages — not just paragraphs and headings.

## In scope

### New IR block variants (4 new, plus 1 helper)

| Variant       | IR shape                                                                        |
| ------------- | -------------------------------------------------------------------------------- |
| `list`        | `{ type: 'list', ordered: boolean, items: ListItem[] }`                          |
| `list-item`*  | `{ text: string }` — internal, only appears inside `list.items`                  |
| `quote`       | `{ type: 'quote', text: string, citation?: string }`                             |
| `code`        | `{ type: 'code', language?: string, content: string }`                           |
| `separator`   | `{ type: 'separator' }`                                                          |

\* `list-item` is a structural helper, not a top-level block variant in the discriminated union.

### New IR top-level type

```ts
type Page = {
  slug: string;
  title: string;
  date?: string;          // pages don't always have a meaningful date
  excerpt?: string;
  blocks: Block[];
};
```

`SiteSchema.pages` becomes `z.array(PageSchema)` (was `z.array(z.never())` in Pass 1).

### Gutenberg block mapping

| WP block          | → IR                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `core/list` (modern, with `core/list-item` innerBlocks) | `list` with `items` parsed from innerBlocks |
| `core/list` (pre-6.0, flat HTML innerHTML)              | `raw` with TODO — keep Pass 1 fallback     |
| `core/list-item`  | Handled inside list parsing; never standalone                                 |
| `core/quote`      | `quote` — text from inner `<p>`, citation from `<cite>` if present            |
| `core/code`       | `code` — content from `<code>` inner text, language from `attrs.language` if present |
| `core/separator`  | `separator`                                                                    |
| Nested lists      | Pre-6.0 nesting falls through to raw. Modern nested lists also fall through in Pass 2 — flat lists only. |

### Page emission

- WXR `<item>` with `wp:post_type === "page"` → IR `Page`
- Written to `src/content/pages/<slug>.mdx`
- Frontmatter omits `date` if not present in source (Astro schema marks date optional for pages)
- Pages share the same slug-safety + de-dupe rules as posts
- Posts and pages have separate slug namespaces (a post and a page may share `slug: 'about'`)

### Astro content-collection schema (emitted)

```ts
import { defineCollection, z } from "astro:content";

const postSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: z.string(),
  excerpt: z.string().optional(),
});

const pageSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: z.string().optional(),
  excerpt: z.string().optional(),
});

export const collections = {
  posts: defineCollection({ type: "content", schema: postSchema }),
  pages: defineCollection({ type: "content", schema: pageSchema }),
};
```

## Out of scope (deferred)

- **Nested lists** (both pre-6.0 and modern) → fall through to raw with TODO
- **Image pipeline** (`core/image`, sharp WebP, `<Image>` rewriting) → Pass 3
- **WordPress REST API** → Pass 4
- **SEO metadata** (Yoast, RankMath) → Pass 5
- **Redirect maps** → Pass 6
- **Code-block syntax-highlighting integration** (Shiki / Prism) → out of v1 scope
- **Quote citation rich-text fidelity** → preserve as plain text in Pass 2

## Contracts

### IR contract (v0.2.0)

```ts
const IR_VERSION = "0.2.0" as const;

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "quote"; text: string; citation?: string }
  | { type: "code"; language?: string; content: string }
  | { type: "separator" }
  | { type: "raw"; html: string; todo: string };

type ListItem = { text: string };

type Page = {
  slug: string;
  title: string;
  date?: string;
  excerpt?: string;
  blocks: Block[];
};

type Site = {
  version: "0.2.0";
  posts: Post[];
  pages: Page[];     // was never[] in 0.1.0
};
```

**Breaking from 0.1.0:** the `version` literal changes; the `pages` shape changes. Anyone consuming the IR externally must update.

## Acceptance criteria

1. **Pass 1 regression intact.** Old `test/migrate.golden.test.ts` still passes, byte-identical output, with one expected change: the version literal in IR is `"0.2.0"` (but that doesn't surface in MDX output, so the fixture file diff remains zero).
2. **New unit tests green.**
   - `list-block.test.ts` — modern WP list parses to `list` with correct items + ordered flag; pre-6.0 falls through to raw
   - `quote-block.test.ts` — text + optional citation extracted
   - `code-block.test.ts` — content + optional language extracted
   - `separator-block.test.ts` — emits the singleton variant
   - `page-emission.test.ts` — pages land in `src/content/pages/`, frontmatter omits `date` when source had none
3. **Pass 2 golden test green.** New `test/fixtures/input/sample-pass2.wxr` (3 posts exercising new blocks + 2 pages) → `test/fixtures/expected-pass2/` tree.
4. **`astro check` clean** on the dogfood output that includes pages.
5. **Backwards compat path:** running the CLI against the original Pass 1 fixture continues to produce byte-identical output to the Pass 1 expected tree (with the trivial caveat that no MDX file ever shows IR_VERSION).

## Risks specific to Pass 2

1. **Modern WP list-item innerHTML may have a stray closing `</li>` if Gutenberg trimmed text** — handle with the same `extractWrappedText` helper used in Pass 1, scoped to `li`.
2. **`<cite>` citation may be wrapped in any inline tag** (`<em>`, `<strong>`) — Pass 2 strips only the outer `<cite>` tag and preserves inline HTML as-is.
3. **Code blocks** often contain MDX-hostile characters (`{`, `}`, `<`). We emit them inside a triple-backtick fence so MDX treats the content as a literal — no escaping needed.
4. **Empty pages collection breaks Astro's `getCollection("pages")`** if no pages exist. We always emit the `pages` collection in `content/config.ts`, but only create files when there are pages. Astro tolerates an empty collection dir.
