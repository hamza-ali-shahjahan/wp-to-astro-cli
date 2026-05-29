import type { Block } from "../../ir/schema.js";

/**
 * Render a single IR block as an MDX string fragment.
 *
 * **Invariant:** every return value ends with exactly one `"\n\n"`. The Astro
 * emitter concatenates these without inserting a separator, so a missing or
 * doubled trailing blank would corrupt the golden diff.
 *
 * Pure function — no I/O, no globals, no Date.now().
 */
export function renderBlock(block: Block): string {
  switch (block.type) {
    case "paragraph":
      return `${block.text}\n\n`;

    case "heading": {
      const hashes = "#".repeat(block.level);
      return `${hashes} ${block.text}\n\n`;
    }

    case "list": {
      const lines = block.items.map((item, i) =>
        block.ordered ? `${i + 1}. ${item.text}` : `- ${item.text}`,
      );
      return `${lines.join("\n")}\n\n`;
    }

    case "quote": {
      // Without citation: just the blockquote line.
      // With citation: blockquote, blank line, em-dash + citation as its own
      // paragraph below the quote. Avoids the "blank line inside a blockquote"
      // trailing-whitespace fragility.
      if (block.citation === undefined) {
        return `> ${block.text}\n\n`;
      }
      return `> ${block.text}\n\n— ${block.citation}\n\n`;
    }

    case "code": {
      const lang = block.language ?? "";
      return `\`\`\`${lang}\n${block.content}\n\`\`\`\n\n`;
    }

    case "separator":
      return `<hr />\n\n`;

    case "raw":
      return `{/* TODO: ${block.todo} */}\n${block.html}\n\n`;
  }
}
