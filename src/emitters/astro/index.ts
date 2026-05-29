import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simpleGit } from "simple-git";
import { renderBlock } from "./render-block.js";
import { buildFrontmatter } from "./frontmatter.js";
import {
  IR_VERSION,
  type Page,
  type Post,
  type Site,
} from "../../ir/schema.js";

export type EmitOptions = {
  force?: boolean;
};

export type EmitResult = {
  filesWritten: string[];
  posts: number;
  pages: number;
  gitInitialized: boolean;
};

/** Raised for caller-actionable emitter errors (e.g. non-empty target). */
export class EmitterError extends Error {
  override name = "EmitterError";
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");

/**
 * Emit an Astro project skeleton (content collections + package.json + git
 * repo) from the IR.
 *
 * - `src/content/posts/<slug>.mdx` — one per post
 * - `src/content/pages/<slug>.mdx` — one per page (only emitted if `site.pages` is non-empty)
 * - `src/content/config.ts` — Astro content-collection schemas (posts + pages)
 * - `package.json` — astro + @astrojs/mdx (deps declared, not installed)
 * - `.git/` with one commit "Initial migration from WXR"
 *
 * Slug uniqueness is enforced per-collection: a post and a page may share a slug.
 * Refuses to write into a non-empty `outDir` unless `opts.force === true`.
 * Git initialization failure is non-fatal — files remain written.
 */
export async function emitAstro(
  site: Site,
  outDir: string,
  opts: EmitOptions = {},
): Promise<EmitResult> {
  if (site.version !== IR_VERSION) {
    throw new EmitterError(
      `Astro emitter: IR version mismatch — expected ${IR_VERSION}, got ${String(site.version)}`,
    );
  }

  await ensureWritableDir(outDir, opts.force === true);

  const filesWritten: string[] = [];

  // 1. Posts
  const postsDir = path.join(outDir, "src", "content", "posts");
  await fs.mkdir(postsDir, { recursive: true });
  await writeCollection(postsDir, site.posts, renderPost, outDir, filesWritten);

  // 2. Pages (only emit the dir if there are any pages — keeps empty migrations tidy)
  if (site.pages.length > 0) {
    const pagesDir = path.join(outDir, "src", "content", "pages");
    await fs.mkdir(pagesDir, { recursive: true });
    await writeCollection(pagesDir, site.pages, renderPage, outDir, filesWritten);
  }

  // 3. content/config.ts
  const configTarget = path.join(outDir, "src", "content", "config.ts");
  await writeAtomic(configTarget, await readTemplate("config.ts.tmpl"));
  filesWritten.push(path.relative(outDir, configTarget));

  // 4. package.json
  const pkgTarget = path.join(outDir, "package.json");
  await writeAtomic(pkgTarget, await readTemplate("package.json.tmpl"));
  filesWritten.push(path.relative(outDir, pkgTarget));

  // 5. Git init (best effort)
  const gitInitialized = await initGitRepo(outDir);

  return {
    filesWritten: filesWritten.sort(),
    posts: site.posts.length,
    pages: site.pages.length,
    gitInitialized,
  };
}

/**
 * Write all entries of one collection to `dir`, de-duplicating on slug.
 * Slug namespaces are per-collection — posts and pages are independent.
 */
async function writeCollection<T extends { slug: string }>(
  dir: string,
  entries: T[],
  render: (entry: T) => string,
  outDir: string,
  filesWritten: string[],
): Promise<void> {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.slug)) {
      throw new EmitterError(
        `duplicate slug '${entry.slug}' in collection '${path.basename(dir)}' — two entries share the same slug; rename one and re-export`,
      );
    }
    seen.add(entry.slug);
    const target = path.join(dir, `${entry.slug}.mdx`);
    await writeAtomic(target, render(entry));
    filesWritten.push(path.relative(outDir, target));
  }
}

function renderPost(post: Post): string {
  const fm = buildFrontmatter({
    title: post.title,
    slug: post.slug,
    date: post.date,
    ...(post.excerpt !== undefined ? { excerpt: post.excerpt } : {}),
  });
  const body = post.blocks.map(renderBlock).join("");
  return `${fm}${body}`;
}

function renderPage(page: Page): string {
  const fm = buildFrontmatter({
    title: page.title,
    slug: page.slug,
    ...(page.date !== undefined ? { date: page.date } : {}),
    ...(page.excerpt !== undefined ? { excerpt: page.excerpt } : {}),
  });
  const body = page.blocks.map(renderBlock).join("");
  return `${fm}${body}`;
}

async function ensureWritableDir(outDir: string, force: boolean): Promise<void> {
  try {
    const ents = await fs.readdir(outDir);
    if (ents.length > 0 && !force) {
      throw new EmitterError(
        `output directory '${outDir}' is not empty; pass --force to overwrite`,
      );
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      await fs.mkdir(outDir, { recursive: true });
      return;
    }
    throw e;
  }
}

async function writeAtomic(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, content, "utf-8");
  await fs.rename(tmp, target);
}

async function readTemplate(name: string): Promise<string> {
  return fs.readFile(path.join(TEMPLATES_DIR, name), "utf-8");
}

async function initGitRepo(outDir: string): Promise<boolean> {
  try {
    const git = simpleGit({
      baseDir: outDir,
      config: [
        "user.email=bot@wp-to-astro.local",
        "user.name=wp-to-astro",
        "commit.gpgsign=false",
      ],
    });
    await git.init();
    await git.add(".");
    await git.commit("Initial migration from WXR");
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `wp-to-astro: git init failed (${msg}); files written without commit\n`,
    );
    return false;
  }
}
