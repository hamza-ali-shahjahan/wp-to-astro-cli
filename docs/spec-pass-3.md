# Spec — Pass 3: image pipeline

**Status:** Locked. v0.3.0.
**Builds on:** Pass 1 + Pass 2 (`docs/spec-pass-1.md`, `docs/spec-pass-2.md`).
**Last updated:** 2026-05-28.

## Goal

Turn WordPress media-library URLs into local, optimized assets. After Pass 3, a migrated site doesn't depend on the old WordPress install staying online — images live in the Astro project and are processed by Astro's image pipeline at build time.

## In scope

### New IR block variant

```ts
type ImageBlock = {
  type: "image";
  src: string;              // URL at parse time; rewritten to MDX-relative path by the emitter pipeline
  alt: string;              // empty string is allowed and common
  width?: number;
  height?: number;
  caption?: string;         // from <figcaption>; HTML preserved
};
```

### Gutenberg block mapping

`core/image` → IR `image`:
- `src` from `<img src="...">`
- `alt` from `<img alt="...">` (default: empty string)
- `width` / `height` from `attrs.width` / `attrs.height` if numeric (Gutenberg only stores these when the user explicitly sets dimensions; most images have them undefined)
- `caption` from `<figcaption>...</figcaption>` if present; inline HTML inside the caption is preserved

### Image pipeline (in the Astro emitter)

The emitter gains a `processImages` stage that runs **before** MDX rendering:

1. Collect all unique image URLs across `site.posts[].blocks` and `site.pages[].blocks` (where `block.type === "image"`).
2. For each URL, in parallel with a small concurrency cap, attempt to download.
3. Decide a stable on-disk filename from the URL: `<basename>-<sha256[0..8]>.<ext>`.
4. If the source is PNG / JPG / JPEG, convert to WebP via `sharp` (quality 80). Otherwise (GIF, SVG, WebP, AVIF), preserve bytes verbatim.
5. Write to `<outDir>/src/assets/images/<filename>`.
6. Build a `Map<originalUrl, mdxRelativePath>` (e.g. `"../../assets/images/photo-abc12345.webp"`).
7. When rendering MDX, look up each image block's `src` in the map; if found, substitute. If not (download failed, file too big, unknown extension), leave the original URL — graceful degradation.

### Failure handling

The pipeline must NEVER abort a migration on a single bad image. Specific failure modes, all logged to stderr, all fall through to "URL stays remote":

- HTTP error (4xx/5xx, DNS failure, timeout)
- Content-length > 5 MB (default; configurable later)
- Non-image content-type
- Sharp conversion throws (corrupt input, etc.)

### CLI surface

```bash
wp-to-astro migrate <wxr> --out <dir> [--force] [--skip-images]
```

- `--skip-images` skips the entire pipeline. Image URLs stay remote in MDX output. Useful offline or when the user wants to migrate media separately.

### Injection point for testability

`emitAstro(site, outDir, opts)` accepts `opts.fetcher?: ImageFetcher` — an optional callable that takes a URL and returns `{ ok: true, buffer, contentType } | { ok: false, reason }`. Defaults to a native-fetch implementation. Tests inject a stub returning fixture image bytes.

## Out of scope (deferred)

- Concurrent image download caps beyond a hardcoded 4 — Pass 5+
- Retry / exponential backoff — explicitly out
- Lazy / responsive `<Image>` component injection in MDX — markdown image syntax is sufficient; Astro's MDX pipeline handles optimization at build time
- `core/gallery` block — Pass 4
- Cover blocks (`core/cover`) with background images — Pass 4
- Animated GIF → MP4 conversion — out of v1
- Remote-URL allowlist / SSRF protection beyond same-origin assumption — see Risks

## Contracts

### IR v0.3.0

`Block` union gains `ImageBlock`:

```ts
type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "quote"; text: string; citation?: string }
  | { type: "code"; language?: string; content: string }
  | { type: "separator" }
  | { type: "image"; src: string; alt: string; width?: number; height?: number; caption?: string }
  | { type: "raw"; html: string; todo: string };
```

### Image pipeline API

```ts
type ImageFetcher = (url: string) => Promise<ImageFetchResult>;
type ImageFetchResult =
  | { ok: true; buffer: Buffer; contentType: string }
  | { ok: false; reason: string };

type ProcessImagesResult = {
  urlMap: Map<string, string>;   // originalUrl → MDX-relative path
  filesWritten: string[];        // relative to outDir
  skipped: Array<{ url: string; reason: string }>;
};

function processImages(
  urls: string[],
  outDir: string,
  opts: { fetcher: ImageFetcher; maxBytes?: number; concurrency?: number },
): Promise<ProcessImagesResult>;
```

## Acceptance criteria

1. **All prior tests stay green** — 49 tests from Pass 1 + Pass 2 unchanged.
2. **New unit tests green:**
   - `image-block.test.ts` — `core/image` markup → IR image (with/without alt, caption, dimensions)
   - `image-render.test.ts` — render-block image case (with/without caption, with `]` in alt text escaped)
   - `image-pipeline.test.ts` — stub fetcher → urlMap built correctly; file written; skip on >maxBytes; skip on fetch error; PNG → WebP conversion happens (assert `.webp` extension on map value)
3. **Pass 3 golden test green** — new `migrate.golden-pass3.test.ts`. Runs with `skipImages: true` so the golden output references original URLs (deterministic without network).
4. **Pipeline integration test passes** — separate test that drives the pipeline with a real (in-memory) PNG buffer, verifies WebP file is non-empty on disk, verifies MDX references the local path.
5. **Dogfood:** running the CLI against a fixture with images + a stub-network env produces an Astro project with `src/assets/images/` populated. `astro check` clean.
6. **Pass 1 + Pass 2 dogfood untouched** — neither fixture has `core/image` blocks, so output is byte-identical to prior passes.

## Risks specific to Pass 3

1. **SSRF / URL fetching attack surface.** Images can reference any URL. A hostile WXR could point us at `http://169.254.169.254/...` (AWS metadata) or `http://localhost:6379/...` (local Redis). Pass 3 does NOT defend against this — the threat model assumes the migrating user trusts the WXR they're feeding the tool (it's their own export). Document this in the README. Pass-5+ will add an allowlist option.
2. **Disk-space exhaustion.** A WXR could reference thousands of images. The 5MB-per-image cap helps but doesn't bound total. Document as a known limitation.
3. **Sharp native binary.** Adds ~30MB to `node_modules` and is a notable install-time cost. Trade-off accepted; sharp is the industry standard.
4. **WebP determinism across platforms.** libwebp output may differ slightly across OS/version. Golden tests compare MDX text only, not WebP bytes — WebP is verified by "exists + non-empty".
5. **URL-without-extension edge case.** Some CDN URLs (`https://cdn.example.com/abc123`) have no file extension. Sniff from content-type if possible; otherwise skip with a warning.
6. **Same image, different URLs.** WordPress sometimes serves the same image at multiple URLs (e.g. with `?w=1024` query string). Pass 3 treats each URL as distinct. De-dup by content-hash would be cleaner but adds complexity; defer.
