---
paths: ["src/ir/**"]
---

# IR rules

- **Zod is the source of truth.** Define schemas first; export inferred TS types via `z.infer<typeof X>`. Never hand-write a type that duplicates a schema.
- **`IR_VERSION` is a string constant.** Bump it on any breaking shape change. Adapters must include it in the `Site` they return; emitters must reject mismatched versions with a clear error.
- **Blocks are a discriminated union** keyed on `type`. New block variants go in this file, not in adapter or emitter code. Adapters map TO this union; emitters render FROM it.
- **No imports from `source-adapters/` or `emitters/`.** IR is the contract; it must not depend on either side. Circular imports here are an architectural smell.
- **Optional fields use `.optional()`, not `.nullable()`.** We treat absent and null the same; pick one and stay consistent.
