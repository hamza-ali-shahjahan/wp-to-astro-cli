/**
 * WordPress REST API DTOs — only the fields wp-to-astro reads.
 *
 * These are deliberately minimal. WordPress's actual REST responses have
 * dozens of fields per object (categories, tags, _links, meta, etc.) — we
 * only model what we map into IR. Extra fields are tolerated (DTOs are open).
 */

/** GET /wp-json/wp/v2/posts?context=edit&page=N — one item */
export type WpPost = {
  id: number;
  slug: string;
  date_gmt: string; // "2024-01-01T12:00:00" (no tz; UTC by convention)
  title: { raw?: string; rendered: string };
  content: { raw?: string; rendered: string };
  excerpt?: { raw?: string; rendered: string };
  yoast_head_json?: YoastHeadJson;
};

/** GET /wp-json/wp/v2/pages?context=edit&page=N — one item */
export type WpPage = WpPost; // same shape for our purposes

/** GET /wp-json/wp/v2/settings */
export type WpSettings = {
  title?: string;
  description?: string;
  url?: string;
  permalink_structure?: string;
};

/**
 * Yoast SEO's REST-exposed head JSON. All fields optional — present only when
 * Yoast SEO is installed AND has its "REST API" integration enabled.
 */
export type YoastHeadJson = {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: Record<string, string> | string; // newer Yoast: object; older: string
  og_image?: Array<{ url?: string; width?: number; height?: number }>;
  og_type?: string;
  twitter_card?: string;
  schema?: { "@graph"?: unknown[] } & Record<string, unknown>;
};
