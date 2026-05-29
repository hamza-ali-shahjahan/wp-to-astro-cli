#!/usr/bin/env node
/**
 * Post-build step: copy non-TS asset files (e.g. *.tmpl) from src/ to dist/.
 *
 * tsc doesn't move non-.ts files, but our emitter loads templates at runtime
 * relative to its own location. This keeps the dev layout (src/.../templates/)
 * and the built layout (dist/.../templates/) symmetric.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PAIRS = [
  {
    from: path.join(ROOT, "src/emitters/astro/templates"),
    to: path.join(ROOT, "dist/emitters/astro/templates"),
  },
];

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(from, ent.name);
    const dst = path.join(to, ent.name);
    if (ent.isDirectory()) {
      await copyDir(src, dst);
    } else if (ent.isFile()) {
      await fs.copyFile(src, dst);
    }
  }
}

for (const pair of PAIRS) {
  await copyDir(pair.from, pair.to);
  process.stdout.write(`copy-templates: ${path.relative(ROOT, pair.from)} → ${path.relative(ROOT, pair.to)}\n`);
}
