import { promises as fs } from "node:fs";
import { XMLParser } from "fast-xml-parser";

/**
 * The minimal shape we care about from a WXR `<item>`. WXR has many more
 * fields (categories, tags, postmeta, comments, …) — Pass 1 ignores them.
 */
export type WxrItem = {
  title: string;
  postName: string | undefined;
  postType: string;
  postDateGmt: string | undefined;
  pubDate: string | undefined;
  status: string | undefined;
  contentEncoded: string;
  excerpt: string | undefined;
};

/**
 * Configured to be safe with untrusted input:
 *   - `processEntities: true` decodes XML predefined entities (&amp; &lt; &gt;)
 *     OUTSIDE of CDATA sections (CDATA contents are preserved verbatim).
 *   - `htmlEntities: false` — we do NOT expand HTML named entities at the XML
 *     layer; that's intentional. HTML-entity decoding happens later, scoped to
 *     `content:encoded`, inside `wxr/blocks.ts`.
 *   - No external DTD loading, no entity expansion beyond predefined.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: true,
  htmlEntities: false,
  cdataPropName: "__cdata",
  allowBooleanAttributes: true,
  parseTagValue: false,
  trimValues: false,
});

/**
 * Read a WXR file from disk and return its channel's items in document order.
 *
 * Throws if the file is not a valid RSS 2.0 / WXR document.
 */
export async function readWxrItems(filepath: string): Promise<WxrItem[]> {
  const buf = await fs.readFile(filepath, "utf-8");
  const doc = parser.parse(buf) as unknown;
  const channel = pluck(doc, ["rss", "channel"]);
  if (channel === undefined || typeof channel !== "object" || channel === null) {
    throw new Error(`WXR parse: no <rss><channel> in ${filepath}`);
  }
  const itemsRaw = (channel as Record<string, unknown>)["item"];
  const items: unknown[] = Array.isArray(itemsRaw)
    ? itemsRaw
    : itemsRaw !== undefined
      ? [itemsRaw]
      : [];
  return items.map((it, idx) => mapItem(it, filepath, idx));
}

function mapItem(it: unknown, filepath: string, idx: number): WxrItem {
  if (typeof it !== "object" || it === null) {
    throw new Error(`WXR parse: item ${idx} in ${filepath} is not an object`);
  }
  const o = it as Record<string, unknown>;
  return {
    title: stringOf(o["title"]) ?? "Untitled",
    postName: cdataOrString(o["wp:post_name"]),
    postType: cdataOrString(o["wp:post_type"]) ?? "post",
    postDateGmt: cdataOrString(o["wp:post_date_gmt"]),
    pubDate: stringOf(o["pubDate"]),
    status: cdataOrString(o["wp:status"]),
    contentEncoded: cdataOrString(o["content:encoded"]) ?? "",
    excerpt: nonEmpty(cdataOrString(o["excerpt:encoded"])),
  };
}

function pluck(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function stringOf(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function cdataOrString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const cdata = (v as Record<string, unknown>)["__cdata"];
    if (typeof cdata === "string") return cdata;
    if (Array.isArray(cdata)) return cdata.map(String).join("");
  }
  return undefined;
}

function nonEmpty(s: string | undefined): string | undefined {
  return s !== undefined && s.length > 0 ? s : undefined;
}
