# AI Native CMS — wp-to-astro CLI

## Project context

Open-source CLI that migrates WordPress sites to clean Astro + MDX codebases. Apache-2.0. The wedge for a longer-term Native AI CMS thesis: file-based MDX content that AI agents can edit cleanly. Built as a TypeScript Node CLI with a `source-adapter → IR → emitter` architecture so additional sources (Webflow, Framer, Ghost) and emitters (Next, Hugo) can be added later.

**Current state: Pass 1 (spine slice).** WXR XML input → IR → Astro MDX output, only `core/paragraph` and `core/heading` mapped, everything else preserved as `RawBlock` with a TODO marker. See `docs/spec-pass-1.md`.

Stack: TypeScript on Node ≥20.11, pnpm, commander, fast-xml-parser, `@wordpress/block-serialization-default-parser`, zod, yaml, simple-git, vitest.

## Commands

```bash
pnpm install              # install deps
pnpm build                # tsc → dist/
pnpm test                 # vitest run
pnpm test:watch           # vitest --watch
pnpm dev <args>           # tsx src/cli/index.ts <args>
node bin/wp-to-astro.mjs migrate <wxr> --out <dir>   # post-build dogfood
```

## Code style

- **No default exports.** Named exports only; barrels (`index.ts`) re-export with explicit names.
- **Zod is the source of truth** for IR shapes — TypeScript types come from `z.infer`, never hand-written.
- **Source adapters return parsed IR.** They never write files. Emitters never parse source. Don't blur this boundary.
- **Pure functions for transforms.** `render-block.ts`, `frontmatter.ts`, and anything in `src/util/` must be side-effect-free. File I/O lives only in `emitters/astro/index.ts` and `cli/migrate.ts`.
- **Errors carry context.** Throw `Error` subclasses with the offending input identifier (post slug, block name) in the message — bare `throw new Error("invalid")` is a code smell.

## Gotchas

- **WXR `content:encoded` is CDATA and may contain HTML-entity-escaped Gutenberg comments** (`&lt;!-- wp:paragraph --&gt;`). Decode entities *before* feeding the block parser or every post silently falls through to `raw`. Tested in `wxr/blocks.test.ts`.
- **`fast-xml-parser` default settings disable XXE/entity expansion** — keep `processEntities: true, htmlEntities: false` and do NOT enable external DTD loading. WXR is untrusted user input.
- **MDX is whitespace-sensitive.** `render-block.ts` must end every block with exactly one trailing `\n\n`; the joiner concatenates without adding more.
- **`simple-git` init+commit fails without git identity.** Pass repo-local `config: ['user.email=bot@local', 'user.name=wp-to-astro']` on init. Golden test asserts on file tree, not on commit success.
- **Node 25 is newer than the engine declares (≥20.11).** Some npm packages warn; we accept that. The CI matrix (when added) will pin to 20 + 22 LTS.

## Reference docs

- `docs/spec-pass-1.md` — read when working on any Pass 1 task; defines scope, IR contract, acceptance criteria.
- `docs/research-report.md` — read when scoping future passes or when a design call needs strategic grounding (pricing, OSS split, launch sequence).
- `docs/decisions.md` — read when revisiting a stack choice (pnpm vs npm, Apache vs AGPL, etc.) before reopening the debate.
- `.claude/rules/*.md` — auto-load when editing the matching subsystem. Don't ignore them.
