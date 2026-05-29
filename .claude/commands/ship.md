---
description: Pre-launch checklist — test, build, dogfood, verify, then prep commit.
---

# /ship

Run the full pre-flight check for wp-to-astro before tagging a release or pushing to main.

Execute in order. Halt and report at the first failure.

1. **Clean tree check.** `git status --porcelain` — warn if uncommitted changes (but proceed; the user may want to commit at the end).
2. **Install + typecheck.** `pnpm install --frozen-lockfile` then `pnpm exec tsc --noEmit`.
3. **Unit + golden tests.** `pnpm test` — must be 100% green.
4. **Build.** `pnpm build` — must produce `dist/cli/index.js`.
5. **Dogfood against fixture.**
   ```bash
   rm -rf /tmp/astro-out
   node bin/wp-to-astro.mjs migrate test/fixtures/input/sample.wxr --out /tmp/astro-out --force
   ```
   Confirm files exist at `/tmp/astro-out/src/content/posts/`.
6. **Astro sanity.**
   ```bash
   cd /tmp/astro-out && pnpm install --silent && pnpm add astro @astrojs/mdx --silent && npx astro check
   ```
   Must report 0 errors.
7. **Version + README check.** Confirm `package.json` version matches `CHANGELOG.md` top entry (if present) and that the README install/usage section is current.
8. **Summarize.** Print: tests passed, build size (KB of dist/), fixture migrated N posts, astro check result. Ask whether to commit and push.

Do NOT publish to npm from this command. Publishing is a separate, explicit step.
