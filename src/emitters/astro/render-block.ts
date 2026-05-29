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
    case "raw":
      return `{/* TODO: ${block.todo} */}\n${block.html}\n\n`;
  }
}
