# Plan — Pass 3 tasks

Derived from `docs/spec-pass-3.md`.

| # | Task | Acceptance | Depends on |
|---|------|-----------|------------|
| T0 | Install `sharp`, bump IR to 0.3.0 with `ImageBlock` | `pnpm install` clean; existing IR schema tests updated for new version literal | — |
| T1 | Pass 3 fixtures + failing tests | `sample-pass3.wxr` + `expected-pass3/` tree (skipImages mode) + per-block unit tests + pipeline unit test with stub fetcher | T0 |
| T2 | Map `core/image` in `wxr/blocks.ts` | Tests in `image-block.test.ts` pass | T1 |
| T3 | `render-block.ts` image case | Tests in `image-render.test.ts` pass; trailing `\n\n` invariant respected | T1 |
| T4 | `image-pipeline.ts` — download + sharp WebP + urlMap | `image-pipeline.test.ts` passes (stub fetcher); files written, skips logged | T0 |
| T5 | Wire pipeline into `emitAstro` | Pass 3 golden green (`skipImages: true`); integration test green (`skipImages: false`, stub fetcher) | T2, T3, T4 |
| T6 | `--skip-images` CLI flag | `node bin/wp-to-astro.mjs migrate ... --skip-images` keeps URLs remote | T5 |
| T7 | Pass 1 + Pass 2 regression | Both prior goldens byte-identical | T5 |
| T8 | Five-axis review | Network/sharp/SSRF surface examined; blockers fixed | T7 |
| T9 | Dogfood + astro check | `astro check` clean on Pass 3 dogfood | T8 |
| T10 | CHANGELOG 0.3.0, version bump, commit | Committed on top of `fb5f178` | T9 |

## Implementation notes

- **Fetcher pattern.** `emitAstro` accepts an optional `fetcher: ImageFetcher`. Default is `defaultFetcher` (native fetch). Tests pass in a stub returning fixture image bytes.
- **Filename derivation.** `slugify(basename-without-ext) + "-" + sha256(buffer)[0..8] + ext`. The sha-prefix ensures stability + dedup of identical content; the basename keeps the path human-readable.
- **Where the rewrite happens.** The pipeline produces `urlMap: Map<originalUrl, mdxRelPath>`. Before rendering each post/page, the emitter maps over `blocks` and substitutes `image.src` from the map. The IR object itself is not mutated — a derived copy is rendered. Keeps the source IR untouched for testability.
- **Pre-Astro markdown image syntax.** Render `![alt](src)` for the image and `\n*caption*\n` for the caption when present. Astro/MDX with the default rehype/remark plugins picks up these references at build time and routes through the optimization pipeline if the path resolves inside `src/`.
- **Skip the pipeline cleanly.** When `opts.skipImages === true`, processImages is not called and the image src in each block stays as the original URL. The golden test exercises this path.
- **Sharp options.** `.webp({ quality: 80 })` — reasonable default for marketing/blog imagery. No `.lossless()` (heavier files), no `.nearLossless()` (slower). Pass 5+ can expose tuning.
- **Determinism.** Concurrency 4 means image download order is non-deterministic, but the urlMap and filesWritten are stable because they're keyed/sorted by URL.

## Out of Pass 3

- `core/gallery`, `core/cover` (Pass 4)
- Retry / backoff
- SSRF allowlists (Pass 5+)
- Pipeline progress indicator (nice-to-have, defer)
- Animated GIF → MP4
- WebP byte-identical golden checks
