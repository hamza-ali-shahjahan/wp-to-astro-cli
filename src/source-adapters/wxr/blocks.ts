import { parse as parseGutenberg } from "@wordpress/block-serialization-default-parser";
import type { Block, ImageBlock } from "../../ir/schema.js";

// The Gutenberg parser's block shape (mirrors what its .d.ts exposes).
type ParsedBlock = {
  blockName: string | null;
  attrs: Record<string, unknown> | null;
  innerBlocks: ParsedBlock[];
  innerHTML: string;
  innerContent: Array<string | null>;
};

/**
 * Parse a WordPress post's `content:encoded` string into IR blocks.
 *
 * Pipeline:
 *   1. HTML-entity-decode the input (handles WP re-import double-encoding).
 *   2. Run the official Gutenberg block parser.
 *   3. Map known block names into typed IR.
 *   4. Everything else becomes a `raw` block with a TODO marker.
 */
export function parseContentBlocks(content: string): Block[] {
  const decoded = decodeEntities(content);
  const parsed = parseGutenberg(decoded) as ParsedBlock[];
  const out: Block[] = [];
  for (const b of parsed) {
    // Pseudo-blocks (blockName === null) wrap text between real blocks.
    // Whitespace-only is noise; otherwise preserve as raw.
    if (b.blockName === null) {
      if (b.innerHTML.trim() === "") continue;
      out.push({
        type: "raw",
        html: b.innerHTML.trim(),
        todo: "unmapped block: freeform",
      });
      continue;
    }
    out.push(mapBlock(b));
  }
  return out;
}

function mapBlock(b: ParsedBlock): Block {
  // Safe non-null: caller already filtered out blockName === null.
  const blockName = b.blockName as string;
  const attrs = b.attrs ?? {};

  if (blockName === "core/paragraph") {
    return { type: "paragraph", text: extractWrappedText(b.innerHTML, "p") };
  }

  if (blockName === "core/heading") {
    const rawLevel =
      typeof attrs["level"] === "number"
        ? Math.floor(attrs["level"] as number)
        : 2;
    return {
      type: "heading",
      level: clampHeadingLevel(rawLevel),
      text: extractHeadingText(b.innerHTML),
    };
  }

  if (blockName === "core/list") {
    // Modern WP 6.0+: items are nested `core/list-item` blocks.
    // Pre-6.0: flat `<ul>/<li>` in innerHTML with no innerBlocks — keep raw.
    if (b.innerBlocks.length === 0) {
      return {
        type: "raw",
        html: b.innerHTML.trim(),
        todo: "unmapped block: core/list (pre-6.0 flat structure)",
      };
    }
    // Pass 2 supports flat lists only. Any list-item that itself has innerBlocks
    // means we have a nested list — punt the whole thing to raw.
    const hasNested = b.innerBlocks.some(
      (child) =>
        child.blockName === "core/list-item" && child.innerBlocks.length > 0,
    );
    if (hasNested) {
      return {
        type: "raw",
        html: b.innerHTML.trim(),
        todo: "unmapped block: core/list (nested lists not supported in Pass 2)",
      };
    }
    const ordered = attrs["ordered"] === true;
    const items = b.innerBlocks
      .filter((child) => child.blockName === "core/list-item")
      .map((child) => ({ text: extractWrappedText(child.innerHTML, "li") }));
    return { type: "list", ordered, items };
  }

  if (blockName === "core/quote") {
    return extractQuote(b.innerHTML);
  }

  if (blockName === "core/code") {
    const language =
      typeof attrs["language"] === "string" && attrs["language"].length > 0
        ? (attrs["language"] as string)
        : undefined;
    const preInner = stripOuterTag(b.innerHTML.trim(), "pre");
    const codeInner = stripOuterTag(preInner.trim(), "code");
    const content = decodeEntities(codeInner);
    return language !== undefined
      ? { type: "code", language, content }
      : { type: "code", content };
  }

  if (blockName === "core/separator") {
    return { type: "separator" };
  }

  if (blockName === "core/image") {
    return extractImage(b.innerHTML, attrs);
  }

  // Unknown block: preserve verbatim with a TODO marker.
  return {
    type: "raw",
    html: b.innerHTML.trim(),
    todo: `unmapped block: ${blockName}`,
  };
}

/**
 * Extract an ImageBlock from a Gutenberg `core/image` block's innerHTML.
 *
 * Expected shape:
 *   <figure class="wp-block-image ...">
 *     <img src="..." alt="..." class="wp-image-N"/>
 *     <figcaption>...</figcaption>     (optional)
 *   </figure>
 *
 * Width/height come from the block's JSON attrs, not from <img width=>
 * (those are usually stripped by Gutenberg's serializer).
 */
function extractImage(
  innerHTML: string,
  attrs: Record<string, unknown>,
): ImageBlock {
  const inner = stripOuterTag(innerHTML.trim(), "figure").trim();

  const imgMatch = inner.match(/<img\b([^>]*?)\/?>/i);
  const imgAttrs = imgMatch?.[1] ?? "";
  const srcMatch = imgAttrs.match(/\bsrc\s*=\s*["']([^"']*)["']/i);
  const altMatch = imgAttrs.match(/\balt\s*=\s*["']([^"']*)["']/i);
  const src = decodeEntities(srcMatch?.[1] ?? "");
  const alt = decodeEntities(altMatch?.[1] ?? "");

  const capMatch = inner.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
  const captionRaw = capMatch?.[1];

  const out: ImageBlock = { type: "image", src, alt };
  if (typeof attrs["width"] === "number" && Number.isInteger(attrs["width"]) && (attrs["width"] as number) > 0) {
    out.width = attrs["width"] as number;
  }
  if (typeof attrs["height"] === "number" && Number.isInteger(attrs["height"]) && (attrs["height"] as number) > 0) {
    out.height = attrs["height"] as number;
  }
  if (captionRaw !== undefined && captionRaw.trim().length > 0) {
    out.caption = captionRaw.trim();
  }
  return out;
}

/** Pass 1 reserves h1 for the page layout; clamp content headings to 2..6. */
function clampHeadingLevel(n: number): 2 | 3 | 4 | 5 | 6 {
  if (n < 2) return 2;
  if (n > 6) return 6;
  return n as 2 | 3 | 4 | 5 | 6;
}

/** Strip a single wrapping tag from HTML — tag-specific (e.g. "p", "li"). */
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

/** Strip an outer tag if it wraps the entire string; otherwise return as-is. */
function stripOuterTag(html: string, tag: string): string {
  const open = new RegExp(`^<${tag}\\b[^>]*>`, "i");
  const close = new RegExp(`</${tag}>$`, "i");
  if (open.test(html) && close.test(html)) {
    return html.replace(open, "").replace(close, "");
  }
  return html;
}

/**
 * Extract `{text, citation?}` from a Gutenberg `core/quote` block's innerHTML.
 *
 * Expected shape:
 *   <blockquote class="wp-block-quote">
 *     <p>...</p>            (one or more paragraphs)
 *     <cite>...</cite>      (optional)
 *   </blockquote>
 *
 * Multi-paragraph quotes are joined with a single `\n`. Inline HTML within
 * paragraphs and the citation is preserved verbatim.
 */
function extractQuote(
  innerHTML: string,
): { type: "quote"; text: string; citation?: string } {
  const inner = stripOuterTag(innerHTML.trim(), "blockquote").trim();
  const pMatches = [...inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const citeMatch = inner.match(/<cite\b[^>]*>([\s\S]*?)<\/cite>/i);
  const text =
    pMatches.length > 0
      ? pMatches.map((m) => m[1] ?? "").join("\n")
      : inner;
  if (citeMatch && citeMatch[1] !== undefined) {
    return { type: "quote", text, citation: citeMatch[1] };
  }
  return { type: "quote", text };
}

/**
 * Decode the narrow set of HTML entities WordPress may produce — both around
 * Gutenberg comments (re-imports) and inside `<code>` content (always encoded).
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
