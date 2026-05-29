import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simpleGit } from "simple-git";
import { renderBlock } from "./render-block.js";
import { buildFrontmatter } from "./frontmatter.js";
import { IR_VERSION, type Post, type Site } from "../../ir/schema.js";

export type EmitOptions = {
  force?: boolean;
};

export type EmitResult = {
  filesWritten: string[];
  posts: number;
  gitInitialized: boolean;
};

/** Raised for caller-actionable emitter errors (e.g. non-empty target). */
export class EmitterError extends Error {
  override name = "EmitterError";
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");

/**
 * Emit an Astro project skeleton (content collection + package.json + git
 * repo) from the IR.
 *
 * - `src/content/posts/<slug>.mdx` — one per post
 * - `src/content/config.ts` — Astro content collection schema
 * - `package.json` — astro + @astrojs/mdx (deps declared, not installed)
 * - `.git/` with one commit "Initial migration from WXR"
 *
 * Refuses to write into a non-empty `outDir` unless `opts.force === true`.
 * Git initialization failure is non-fatal — files remain written and the
 * result reports `gitInitialized: false`.
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
  const seenSlugs = new Set<string>();
  for (const post of site.posts) {
    if (seenSlugs.has(post.slug)) {
      throw new EmitterError(
        `duplicate post slug '${post.slug}' — two posts share the same slug; ` +
          `rename one in WordPress (Edit Post → Permalink) and re-export`,
      );
    }
    seenSlugs.add(post.slug);
    const target = path.join(postsDir, `${post.slug}.mdx`);
    await writeAtomic(target, renderPost(post));
    filesWritten.push(path.relative(outDir, target));
  }

  // 2. content/config.ts
  const configTarget = path.join(outDir, "src", "content", "config.ts");
  await writeAtomic(configTarget, await readTemplate("config.ts.tmpl"));
  filesWritten.push(path.relative(outDir, configTarget));

  // 3. package.json
  const pkgTarget = path.join(outDir, "package.json");
  await writeAtomic(pkgTarget, await readTemplate("package.json.tmpl"));
  filesWritten.push(path.relative(outDir, pkgTarget));

  // 4. Git init (best effort)
  const gitInitialized = await initGitRepo(outDir);

  return {
    filesWritten: filesWritten.sort(),
    posts: site.posts.length,
    gitInitialized,
  };
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
