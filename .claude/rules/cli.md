---
paths: ["src/cli/**", "bin/**"]
---

# CLI rules

- **`commander` is the only CLI framework here.** Don't introduce yargs/clipanion/oclif.
- **Commands live in their own file** (`migrate.ts`, future: `verify.ts`). `index.ts` only registers them — no business logic in the entrypoint.
- **CLI handlers compose adapter + emitter; they don't contain transformation logic.** If you find yourself writing a block-mapping branch in `migrate.ts`, it belongs in the adapter or emitter.
- **Exit codes matter.** `0` success, `1` validation/usage error (bad flags, missing input file), `2` runtime failure (parse error, write failure). Don't conflate them.
- **`--force` controls overwrite behavior** on a non-empty `--out` dir. Default behavior is to refuse and print a clear error. No interactive prompts in v1 — this is a scriptable tool.
- **The `bin/wp-to-astro.mjs` shim imports from `dist/`, never from `src/`.** Keep it a 3-line shebang shim.
