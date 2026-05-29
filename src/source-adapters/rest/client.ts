import type { WpPost, WpPage, WpSettings } from "./types.js";

export type RestAuth = { user: string; pass: string };

export type RestFetcher = typeof fetch;

export type RestClientOptions = {
  fetcher?: RestFetcher;
  /** WP REST default-max page size */
  perPage?: number;
};

/** Raised on auth failures specifically (401 / 403). User-actionable error. */
export class RestAuthError extends Error {
  override name = "RestAuthError";
}

/** Raised on any other REST failure: network, 5xx after retry, JSON parse. */
export class RestParseError extends Error {
  override name = "RestParseError";
}

/**
 * Normalize a user-supplied site URL into the REST API base URL.
 *
 *   "https://example.com"               → "https://example.com/wp-json/wp/v2"
 *   "https://example.com/"              → "https://example.com/wp-json/wp/v2"
 *   "https://example.com/wp-json"       → "https://example.com/wp-json/wp/v2"
 *   "https://example.com/wp-json/wp/v2" → "https://example.com/wp-json/wp/v2"
 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.replace(/\/+$/, "");
  if (trimmed.endsWith("/wp-json/wp/v2")) return trimmed;
  if (trimmed.endsWith("/wp-json")) return `${trimmed}/wp/v2`;
  return `${trimmed}/wp-json/wp/v2`;
}

/** Basic-auth header for WordPress Application Passwords. */
export function authHeader(auth: RestAuth): string {
  const token = Buffer.from(`${auth.user}:${auth.pass}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * GET an endpoint that returns a single object (e.g. `/settings`).
 * Retries once on 5xx.
 */
export async function getOne<T>(
  baseUrl: string,
  path: string,
  auth: RestAuth,
  opts: RestClientOptions = {},
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const fetcher = opts.fetcher ?? globalThis.fetch;
  let lastErr: unknown = null;
  for (const attempt of [0, 1] as const) {
    let res: Response;
    try {
      res = await fetcher(url, {
        headers: { Authorization: authHeader(auth), Accept: "application/json" },
      });
    } catch (e) {
      lastErr = e;
      if (attempt === 0) {
        await sleep(1000);
        continue;
      }
      throw new RestParseError(
        `REST: network error on GET ${url}: ${(e as Error).message}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new RestAuthError(
        `REST: authentication failed (HTTP ${res.status}) on GET ${url}. ` +
          `Check that the Application Password is correct and the user has edit permissions.`,
      );
    }
    if (res.status >= 500 && attempt === 0) {
      await sleep(1000);
      continue;
    }
    if (!res.ok) {
      throw new RestParseError(
        `REST: HTTP ${res.status} on GET ${url}: ${await safeText(res)}`,
      );
    }
    try {
      return (await res.json()) as T;
    } catch (e) {
      throw new RestParseError(
        `REST: invalid JSON on GET ${url}: ${(e as Error).message}`,
      );
    }
  }
  // Unreachable — loop either returns or throws.
  throw new RestParseError(
    `REST: unreachable retry exit on GET ${url}: ${String(lastErr)}`,
  );
}

/**
 * GET a paginated endpoint (e.g. `/posts`, `/pages`), accumulating all items.
 *
 * Uses `X-WP-TotalPages` to stop early; falls back to "first empty page" if
 * the header is missing. Retries once on 5xx per page.
 */
/** Safety cap to avoid unbounded loops if a misbehaving server reports
 *  inconsistent totalPages. 1000 pages * 100 per_page = 100k items — well
 *  above any realistic WP blog. */
const MAX_PAGES = 1000;

export async function getAllPages<T>(
  baseUrl: string,
  path: string,
  auth: RestAuth,
  opts: RestClientOptions = {},
): Promise<T[]> {
  const fetcher = opts.fetcher ?? globalThis.fetch;
  const perPage = opts.perPage ?? 100;
  const all: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${baseUrl}${path}${sep}per_page=${perPage}&page=${page}`;
    let res: Response;
    let attempt = 0;
    // Retry loop for this single page.
    for (;;) {
      try {
        res = await fetcher(url, {
          headers: { Authorization: authHeader(auth), Accept: "application/json" },
        });
        break;
      } catch (e) {
        if (attempt === 0) {
          attempt++;
          await sleep(1000);
          continue;
        }
        throw new RestParseError(
          `REST: network error on GET ${url}: ${(e as Error).message}`,
        );
      }
    }

    if (res.status === 401 || res.status === 403) {
      throw new RestAuthError(
        `REST: authentication failed (HTTP ${res.status}) on GET ${url}.`,
      );
    }

    // WP returns 400 with code "rest_post_invalid_page_number" once you go
    // past the last page. Treat as end-of-pagination, not an error.
    if (res.status === 400 && page > 1) break;

    if (res.status >= 500 && attempt === 0) {
      attempt++;
      await sleep(1000);
      page--; // retry this page
      continue;
    }

    if (!res.ok) {
      throw new RestParseError(
        `REST: HTTP ${res.status} on GET ${url}: ${await safeText(res)}`,
      );
    }

    let items: T[];
    try {
      items = (await res.json()) as T[];
    } catch (e) {
      throw new RestParseError(
        `REST: invalid JSON on GET ${url}: ${(e as Error).message}`,
      );
    }
    if (!Array.isArray(items)) {
      throw new RestParseError(
        `REST: expected an array from GET ${url} but got ${typeof items}`,
      );
    }

    all.push(...items);
    if (items.length === 0) break;

    const totalPagesHeader = res.headers.get("X-WP-TotalPages");
    const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
    if (Number.isFinite(totalPages) && page >= totalPages) break;
  }
  return all;
}

/** Sugar over `getAllPages` for the two endpoints we consume. */
export async function fetchAllPosts(
  baseUrl: string,
  auth: RestAuth,
  opts: RestClientOptions = {},
): Promise<WpPost[]> {
  return getAllPages<WpPost>(baseUrl, "/posts?context=edit&status=publish", auth, opts);
}

export async function fetchAllPages(
  baseUrl: string,
  auth: RestAuth,
  opts: RestClientOptions = {},
): Promise<WpPage[]> {
  return getAllPages<WpPage>(baseUrl, "/pages?context=edit&status=publish", auth, opts);
}

export async function fetchSettings(
  baseUrl: string,
  auth: RestAuth,
  opts: RestClientOptions = {},
): Promise<WpSettings> {
  return getOne<WpSettings>(baseUrl, "/settings", auth, opts);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.length > 200 ? `${t.slice(0, 200)}…` : t;
  } catch {
    return "(unreadable body)";
  }
}
