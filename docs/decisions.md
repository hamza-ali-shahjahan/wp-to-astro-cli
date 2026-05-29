# Architecture Decision Records

Short, dated entries. Format: **Context → Decision → Consequence**. Don't relitigate; if reopening, add a new entry that supersedes.

---

## 2026-05-28 — Apache-2.0, not AGPL or MIT

**Context:** Open-core devtool with a paid hosted service planned. Three plausible licenses: MIT (permissive, no patent clause), Apache-2.0 (permissive, explicit patent grant), AGPL-3.0 (copyleft, network-use trigger).

**Decision:** Apache-2.0.

**Consequence:** Agencies can integrate the CLI into proprietary workflows without copyleft concerns (eliminates AGPL chill). Patent grant protects downstream users vs MIT. We rely on *ops + managed service convenience* as the moat, not license restrictions — matching Trigger.dev's posture, not Dub.co's.

---

## 2026-05-28 — pnpm, not npm

**Context:** Need a package manager. Options: npm (default), pnpm (content-addressed store, strict resolution), yarn (loss of momentum), bun (too new for production OSS).

**Decision:** pnpm.

**Consequence:** Faster installs in CI, strict peer-dep handling catches issues earlier, matches the OSS devtool peer group (Trigger.dev, Inngest). Slight friction for contributors who only have npm — README will note this and we'll accept npm fallback when feasible.

---

## 2026-05-28 — `source-adapter → IR → emitter` architecture

**Context:** Need a structure that survives adding Webflow/Framer/Ghost as sources and Next/Hugo as emitters, without becoming a rewrite each time.

**Decision:** A versioned Zod IR (`Site`) in the middle. Adapters parse to IR. Emitters render from IR. They never know about each other.

**Consequence:** Adapters and emitters are independently swappable and testable. The IR shape is the contract — bumping `IR_VERSION` is a breaking change that requires updating all adapters and emitters in lockstep. Future contributors write one adapter or one emitter; they don't touch the spine.

---

## 2026-05-28 — WXR-first, REST API later

**Context:** WordPress has two extraction paths: WXR XML export (universal, but loses ACF/metadata) and REST API (live, structured, but requires auth + plugin support).

**Decision:** Pass 1 implements WXR only. REST API arrives in Pass 3.

**Consequence:** Lower auth complexity for the spine slice. WXR users can validate the tool with a free WP export; REST joins once core block mapping is proven. ACF/CPT fidelity is honestly limited until REST lands — sales copy must reflect this.
