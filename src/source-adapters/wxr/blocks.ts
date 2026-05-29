import { parse as parseGutenberg } from "@wordpress/block-serialization-default-parser";
import type { Block } from "../../ir/schema.js";

/**
 * Parse a WordPress post's `content:encoded` string into IR blocks.
 *
 * Pipeline:
 *   1. HTML-entity-decode the input (handles WP re-import double-encoding).
 *   2. Run the official Gutenberg block parser.
 *   3. Map `core/paragraph` and `core/heading` into typed IR blocks.
 *   4. Everything else becomes a `raw` block with a TODO marker.
 *
 * Pass 1 is intentionally narrow — extend the `mapBlock` switch as new block
 * variants are added to the IR.
 */
export function parseContentBlocks(content: string): Block[] {
  const decoded = decodeEntities(content);
  const parsed = parseGutenberg(decoded);
  const out: Block[] = [];
  for (const b of parsed) {
    // The Gutenberg parser emits pseudo-blocks (blockName === null) for any
    // text between real blocks. If it's only whitespace, skip; otherwise
    // preserve it as raw with a freeform TODO.
    if (b.blockName === null) {
      if (b.innerHTML.trim() === "") continue;
      out.push({
        type: "raw",
        html: b.innerHTML.trim(),
        todo: "unmapped block: freeform",
      });
      continue;
    }
    out.push(mapBlock(b.blockName, b.attrs ?? {}, b.innerHTML));
  }
  return out;
}

function mapBlock(
  blockName: string,
  attrs: Record<string, unknown>,
  innerHTML: string,
): Block {
  if (blockName === "core/paragraph") {
    return { type: "paragraph", text: extractWrappedText(innerHTML, "p") };
  }
  if (blockName === "core/heading") {
    const rawLevel =
      typeof attrs["level"] === "number"
        ? Math.floor(attrs["level"] as number)
        : 2;
    const clamped = clampHeadingLevel(rawLevel);
    return {
      type: "heading",
      level: clamped,
      text: extractHeadingText(innerHTML),
    };
  }
  return {
    type: "raw",
    html: innerHTML.trim(),
    todo: `unmapped block: ${blockName}`,
  };
}

/** Pass 1 reserves h1 for the page layout; clamp content headings to 2..6. */
function clampHeadingLevel(n: number): 2 | 3 | 4 | 5 | 6 {
  if (n < 2) return 2;
  if (n > 6) return 6;
  return n as 2 | 3 | 4 | 5 | 6;
}

/** Strip a single wrapping tag from HTML — tag-specific (e.g. "p"). */
function extractWrappedText(html: string, tag: string): string {
  const trimmed = html.trim();
  const open = new RegExp(`^<${tag}\\b[^>]*>`, "i");
  const close = new RegExp(`</${tag}>$`, "i");
  if (open.test(trimmed) && close.test(trimmed)) {
    return trimmed.replace(open, "").replace(close, "");
  }
  return trimmed;
}

/** Strip whatever `<h1>`..`<h6>` wraps the heading inner HTML. */
function extractHeadingText(html: string): string {
  const trimmed = html.trim();
  const m = trimmed.match(/^<h([1-6])\b[^>]*>([\s\S]*)<\/h\1>$/i);
  return m && m[2] !== undefined ? m[2] : trimmed;
}

/**
 * Decode the narrow set of HTML entities WordPress re-imports may produce
 * around Gutenberg comments. We avoid pulling in a full decoder dep — this
 * set is sufficient for the known cases and keeps behavior auditable.
 *
 * `&amp;` last: otherwise we'd double-decode `&amp;lt;` → `&lt;` → `<`.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
