/**
 * Slugify a string for use as a URL slug or filename.
 *
 * - Lowercases.
 * - Strips diacritics (NFKD + combining-mark removal).
 * - Replaces any run of non-`a-z0-9` characters with `-`.
 * - Trims leading/trailing `-`.
 * - Falls back to "untitled" if the result is empty.
 */
export function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // strip combining marks (diacritics)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "untitled";
}
