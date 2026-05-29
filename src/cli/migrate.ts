import path from "node:path";
import { promises as fs } from "node:fs";
import { parseWxr } from "../source-adapters/wxr/index.js";
import { emitAstro, EmitterError } from "../emitters/astro/index.js";

export type MigrateOptions = {
  out: string;
  force: boolean;
  skipImages: boolean;
};

/**
 * CLI handler for `wp-to-astro migrate <wxr-file> --out <dir>`.
 *
 * Returns a process exit code: 0 success, 1 usage/validation error,
 * 2 runtime/parse/write error.
 */
export async function runMigrate(
  wxrFile: string,
  opts: MigrateOptions,
): Promise<number> {
  try {
    const st = await fs.stat(wxrFile);
    if (!st.isFile()) {
      process.stderr.write(`wp-to-astro: not a file: ${wxrFile}\n`);
      return 1;
    }
  } catch (e) {
    process.stderr.write(
      `wp-to-astro: cannot read WXR file '${wxrFile}': ${(e as Error).message}\n`,
    );
    return 1;
  }

  const outDir = path.resolve(opts.out);

  try {
    const site = await parseWxr(wxrFile);
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
    process.stderr.write(
      `wp-to-astro: migration failed: ${(e as Error).message}\n`,
    );
    return 2;
  }
}
