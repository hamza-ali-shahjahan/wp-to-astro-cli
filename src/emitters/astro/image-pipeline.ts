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
 * Default network fetcher using Node's global `fetch`. 30s per-request timeout.
 * Errors and non-2xx responses produce `{ ok: false }`; callers never see throws.
 */
export const defaultFetcher: ImageFetcher = async (url) => {
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
  url: string,
  assetsDir: string,
  outDir: string,
  fetcher: ImageFetcher,
  maxBytes: number,
): Promise<
  | { ok: true; localPath: string; mdxPath: string }
  | { ok: false; reason: string }
> {
  let fetched: ImageFetchResult;
  try {
    fetched = await fetcher(url);
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
  let ext = extFromUrl(url) || extFromContentType(ct);

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
  const stem = stemFromUrl(url);
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

function extFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    if (/^\.(png|jpe?g|gif|webp|avif|svg)$/.test(ext)) return ext;
    return "";
  } catch {
    return "";
  }
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

function stemFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    return slugifyFilename(stem) || "image";
  } catch {
    return "image";
  }
}

function slugifyFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
