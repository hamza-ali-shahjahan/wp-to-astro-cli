import { parse as parseGutenberg } from "@wordpress/block-serialization-default-parser";
import type { Block } from "../../ir/schema.js";

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

  // Unknown block: preserve verbatim with a TODO marker.
  return {
    type: "raw",
    html: b.innerHTML.trim(),
    todo: `unmapped block: ${blockName}`,
  };
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
