# Plan — Pass 4 tasks

| # | Task | Acceptance | Depends on |
|---|------|-----------|------------|
| T0 | Bump IR 0.3.0 → 0.4.0 with `SeoMeta` + `SiteConfig` | Schema tests updated; IR_VERSION === "0.4.0" | — |
| T1 | `src/source-adapters/rest/types.ts` — WP REST DTOs (`WpPost`, `WpPage`, `WpSettings`, `YoastHeadJson`) | All TS types compile | T0 |
| T2 | `src/source-adapters/rest/client.ts` — HTTP client with Basic auth + pagination | Unit tests in `rest-client.test.ts` green | T1 |
| T3 | `src/source-adapters/rest/mappers.ts` — DTO → IR | Unit tests in `rest-mappers.test.ts` green | T1 |
| T4 | `src/source-adapters/rest/index.ts` — `parseRest(baseUrl, auth, opts?)` entrypoint | Integration test green: stub fetcher → IR shape | T2, T3 |
| T5 | CLI auto-detect WXR vs REST + `--auth-user` / `--auth-pass` flags + env-var fallback | `wp-to-astro migrate https://… …` routes to REST; `./export.xml` still works | T4 |
| T6 | Update CHANGELOG, version → 0.4.0, commit | — | T5 |

## Implementation notes

- **Auth header:** `Basic ${base64(user + ":" + pass)}`. Application Passwords keep the spaces; pass through verbatim.
- **Base URL normalization:** strip trailing slash, append `/wp-json/wp/v2/` if not already present. Don't be clever about path-segment count — just check the last segment.
- **Pagination loop:** start `page = 1`, fetch `?per_page=100&page=1&context=edit`. Read `X-WP-TotalPages` from headers (default `"1"` if missing). Append items. If `page >= totalPages` or response items is empty, stop. Else `page++`.
- **Retry-once on 5xx:** simple `await sleep(1000)` then re-fetch. No exponential backoff in Pass 4.
- **Mappers are pure** — they take a DTO and return IR. No network. No fs.
- **Yoast extraction is best-effort** — every field is optional; the whole `seo` object is omitted if Yoast wasn't installed.
- **Date handling:** REST returns `date_gmt` as `"2024-01-01T12:00:00"` (ISO without timezone). Adapter appends `"Z"` and `new Date().toISOString()`-normalizes — same as WXR.
- **Stub fetcher pattern:** the client takes `opts.fetcher?: typeof fetch` (default `globalThis.fetch`). Tests inject a fake.

## What stays out

- RankMath (`rank_math_head` HTML parsing)
- ACF Pro custom fields
- Custom post types
- OAuth / JWT auth
- Response caching
- Concurrent endpoint requests
