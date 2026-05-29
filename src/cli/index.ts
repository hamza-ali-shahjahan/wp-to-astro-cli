#!/usr/bin/env node
import { Command } from "commander";
import { runMigrate } from "./migrate.js";

const program = new Command();

program
  .name("wp-to-astro")
  .description(
    "Migrate a WordPress site (WXR export) to a clean Astro + MDX codebase.",
  )
  .version("0.1.0");

program
  .command("migrate")
  .description("Migrate a WXR file to an Astro project directory")
  .argument("<wxr-file>", "Path to a WordPress WXR XML export file")
  .requiredOption("-o, --out <dir>", "Output directory for the Astro project")
  .option("-f, --force", "Overwrite a non-empty output directory", false)
  .action(async (wxrFile: string, opts: { out: string; force: boolean }) => {
    const code = await runMigrate(wxrFile, {
      out: opts.out,
      force: opts.force,
    });
    process.exit(code);
  });

program.parseAsync(process.argv).catch((e: unknown) => {
  process.stderr.write(
    `wp-to-astro: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exit(2);
});
