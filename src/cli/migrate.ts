import path from "node:path";
import { promises as fs } from "node:fs";
import { parseWxr } from "../source-adapters/wxr/index.js";
import {
  parseRest,
  RestAuthError,
  RestParseError,
  type RestAuth,
} from "../source-adapters/rest/index.js";
import { emitAstro, EmitterError } from "../emitters/astro/index.js";

export type MigrateOptions = {
  out: string;
  force: boolean;
  skipImages: boolean;
  authUser?: string;
  authPass?: string;
};

/**
 * CLI handler for `wp-to-astro migrate <wxr-file-or-url> --out <dir>`.
 *
 * Auto-detects the input mode by argument shape:
 *   - `http://...` or `https://...` → REST adapter (needs --auth-user/--auth-pass)
 *   - anything else → WXR file path
 *
 * Returns a process exit code: 0 success, 1 usage/validation error,
 * 2 runtime/parse/write error.
 */
export async function runMigrate(
  source: string,
  opts: MigrateOptions,
): Promise<number> {
  const isUrl = /^https?:\/\//i.test(source);
  const outDir = path.resolve(opts.out);

  try {
    const site = isUrl
      ? await viaRest(source, opts)
      : await viaWxr(source);

    if (site === null) return 1; // validation error already reported

    const result = await emitAstro(site, outDir, {
      force: opts.force,
      skipImages: opts.skipImages,
    });
    process.stdout.write(
      `wp-to-astro: migrated ${result.posts} post(s) and ${result.pages} page(s) to ${outDir}\n`,
    );
    if (!opts.skipImages) {
      process.stdout.write(
        `wp-to-astro: ${result.images} image(s) processed` +
          (result.imagesSkipped > 0
            ? `, ${result.imagesSkipped} skipped (see warnings above)\n`
            : "\n"),
      );
    }
    process.stdout.write(
      `wp-to-astro: ${result.filesWritten.length} file(s) written` +
        (result.gitInitialized ? " (git initialized)\n" : " (git skipped)\n"),
    );
    return 0;
  } catch (e) {
    if (e instanceof EmitterError) {
      process.stderr.write(`wp-to-astro: ${e.message}\n`);
      return 1;
    }
    if (e instanceof RestAuthError) {
      process.stderr.write(
        `wp-to-astro: ${e.message}\n` +
          `  Generate one at: ${source.replace(/\/+$/, "")}/wp-admin/profile.php#application-passwords-section\n`,
      );
      return 1;
    }
    if (e instanceof RestParseError) {
      process.stderr.write(`wp-to-astro: ${e.message}\n`);
      return 2;
    }
    process.stderr.write(
      `wp-to-astro: migration failed: ${(e as Error).message}\n`,
    );
    return 2;
  }
}

async function viaWxr(filepath: string) {
  try {
    const st = await fs.stat(filepath);
    if (!st.isFile()) {
      process.stderr.write(`wp-to-astro: not a file: ${filepath}\n`);
      return null;
    }
  } catch (e) {
    process.stderr.write(
      `wp-to-astro: cannot read WXR file '${filepath}': ${(e as Error).message}\n`,
    );
    return null;
  }
  return parseWxr(filepath);
}

async function viaRest(url: string, opts: MigrateOptions) {
  const authUser = opts.authUser ?? process.env["WP_AUTH_USER"];
  const authPass = opts.authPass ?? process.env["WP_AUTH_PASS"];
  if (!authUser || !authPass) {
    throw new RestAuthError(
      `REST migration requires --auth-user and --auth-pass (or WP_AUTH_USER / WP_AUTH_PASS env vars). ` +
        `Generate an Application Password in WordPress: Users → Profile → Application Passwords.`,
    );
  }
  const auth: RestAuth = { user: authUser, pass: authPass };
  return parseRest(url, auth);
}
