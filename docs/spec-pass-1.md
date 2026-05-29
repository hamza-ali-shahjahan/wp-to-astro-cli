# Spec — Pass 1: WXR → IR → Astro MDX spine slice

**Status:** Locked. v0.1.0.
**Last updated:** 2026-05-28.

## Goal

Prove the `source-adapter → IR → emitter` architecture end-to-end with the thinnest viable vertical slice. A user with a WordPress WXR export file can run one CLI command and get a deployable-shaped Astro project with their content as MDX files.

## In scope

- **Input:** a WXR XML file (WordPress Tools → Export → All content).
- **Output:** a directory containing a minimal Astro project skeleton:
  - `src/content/posts/<slug>.mdx` (one file per post)
  - `src/content/config.ts` (Astro content collection schema)
  - `package.json` (Astro + @astrojs/mdx as dependencies, no install)
  - Initial git commit on the output repo (best-effort; non-fatal on failure)
- **Block mappings:**
  - `core/paragraph` → MDX `<p>`-equivalent (markdown paragraph)
  - `core/heading` → markdown `#`/`##`/`###` based on `level` attribute (default 2)
  - Everything else → raw HTML wrapped in an MDX comment marker:
    ```
    {/* TODO: unmapped block: core/<name> */}
    <div>...original innerHTML...</div>
    ```
- **CLI:** `node bin/wp-to-astro.mjs migrate <wxr-file> --out <dir> [--force]`
  - Exit codes: 0 success, 1 usage error, 2 runtime failure
  - `--force` overwrites a non-empty `--out`; default refuses
- **Post-type filter:** only `wp:post_type === "post"` items are emitted. Pages, attachments, custom post types: silently dropped in Pass 1 (logged at INFO level).

## Out of scope (deferred, NOT a bug)

- Other Gutenberg blocks (image, list, quote, code, embed, columns, …) → Pass 2
- Pages (`wp:post_type === "page"`) → Pass 2
- WordPress REST API extraction → Pass 3
- Image downloads, WebP conversion, `<Image>` rewriting → Pass 2
- SEO metadata (Yoast, RankMath, OG tags) → Pass 3
- 301 redirect maps, permalink structure preservation → Pass 4
- Polished starter templates beyond a bare skeleton → Pass 4
- Hosted dashboard, Stripe, Supabase, queue workers → Pass 5+
- WooCommerce, ACF, Elementor, Divi, Beaver Builder → out of v1 entirely
- Multilingual (WPML / Polylang) → out of v1

## Contracts

### IR contract (v0.1.0)

```ts
const IR_VERSION = "0.1.0" as const;

// Block — discriminated union on `type`
type Block =
  | { type: "paragraph"; text: string }       // text may contain inline HTML
  | { type: "heading"; level: 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "raw"; html: string; todo: string };

type Post = {
  slug: string;          // url-safe, derived from <wp:post_name> or title
  title: string;
  date: string;          // ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
  excerpt?: string;      // optional, from <excerpt:encoded>
  blocks: Block[];
};

type Site = {
  version: typeof IR_VERSION;
  posts: Post[];
  pages: never[];        // reserved, always empty in Pass 1
};
```

The IR is defined via Zod schemas in `src/ir/schema.ts`; TypeScript types are inferred via `z.infer`. The constants above are the contract; the file is the source of truth.

### Adapter contract

```ts
parseWxr(filepath: string): Promise<Site>
```

- Reads the file from disk.
- Returns a `Site` that passes `SiteSchema.parse(...)`.
- Throws `WxrParseError` with the offending path or post identifier in the message on malformed input.

### Emitter contract

```ts
emitAstro(site: Site, outDir: string, opts: { force?: boolean }): Promise<EmitResult>

type EmitResult = {
  filesWritten: string[];   // relative paths
  posts: number;
  gitInitialized: boolean;  // false if git failed (with reason on stderr)
};
```

- Refuses to write if `outDir` is non-empty unless `opts.force === true`.
- Writes files atomically per file (write to `<path>.tmp` then rename).
- Runs `git init` and creates one commit titled `Initial migration from WXR`. Failure is reported but non-fatal — files remain written.

## Acceptance criteria

A Pass 1 build is accepted iff:

1. **Unit tests green.** `pnpm test` passes with at least:
   - IR schema round-trip test (parse + serialize identity for each block variant)
   - WXR XML parse test on the fixture
   - Gutenberg block mapping test (≥1 paragraph, ≥1 heading, ≥1 raw)
   - HTML-entity-decode regression test (escaped `<!-- wp:* -->` produces typed blocks)
   - `render-block` per-variant unit tests
2. **Golden test green.** `test/migrate.golden.test.ts` runs `parseWxr → emitAstro` against the fixture and tree-diffs the output vs `test/fixtures/expected/`. Zero differences.
3. **Build clean.** `pnpm exec tsc --noEmit` reports 0 errors. `pnpm build` produces `dist/cli/index.js`.
4. **Dogfood passes Astro check.** After running the CLI against the fixture into `/tmp/astro-out`, then `pnpm install && pnpm add astro @astrojs/mdx && npx astro check` reports 0 errors.
5. **CLI UX sane.**
   - `node bin/wp-to-astro.mjs --help` lists `migrate`.
   - `node bin/wp-to-astro.mjs migrate` (no args) exits 1 with a helpful usage error.
   - `node bin/wp-to-astro.mjs migrate test/fixtures/input/sample.wxr --out /tmp/astro-out` refuses if `/tmp/astro-out` is non-empty without `--force`.

## Risks (locked from the plan)

1. **CDATA + HTML-entity-encoded Gutenberg comments** — decode before block parse. Enforced by unit test.
2. **MDX whitespace fragility** — `render-block.ts` emits exactly one trailing `\n\n` per block; joiner adds none. Enforced by golden test.
3. **`simple-git` identity** — pass per-repo `config: ['user.email=bot@local', 'user.name=wp-to-astro']`. Golden test asserts on the file tree only.
4. **XML security** — `fast-xml-parser` default settings; no external DTDs, no entity expansion beyond safe defaults. Treat WXR as untrusted.

## Open questions

None blocking. Future-pass questions tracked in `docs/decisions.md` as they're resolved.
