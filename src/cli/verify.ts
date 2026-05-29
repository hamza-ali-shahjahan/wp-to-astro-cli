import path from "node:path";
import { promises as fs } from "node:fs";
import { parse as parseYaml } from "yaml";

type Issue = { severity: "error" | "warn"; message: string };

/**
 * Structural sanity check on a migrated Astro project directory.
 *
 * Pass 6 v1 is intentionally lightweight — it doesn't spawn subprocesses,
 * doesn't install dependencies, and doesn't actually build the site. It
 * just walks the tree and validates shape:
 *
 *   - `src/content/config.ts` exists
 *   - `package.json` exists and parses
 *   - every `.mdx` in `src/content/{posts,pages}/` has a `---`-delimited
 *     YAML frontmatter block that parses, with required `title` + `slug`
 *   - if `_redirects` exists, every line is `<from> <to> <code>`
 *   - if `vercel.json` exists, it parses and has a top-level `redirects` array
 *
 * Returns an exit code: 0 = clean, 1 = usage error (dir missing), 2 = failed.
 */
export async function runVerify(siteDir: string): Promise<number> {
  const dir = path.resolve(siteDir);
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) {
      process.stderr.write(`wp-to-astro: not a directory: ${dir}\n`);
      return 1;
    }
  } catch (e) {
    process.stderr.write(
      `wp-to-astro: cannot read directory '${dir}': ${(e as Error).message}\n`,
    );
    return 1;
  }

  process.stdout.write(`wp-to-astro: verifying ${dir}\n`);
  const issues: Issue[] = [];

  // 1. config.ts
  const configPath = path.join(dir, "src", "content", "config.ts");
  if (await exists(configPath)) {
    process.stdout.write(`  ✓ src/content/config.ts present\n`);
  } else {
    issues.push({
      severity: "error",
      message: "src/content/config.ts missing",
    });
    process.stdout.write(`  ✗ src/content/config.ts missing\n`);
  }

  // 2. package.json
  const pkgPath = path.join(dir, "package.json");
  if (await exists(pkgPath)) {
    try {
      JSON.parse(await fs.readFile(pkgPath, "utf-8"));
      process.stdout.write(`  ✓ package.json present and parses\n`);
    } catch (e) {
      issues.push({
        severity: "error",
        message: `package.json present but unparseable: ${(e as Error).message}`,
      });
      process.stdout.write(`  ✗ package.json present but unparseable\n`);
    }
  } else {
    issues.push({ severity: "error", message: "package.json missing" });
    process.stdout.write(`  ✗ package.json missing\n`);
  }

  // 3. MDX files
  const mdxFiles = [
    ...(await findMdx(path.join(dir, "src", "content", "posts"))),
    ...(await findMdx(path.join(dir, "src", "content", "pages"))),
  ];
  let mdxOk = 0;
  for (const f of mdxFiles) {
    const result = await validateMdxFrontmatter(f);
    if (result.ok) {
      mdxOk++;
    } else {
      issues.push({
        severity: "error",
        message: `${path.relative(dir, f)}: ${result.reason}`,
      });
    }
  }
  if (mdxFiles.length === 0) {
    process.stdout.write(`  ⚠ no MDX files found under src/content/{posts,pages}\n`);
  } else if (mdxOk === mdxFiles.length) {
    process.stdout.write(`  ✓ ${mdxOk} MDX file(s) with valid frontmatter\n`);
  } else {
    process.stdout.write(
      `  ✗ ${mdxFiles.length - mdxOk} of ${mdxFiles.length} MDX file(s) have invalid frontmatter\n`,
    );
  }

  // 4. _redirects (Netlify)
  const redirectsPath = path.join(dir, "_redirects");
  if (await exists(redirectsPath)) {
    const lint = await lintNetlifyRedirects(redirectsPath);
    if (lint.ok) {
      process.stdout.write(`  ✓ _redirects well-formed (${lint.count} entries)\n`);
    } else {
      issues.push({
        severity: "error",
        message: `_redirects: ${lint.reason}`,
      });
      process.stdout.write(`  ✗ _redirects malformed: ${lint.reason}\n`);
    }
  }

  // 5. vercel.json
  const vercelPath = path.join(dir, "vercel.json");
  if (await exists(vercelPath)) {
    const lint = await lintVercelJson(vercelPath);
    if (lint.ok) {
      process.stdout.write(
        `  ✓ vercel.json well-formed (${lint.count} redirect(s))\n`,
      );
    } else {
      issues.push({
        severity: "error",
        message: `vercel.json: ${lint.reason}`,
      });
      process.stdout.write(`  ✗ vercel.json malformed: ${lint.reason}\n`);
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    process.stdout.write(`verify: FAILED (${errors.length} issue(s))\n`);
    for (const issue of errors) {
      process.stderr.write(`  - ${issue.message}\n`);
    }
    return 2;
  }
  process.stdout.write(`verify: PASSED\n`);
  return 0;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findMdx(dir: string): Promise<string[]> {
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of ents) {
      if (e.isFile() && e.name.endsWith(".mdx")) {
        out.push(path.join(dir, e.name));
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function validateMdxFrontmatter(
  file: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let content: string;
  try {
    content = await fs.readFile(file, "utf-8");
  } catch (e) {
    return { ok: false, reason: `unreadable: ${(e as Error).message}` };
  }
  if (!content.startsWith("---\n")) {
    return { ok: false, reason: "no opening --- frontmatter delimiter" };
  }
  // Accept closing `\n---\n` (normal) OR `\n---` at end-of-file (no trailing
  // newline — common after hand-edits in some editors).
  let closeIdx = content.indexOf("\n---\n", 4);
  if (closeIdx === -1) {
    if (content.endsWith("\n---")) {
      closeIdx = content.length - 4;
    } else {
      return { ok: false, reason: "no closing --- frontmatter delimiter" };
    }
  }
  const fmText = content.slice(4, closeIdx);
  let parsed: unknown;
  try {
    parsed = parseYaml(fmText);
  } catch (e) {
    return { ok: false, reason: `frontmatter YAML parse: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "frontmatter is not a YAML map" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj["title"] !== "string" || obj["title"].length === 0) {
    return { ok: false, reason: "frontmatter missing required 'title'" };
  }
  if (typeof obj["slug"] !== "string" || obj["slug"].length === 0) {
    return { ok: false, reason: "frontmatter missing required 'slug'" };
  }
  return { ok: true };
}

async function lintNetlifyRedirects(
  file: string,
): Promise<{ ok: true; count: number } | { ok: false; reason: string }> {
  let content: string;
  try {
    content = await fs.readFile(file, "utf-8");
  } catch (e) {
    return { ok: false, reason: `unreadable: ${(e as Error).message}` };
  }
  const lines = content.split("\n").filter((l) => l.length > 0 && !l.startsWith("#"));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      return { ok: false, reason: `line ${i + 1}: expected '<from> <to> <code>'` };
    }
    const code = parseInt(parts[2]!, 10);
    if (!Number.isFinite(code) || code < 100 || code > 599) {
      return { ok: false, reason: `line ${i + 1}: invalid status code '${parts[2]}'` };
    }
  }
  return { ok: true, count: lines.length };
}

async function lintVercelJson(
  file: string,
): Promise<{ ok: true; count: number } | { ok: false; reason: string }> {
  let content: string;
  try {
    content = await fs.readFile(file, "utf-8");
  } catch (e) {
    return { ok: false, reason: `unreadable: ${(e as Error).message}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { ok: false, reason: `JSON parse: ${(e as Error).message}` };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)["redirects"])
  ) {
    return { ok: false, reason: "missing or non-array `redirects` field" };
  }
  return { ok: true, count: ((parsed as { redirects: unknown[] }).redirects).length };
}
