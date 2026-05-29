---
paths: ["src/source-adapters/wxr/**"]
---

# WXR adapter rules

- **Input is untrusted.** Never enable external DTDs, never expand entities beyond `fast-xml-parser` safe defaults. Treat the file as adversarial: malformed XML, missing fields, surprise CDATA — fail loudly with a helpful error, never silently produce a half-empty IR.
- **Decode HTML entities in `content:encoded` BEFORE running the Gutenberg parser.** WordPress re-imports re-encode `<!-- wp:* -->` comments as `&lt;!-- wp:* --&gt;`. If you skip decode, every post becomes a single `raw` block. There's a unit test enforcing ≥1 typed block from the fixture.
- **Only `wp:post_type === "post"` in Pass 1.** Pages, attachments, custom post types are ignored. Add a TODO comment, not code, for future passes.
- **Unknown Gutenberg blocks become `{ type: 'raw', html, todo }`.** Never throw on an unrecognized block; the emitter handles graceful fallback. The `todo` string is `unmapped block: core/<name>` or `unmapped block: <plugin>/<name>`.
- **The adapter's only public function is `parseWxr(filepath: string): Promise<Site>`.** Other helpers stay non-exported or live behind a `wxr/internal.ts`.
