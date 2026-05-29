---
paths: ["src/emitters/astro/**"]
---

# Astro emitter rules

- **`render-block.ts` is pure.** Input: IR `Block`. Output: string. No I/O, no globals, no Date.now(). Trivial to unit test; keep it that way.
- **Every rendered block ends with exactly one `\n\n`.** The joiner does not add separators. Golden test will fail if you double up.
- **Frontmatter is YAML between `---` fences.** Use `yaml.stringify` from the `yaml` package — never hand-roll. Keys: `title`, `slug`, `date`, optional `excerpt`. Sort keys deterministically (alpha) for stable diffs.
- **File I/O lives in `index.ts`** (the orchestrator). `render-block.ts` and `frontmatter.ts` return strings; `index.ts` writes them. Don't reach for `fs` outside `index.ts`.
- **`simple-git` init failure is non-fatal for the migration**, but the error must be surfaced to the CLI layer with a clear "files written, git init failed: <reason>" message. Don't swallow it.
- **Templates live in `templates/` as `.tmpl` files** loaded via `fs.readFileSync` at emit time. Keep them tiny and string-substitution-only — no real templating engine.
