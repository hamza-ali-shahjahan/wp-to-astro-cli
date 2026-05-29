import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

export type ImageFetcher = (url: string) => Promise<ImageFetchResult>;

export type ImageFetchResult =
  | { ok: true; buffer: Buffer; contentType: string }
  | { ok: false; reason: string };

export type ProcessImagesOptions = {
  fetcher: ImageFetcher;
  maxBytes?: number;
  concurrency?: number;
};

export type ProcessImagesResult = {
  /** Map from original URL to MDX-relative path (e.g. `../../assets/images/photo-abc12345.webp`). */
  urlMap: Map<string, string>;
  /** Asset files written, relative to outDir, sorted lexicographically. */
  filesWritten: string[];
  /** URLs we didn't materialize, with a reason — logged to stderr by the worker. */
  skipped: Array<{ url: string; reason: string }>;
};

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Parse a URL and ensure it uses an http(s) scheme. Centralizes the SSRF
 * "is this URL safe to fetch + safe to derive filename from" gate so all
 * call sites in this file behave identically — including custom fetchers
 * injected via `opts.fetcher`.
 *
 * SSRF defense: rejects non-`http(s)` schemes (`file://`, `data:`, `gopher://`,
 * etc.). We do NOT block private-IP destinations — the threat model assumes
 * the user trusts their own WXR's image URLs (their own WP site). A
 * `--image-allow-host` allowlist is deferred. See `docs/spec-pass-3.md` §Risks.
 */
function tryParseHttpUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `unsupported URL scheme '${parsed.protocol}'` };
  }
  return { ok: true, url: parsed };
}

/**
 * Default network fetcher using Node's global `fetch`. 30s per-request timeout.
 * Errors and non-2xx responses produce `{ ok: false }`; callers never see throws.
 *
 * Defense in depth: also runs `tryParseHttpUrl` so consumers calling the
 * default fetcher directly (without going through the pipeline) still get
 * the SSRF gate.
 */
export const defaultFetcher: ImageFetcher = async (url) => {
  const r = tryParseHttpUrl(url);
  if (!r.ok) return { ok: false, reason: r.reason };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const ct = res.headers.get("content-type") ?? "application/octet-stream";
    const ab = await res.arrayBuffer();
    return { ok: true, buffer: Buffer.from(ab), contentType: ct };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Download images for the given URLs, optimize them (PNG/JPG → WebP via sharp,
 * other types preserved), write to `<outDir>/src/assets/images/`, and return a
 * map from original URL to MDX-relative path.
 *
 * Failure modes for individual images (HTTP error, oversized, non-image,
 * sharp crash) are logged to stderr and added to `result.skipped` — they
 * never abort the whole batch. The emitter then falls back to keeping the
 * original URL in the rendered MDX.
 *
 * URLs are deduplicated by string equality before downloading.
 */
export async function processImages(
  urls: string[],
  outDir: string,
  opts: ProcessImagesOptions,
): Promise<ProcessImagesResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const urlMap = new Map<string, string>();
  const filesWritten: string[] = [];
  const skipped: Array<{ url: string; reason: string }> = [];

  const assetsDir = path.join(outDir, "src", "assets", "images");
  await fs.mkdir(assetsDir, { recursive: true });

  const unique = [...new Set(urls)];
  if (unique.length === 0) {
    return { urlMap, filesWritten, skipped };
  }
  const queue = unique.slice();

  const workers = Array.from(
    { length: Math.min(concurrency, unique.length) },
    async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (url === undefined) return;
        const res = await processOne(url, assetsDir, outDir, opts.fetcher, maxBytes);
        if (res.ok) {
          urlMap.set(url, res.mdxPath);
          filesWritten.push(res.localPath);
        } else {
          skipped.push({ url, reason: res.reason });
          process.stderr.write(`wp-to-astro: skip image ${url} (${res.reason})\n`);
        }
      }
    },
  );
  await Promise.all(workers);

  filesWritten.sort();
  return { urlMap, filesWritten, skipped };
}

async function processOne(
  rawUrl: string,
  assetsDir: string,
  outDir: string,
  fetcher: ImageFetcher,
  maxBytes: number,
): Promise<
  | { ok: true; localPath: string; mdxPath: string }
  | { ok: false; reason: string }
> {
  // SSRF gate at the pipeline boundary — applies whether the caller uses
  // defaultFetcher or an injected fetcher. The parsed URL is also threaded
  // into extFromUrl / stemFromUrl to avoid re-parsing.
  const parsed = tryParseHttpUrl(rawUrl);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  let fetched: ImageFetchResult;
  try {
    fetched = await fetcher(rawUrl);
  } catch (e) {
    return { ok: false, reason: `fetch threw: ${(e as Error).message}` };
  }
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  if (fetched.buffer.length > maxBytes) {
    return {
      ok: false,
      reason: `too large (${fetched.buffer.length} > ${maxBytes} bytes)`,
    };
  }

  const ct = fetched.contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!ct.startsWith("image/")) {
    return { ok: false, reason: `non-image content-type '${ct}'` };
  }

  let buffer = fetched.buffer;
  let ext = extFromUrl(parsed.url) || extFromContentType(ct);

  // Convert raster formats with broad browser support to WebP. Leave GIF
  // alone (animation), WebP/AVIF as-is, SVG as-is (vectors).
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
    try {
      buffer = await sharp(fetched.buffer).webp({ quality: 80 }).toBuffer();
      ext = ".webp";
    } catch (e) {
      return { ok: false, reason: `sharp failed: ${(e as Error).message}` };
    }
  }

  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 8);
  const stem = stemFromUrl(parsed.url);
  const filename = `${stem}-${hash}${ext}`;
  const fullPath = path.join(assetsDir, filename);
  await fs.writeFile(fullPath, buffer);

  return {
    ok: true,
    localPath: path.relative(outDir, fullPath),
    // MDX files live at src/content/{posts,pages}/<slug>.mdx; the assets dir
    // is at src/assets/images/. Relative path is therefore "../../assets/images/<filename>".
    mdxPath: `../../assets/images/${filename}`,
  };
}

function extFromUrl(url: URL): string {
  const ext = path.extname(url.pathname).toLowerCase();
  return /^\.(png|jpe?g|gif|webp|avif|svg)$/.test(ext) ? ext : "";
}

function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
  };
  return map[ct] ?? ".bin";
}

function stemFromUrl(url: URL): string {
  const base = path.basename(url.pathname);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  return slugifyFilename(stem) || "image";
}

function slugifyFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    // Strip leading dots (and dashes). A stem of `..` or `.` would otherwise
    // survive into the filename — visually weird, no security impact (the
    // sha-hash suffix prevents directory escape), but unsightly.
    .replace(/^[-.]+|-+$/g, "");
}
