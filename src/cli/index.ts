#!/usr/bin/env node
import { Command } from "commander";
import { runMigrate } from "./migrate.js";

const program = new Command();

program
  .name("wp-to-astro")
  .description(
    "Migrate a WordPress site (WXR export) to a clean Astro + MDX codebase.",
  )
  .version("0.4.0");

program
  .command("migrate")
  .description(
    "Migrate a WordPress site to an Astro project. Source is either a WXR XML file or a live WP site URL.",
  )
  .argument("<source>", "Path to a WXR XML file, or a https:// URL of a live WP install")
  .requiredOption("-o, --out <dir>", "Output directory for the Astro project")
  .option("-f, --force", "Overwrite a non-empty output directory", false)
  .option(
    "--skip-images",
    "Skip the image download/conversion pipeline; image URLs stay remote",
    false,
  )
  .option(
    "--auth-user <user>",
    "WordPress username (REST source only; env: WP_AUTH_USER)",
  )
  .option(
    "--auth-pass <password>",
    "WordPress Application Password (REST source only; env: WP_AUTH_PASS — prefer env for secrets)",
  )
  .action(
    async (
      source: string,
      opts: {
        out: string;
        force: boolean;
        skipImages: boolean;
        authUser?: string;
        authPass?: string;
      },
    ) => {
      const code = await runMigrate(source, {
        out: opts.out,
        force: opts.force,
        skipImages: opts.skipImages,
        ...(opts.authUser !== undefined ? { authUser: opts.authUser } : {}),
        ...(opts.authPass !== undefined ? { authPass: opts.authPass } : {}),
      });
      process.exit(code);
    },
  );

program.parseAsync(process.argv).catch((e: unknown) => {
  process.stderr.write(
    `wp-to-astro: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exit(2);
});
