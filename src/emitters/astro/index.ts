import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simpleGit } from "simple-git";
import { renderBlock } from "./render-block.js";
import { buildFrontmatter } from "./frontmatter.js";
import {
  defaultFetcher,
  processImages,
  type ImageFetcher,
} from "./image-pipeline.js";
import { generateRedirects } from "./redirects.js";
import {
  IR_VERSION,
  type Block,
  type Page,
  type Post,
  type Site,
} from "../../ir/schema.js";

export type EmitOptions = {
  force?: boolean;
  /** Skip the image download/conversion pipeline; keep image URLs remote in MDX. */
  skipImages?: boolean;
  /** Inject a custom image fetcher for testing. Defaults to native fetch. */
  fetcher?: ImageFetcher;
};

export type EmitResult = {
  filesWritten: string[];
  posts: number;
  pages: number;
  images: number;
  imagesSkipped: number;
  redirects: number;
  gitInitialized: boolean;
};

/** Raised for caller-actionable emitter errors (e.g. non-empty target). */
export class EmitterError extends Error {
  override name = "EmitterError";
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");

/**
 * Emit an Astro project skeleton from the IR.
 *
 * Pipeline:
 *   1. Image pipeline (unless `opts.skipImages`): download every image URL,
 *      convert PNG/JPG to WebP via sharp, write to `src/assets/images/`.
 *      Build a Map<originalUrl, mdxRelPath> for rewriting.
 *   2. Write `src/content/posts/<slug>.mdx` and `src/content/pages/<slug>.mdx`,
 *      with each `image` block's `src` rewritten via the urlMap if found.
 *   3. Write `src/content/config.ts` and stub `package.json`.
 *   4. `git init` + initial commit (best effort; non-fatal on failure).
 *
 * Slug uniqueness is enforced per-collection. Refuses non-empty target without
 * `opts.force`.
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

  // 1. Image pipeline — run before rendering so image blocks can be rewritten.
  let urlMap = new Map<string, string>();
  let imagesWritten = 0;
  let imagesSkipped = 0;
  if (opts.skipImages !== true) {
    const urls = collectImageUrls(site);
    if (urls.length > 0) {
      const result = await processImages(urls, outDir, {
        fetcher: opts.fetcher ?? defaultFetcher,
      });
      urlMap = result.urlMap;
      imagesWritten = result.filesWritten.length;
      imagesSkipped = result.skipped.length;
      for (const f of result.filesWritten) filesWritten.push(f);
    }
  }

  // 2. Posts
  const postsDir = path.join(outDir, "src", "content", "posts");
  await fs.mkdir(postsDir, { recursive: true });
  await writeCollection(
    postsDir,
    site.posts,
    (post) => renderPost(post, urlMap),
    outDir,
    filesWritten,
  );

  // 3. Pages (only if any)
  if (site.pages.length > 0) {
    const pagesDir = path.join(outDir, "src", "content", "pages");
    await fs.mkdir(pagesDir, { recursive: true });
    await writeCollection(
      pagesDir,
      site.pages,
      (page) => renderPage(page, urlMap),
      outDir,
      filesWritten,
    );
  }

  // 4. content/config.ts
  const configTarget = path.join(outDir, "src", "content", "config.ts");
  await writeAtomic(configTarget, await readTemplate("config.ts.tmpl"));
  filesWritten.push(path.relative(outDir, configTarget));

  // 5. package.json
  const pkgTarget = path.join(outDir, "package.json");
  await writeAtomic(pkgTarget, await readTemplate("package.json.tmpl"));
  filesWritten.push(path.relative(outDir, pkgTarget));

  // 6. Redirects (Netlify _redirects + Vercel vercel.json) — only when the
  // site has a non-trivial permalink structure.
  let redirectsCount = 0;
  const redirects = generateRedirects(site);
  if (redirects !== null) {
    const netlifyTarget = path.join(outDir, "_redirects");
    await writeAtomic(netlifyTarget, redirects.netlify);
    filesWritten.push(path.relative(outDir, netlifyTarget));
    const vercelTarget = path.join(outDir, "vercel.json");
    await writeAtomic(vercelTarget, redirects.vercelJson);
    filesWritten.push(path.relative(outDir, vercelTarget));
    redirectsCount = redirects.count;
  }

  // 7. Git init (best effort)
  const gitInitialized = await initGitRepo(outDir);

  return {
    filesWritten: filesWritten.sort(),
    posts: site.posts.length,
    pages: site.pages.length,
    images: imagesWritten,
    imagesSkipped,
    redirects: redirectsCount,
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

function collectImageUrls(site: Site): string[] {
  const urls: string[] = [];
  const collect = (blocks: Block[]): void => {
    for (const b of blocks) {
      if (b.type === "image" && b.src.length > 0) urls.push(b.src);
    }
  };
  for (const p of site.posts) collect(p.blocks);
  for (const p of site.pages) collect(p.blocks);
  return urls;
}

/** Substitute image src with the local path if the pipeline downloaded it. */
function rewriteImageSrc(b: Block, urlMap: Map<string, string>): Block {
  if (b.type === "image") {
    const local = urlMap.get(b.src);
    if (local !== undefined) {
      return { ...b, src: local };
    }
  }
  return b;
}

function renderPost(post: Post, urlMap: Map<string, string>): string {
  const fm = buildFrontmatter({
    title: post.title,
    slug: post.slug,
    date: post.date,
    ...(post.excerpt !== undefined ? { excerpt: post.excerpt } : {}),
    ...(post.seo !== undefined ? { seo: post.seo } : {}),
  });
  const body = post.blocks
    .map((b) => rewriteImageSrc(b, urlMap))
    .map(renderBlock)
    .join("");
  return `${fm}${body}`;
}

function renderPage(page: Page, urlMap: Map<string, string>): string {
  const fm = buildFrontmatter({
    title: page.title,
    slug: page.slug,
    ...(page.date !== undefined ? { date: page.date } : {}),
    ...(page.excerpt !== undefined ? { excerpt: page.excerpt } : {}),
    ...(page.seo !== undefined ? { seo: page.seo } : {}),
  });
  const body = page.blocks
    .map((b) => rewriteImageSrc(b, urlMap))
    .map(renderBlock)
    .join("");
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
