# Build & Launch Plan: WordPress→Clean-Codebase Migration Tool as the Wedge for a Native AI CMS

## TL;DR
- **Build the WordPress→Astro migration tool first, not all three platforms.** Webflow and Framer can be exported with adequate static-scraper tooling that already exists; the genuine, expensive pain (and the largest addressable market) is WordPress, and Astro content collections + MDX is the correct target format because file-based content is what AI agents can actually manipulate. Ship a Node/TypeScript CLI under Apache-2.0 with a paid hosted service at **$249–$499 per site** for v1.
- **Open-source the engine, sell the convenience.** Put the source adapter + intermediate representation (IR) + Astro emitter + CLI in the open repo. Hold back: managed hosted runs (no setup), batch/multi-site processing, premium adapters (ACF Pro / WooCommerce product catalogs / Elementor templates), the redirect-monitoring service, and the AI-rewrite layer. This is the Dub.co / Documenso / n8n playbook adapted to a one-shot service. Lifetime/one-time pricing is essentially absent in this category — that is a market gap you can exploit explicitly.
- **Launch sequence: Show HN with the open-source repo first; r/SideProject + r/selfhosted same week; r/webdev's Showoff Saturday in week 2; then a "WordPress is bleeding" content angle on dev.to and X targeting the post-Mullenweg/WP Engine refugee crowd.** Do NOT lead with the paid service. Lead with the CLI, let the GitHub stars accumulate, then convert. Target metric for v1: 500 GitHub stars and 20 paid migrations in 90 days.

## Key Findings

### 1. Output target: Astro content collections + MDX is correct. Lock it in.
Astro is the right target for content-heavy marketing/SMB sites, and the reasons are not just performance — they are *editability*. Astro ships zero JavaScript by default [Enqcode](https://enqcode.com/blog/next-js-vs-remix-vs-astro-in-2025-who-wins-the-seo-performance-race) and consistently gets 90%+ Lighthouse scores on content sites; benchmarks comparing identical sites built in both frameworks show Astro pages shipping ~5KB JS vs Next.js's ~85KB gzipped, [BetterLink Blog](https://eastondev.com/blog/en/posts/dev/20251202-astro-vs-nextjs-comparison/) and Astro builds on a 1,000-page docs site complete in ~18s vs Nextra's ~52s. [BetterLink Blog](https://eastondev.com/blog/en/posts/dev/20251202-astro-vs-nextjs-comparison/) More importantly for the AI-CMS thesis: Astro's content collections store every post as a discrete `.md` or `.mdx` file with a Zod-validated frontmatter schema. That is the ideal substrate for an AI agent — discrete files, deterministic schemas, build-time validation, and clean Git diffs per content change. Next.js App Router's content can live in MDX too, but its default mental model is React components fetching data, and you pay a React-runtime tax on every page even for static content.

Use Next.js only if the site has heavy client-side interactivity (dashboards, auth, real-time). For the WordPress refugee market — marketing sites, blogs, agency sites, local-business pages — Astro wins on every relevant axis.

### 2. Existing tooling is a graveyard. The gap is real.
- **WP2Static**: Unmaintained. Strattic acquired the plugin in 2021; [Headless Hostman](https://headlesshostman.com/what-happened-to-wp2static-and-strattic/) Elementor then acquired Strattic on June 8, 2022 (Elementor's official blog: "Elementor has officially acquired Strattic, the world's predominant WordPress static hosting solution"). [Elementor](https://elementor.com/blog/elementor-acquires-strattic/) Strattic itself shut down on January 1, 2025 per Headless Hostman's coverage: "It's official. Strattic shut down on January 1, 2025." [Headless Hostman](https://headlesshostman.com/strattic-eliminates-static-hosting-well-buy-out-your-contract/) Users were "left stranded with no roadmap, no migration tools, and no viable path forward." [Headless Hostman](https://headlesshostman.com/what-happened-to-wp2static-and-strattic/)
- **Simply Static**: Active but outputs static HTML of the rendered WP theme — not a clean developer codebase. Not a developer tool; a WP plugin for non-devs.
- **Shifter / HardyPress**: Managed static WP hosting; lock-in style, not export-to-own-codebase.
- **wordpress-export-to-markdown** (lonekorean on GitHub): The de facto OSS tool. Recommended by Astro, Eleventy, and Tina docs. [Coder's Block](https://codersblock.com/blog/announcing-wordpress-export-to-markdown-v3/) Genuinely good for blog posts, but ignores ACF, custom post types, Gutenberg block fidelity, SEO metadata transport, redirect map generation, and image optimization. It's a one-person hobby script — not a productized service.
- **Astro's official "Migrate from WordPress" doc**: A documentation page with manual steps, not a tool.

The competitive gap: **there is no maintained, productized, AI-native WordPress→clean-codebase tool that handles Gutenberg blocks faithfully, preserves SEO metadata, generates a 301 redirect map, and ships a deployable Astro repo.** That is your wedge.

For Webflow: Native code export costs $24/mo+ Workspace plan; [Thecssagency](https://www.thecssagency.com/blog/how-to-export-code-from-webflow) CMS content, forms, search, password-protected pages do not export. [Webflow Help Center](https://help.webflow.com/hc/en-us/articles/33961386739347-How-do-I-export-my-Webflow-site-code) Community tools (ExFlow, NoCodeExport, NoCodeXport) crawl the rendered site for $5–$15/mo. Webflow migration is mostly *already solved* by scrapers. Defer.

For Framer: No native code export. [Framer](https://www.framer.com/help/articles/can-i-export-my-website-to-html-and-self-host-it/) React-based, so static scrapes have issues (hydration breaks pages). [NoCodeExport](https://www.nocodeexport.com/en/blog/how-to-get-code-from-framer) Tools like NoCodeExport and letaiworkforme.com exist but the market is smaller. Defer to v2.

### 3. The hard technical problems and the right extraction strategy

**Use WordPress REST API as primary, WXR as fallback. Not the database directly.**

- **WXR (Tools → Export XML)**: Ubiquitous, no auth needed beyond the export, but loses ACF custom fields entirely (they live in `wp_postmeta` and aren't in WXR), can fail with timeouts on large sites, and contains raw Gutenberg block comments only when content was authored in the block editor.
- **REST API (`/wp-json/wp/v2`)**: Live data, includes Gutenberg block markup via `?context=edit` (returns `content.raw` with `<!-- wp:* -->` comments intact) — but requires authentication, ACF fields require either ACF 5.11+ with "Show in REST" enabled per field [Criticalwp](https://criticalwp.com/blog/advanced-custom-fields-complete-guide/) or the `acf-to-rest-api` plugin, [Seahawk Media](https://gautamkhorana.com/wordpress-to-astro-migration/) and Yoast/RankMath metadata needs their respective REST integrations (Yoast SEO for WPGraphQL, RankMath SEO Schema). [Seahawk Media](https://gautamkhorana.com/wordpress-to-astro-migration/)
- **Direct DB**: Highest fidelity, captures everything, but requires SSH/DB credentials — non-starter for a hosted service most users will trust.

**Recommended primary path**: REST API + Application Password auth + auto-detect plugins (ACF, Yoast, RankMath) and bypass if their REST integrations are missing. Fallback to WXR upload for users who can't or won't expose REST.

**Gutenberg block parsing**: Use `@wordpress/block-serialization-default-parser` (npm, MIT). It's the official WP team's PEG-grammar-based parser in JavaScript. [GitHub](https://github.com/WordPress/gutenberg/blob/trunk/packages/block-serialization-default-parser/README.md) Pipe `content.raw` through it, get a structured tree of `{blockName, attrs, innerBlocks, innerHTML}`, [npm](https://www.npmjs.com/package/@wordpress/block-serialization-spec-parser) then map each block to an MDX component or clean HTML. Map `core/paragraph` → `<p>`, `core/heading` → `<h2/3>`, `core/image` → `<Image>` Astro component, `core/embed` → MDX `<YouTube id="…">` etc. For unknown/custom blocks, fall through to raw innerHTML wrapped in a `<RawBlock>` MDX component with a TODO comment.

**ACF / custom post types**: Each ACF group with "Show in REST API" enabled appears under `acf` in REST responses. [Advanced Custom Fields](https://www.advancedcustomfields.com/blog/acf-5-11-release-rest-api/) Custom post types appear at `/wp-json/wp/v2/{post_type}` if `show_in_rest: true`. Generate one Astro content collection per CPT with a Zod schema derived from the ACF field definitions. For ACF fields not exposed via REST, prompt the user to install `acf-to-rest-api` or skip with a warning. **Be honest in the UI** that without these plugins, you cannot extract ACF data perfectly.

**Shortcodes**: Shortcodes are PHP execution hooks. They cannot be "converted" without knowing what plugin produced them. v1 strategy: detect with regex, build a registry of common shortcode mappings (`[gallery]` → MDX Gallery component, `[caption]` → `<figure>`, `[contact-form-7]` → static placeholder with TODO), and emit unmapped shortcodes as MDX comments with a clear `<!-- TODO: shortcode '[xyz]' could not be auto-converted -->` marker. Ship a documented extension API for users to register custom resolvers.

**Media**: Download every referenced image via the REST API's media endpoint, convert PNG/JPG to WebP (sharp library), [Zoxide](https://www.bitdoze.com/wordpress-to-astro-migration/) output to `src/assets/images/`, and rewrite all references to use Astro's `<Image>` component, which gets responsive optimization for free. Skip videos and large files (>5MB) in v1; reference them as remote URLs.

**URL preservation and 301 redirects**: This is the make-or-break SEO feature. Read WordPress's permalink structure (REST `/wp-json/wp/v2/settings` exposes it). Generate two artifacts:
1. Astro routes that match the old WP URL structure (`/2024/03/15/my-post/` → an Astro dynamic route in `src/pages/[year]/[month]/[day]/[slug].astro`).
2. A `vercel.json` / `_redirects` file with explicit 301s for any URLs that genuinely changed.

For sites moving from ugly `/?p=123` URLs to clean slugs, generate per-post 301s. Without this, customers lose rankings — empirical example from the Transferito study: a free-tool migration that "worked" silently caused a 38% traffic drop in two weeks, requiring a $2,400 fix. [Transferito](https://transferito.com/blog/we-compared-wordpress-migration-costs-for-small-businesses-the-results-shocked-us/)

**Yoast / RankMath SEO metadata**: Yoast exposes meta via Yoast SEO REST API (`yoast_head_json` on every post). RankMath exposes via `rank_math_head` field. Extract `title`, `description`, `og:image`, `canonical`, `robots`, `schema`. Write into Astro frontmatter; emit `<SEO>` component with `next-seo`-style props. Re-emit JSON-LD schema by hand in an Astro component — usually higher quality than what the WP plugin output.

**Design fidelity — be honest**. The honest promise is: **content fidelity, not design fidelity**. Themes are PHP + custom CSS + theme-specific Gutenberg block variations. Attempting to recreate the visual design is a tarpit. The pitch should be: "You get a clean, modern Astro starter with your content, your SEO, and your URLs preserved. You bring (or commission) the design." Ship 3–5 polished Astro starter templates the user can pick from at migration time — solo blog, agency, SaaS marketing, local business, docs. This honest framing dramatically reduces support cost and matches what existing migration tools punt on; Smarter Business's published WP→Astro write-up explicitly notes that "there are hardly any mature WordPress-to-Astro migration tools" [Smarterbusiness](https://www.smarterbusiness.at/en/blog/migrate-wordpress-to-astro/) and the few that exist "lose important metadata, don't optimize images properly, break with complex shortcodes, ignore custom post types." [Smarterbusiness](https://www.smarterbusiness.at/en/blog/migrate-wordpress-to-astro/)

**Dynamic features**: Forms → emit a stub that points to Formspree/Web3Forms/Resend with a TODO in code comments. Comments → static read-only export from WP comments table; suggest Giscus (GitHub Discussions) for new comments. Search → ship Pagefind integration by default (works at build time, no server). WooCommerce → out of scope for v1; document explicitly as "not migratable, use Shopify or keep WP for commerce."

### 4. The open-core split (where the money is)

Studying Dub.co, Documenso, Trigger.dev, Inngest, n8n, ToolJet, and Cal.com, a clear pattern emerges. The successful open-core devtool model is:

**In the open repo (Apache-2.0 recommended over MIT for patent grant; over AGPL because AGPL frightens enterprise adopters and you don't need its copyleft protection for a one-shot CLI):**
- Source adapter for WordPress (REST + WXR)
- IR (intermediate representation) — a stable JSON schema for "a website"
- Astro emitter producing a working deployable repo
- CLI runnable locally (`npx wp-to-astro migrate https://example.com`)
- Core Gutenberg block mappings (~30 standard blocks)
- Basic image download + WebP conversion
- Redirect map generation
- One or two Astro starter templates
- Documentation, contributing guide, plugin/adapter API

**Behind the paid hosted service (the "managed migration"):**
- The customer never touches a CLI. They paste a URL + paste an Application Password, click migrate, get a PR opened against their GitHub repo and a Vercel deploy preview within 15 minutes.
- Premium source adapters: ACF Pro custom fields, Elementor and Beaver Builder layouts (proprietary structures), WooCommerce product catalogs (static export), bbPress/BuddyPress.
- Batch processing (multiple sites in one run, agency use case)
- AI rewrite pass: optional Claude/GPT pass to clean up legacy formatting, fix broken HTML, harmonize heading hierarchies, generate missing alt text on images.
- 7-day post-migration redirect monitoring (we crawl old URLs, check redirect health, alert on broken paths).
- Email support, Discord priority, fix-it guarantee.
- Premium templates (10+ polished Astro starters)

**The cannibalization protection** is *time and ops*, not features. The OSS CLI works, but a self-hosted run on a 200-post site takes someone an evening of debugging plugin quirks, ACF authentication, image timeouts, and template selection. The paid service does it in 15 minutes with a refund guarantee. This is the same trade Cal.com, PostHog, and Plausible run — PostHog CEO James Hawkins put the empirical ratio plainly on Jamstack Radio Ep. #119: "90% of our customers are clicking the cloud button versus the self hosted." [Heavybit](https://www.heavybit.com/library/podcasts/jamstack-radio/ep-119-customer-retention-with-james-hawkins-of-posthog) That gap is your moat.

**License: Apache-2.0**, not AGPL. AGPL works for Dub.co (per its own README, "the core technology (99%) is fully open source, licensed under AGPLv3 and the last 1% is covered under a commercial license") [GitHub](https://github.com/dubinc/dub) because they're a hosted product where the AGPL is meant to prevent AWS-style cloning. Your wedge is a one-shot CLI that runs on the user's machine — AGPL doesn't help you and scares off agencies who would otherwise integrate it into their workflows. Trigger.dev (Apache-2.0, fully self-hostable) [Trigger.dev](https://trigger.dev/blog/v3-open-access) [Trigger.dev](https://trigger.dev/docs/self-hosting/overview) is a better template.

### 5. Pricing: $249 to $499 one-time for the basic managed migration

Triangulating from the data:
- WordPress agency migrations: $200–$1,000 freelancer (WPBeginner/Codeable); [Duplicator](https://duplicator.com/cost-to-migrate-wordpress-site/) $500–$5,000 agency (Cloudways); [Duplicator](https://duplicator.com/cost-to-migrate-wordpress-site/) [Cloudways](https://www.cloudways.com/blog/website-migration-cost/) $1,500–$5,000 for revenue-critical sites (Transferito). [Transferito](https://transferito.com/blog/we-compared-wordpress-migration-costs-for-small-businesses-the-results-shocked-us/)
- HubSpot CMS migration: $500 flat + $20/page. [Duplicator](https://duplicator.com/cost-to-migrate-wordpress-site/)
- Webflow specialist migration: $200–$800 small site, [Dotransfer](https://dotransfer.me/2026/05/08/how-much-does-website-migration-cost/) $5,000–$15,000 agency.
- WordPress migration plugin lifetime deals: WP2Static was $100 lifetime; [WPCrafter](https://www.wpcrafter.com/what-is-static-wordpress-hosting-pros-cons/) WP Migrate Pro $49/year; [WPBeginner](https://www.wpbeginner.com/showcase/best-wordpress-migration-services/) All-in-One WP Migration Unlimited $69 one-time. [WPBeginner](https://www.wpbeginner.com/showcase/best-wordpress-migration-services/)

**Recommended pricing structure (v1):**
- **Open-source CLI**: Free, Apache-2.0
- **Migrate**: $249 one-time, single site up to 100 posts/pages, includes managed run, redirect map, 1 starter template, 7-day fix-it guarantee
- **Migrate Pro**: $499 one-time, up to 500 posts/pages, ACF Pro adapter, AI rewrite pass, choice of all premium templates, 30-day redirect monitoring
- **Agency**: $1,499 one-time for 5-site bundle, or $2,999/yr unlimited
- **Add-on**: WooCommerce product static export $299 (if/when built)

The one-time framing is critical for two reasons. First, **it's structurally aligned to the customer's mental model** — they're paying to escape a recurring cost (WordPress hosting + plugin licenses + maintenance), and a one-time fee mirrors that. Second, **it's a real market gap**: every modern open-core dev infra tool studied uses subscriptions. Documenso's self-host enterprise edition starts at $30,000/yr per its own announcement ("The self-hosted enterprise license starts at 30,000 USD per year"). [Documenso](https://documenso.com/blog/introducing-self-hosted-signing-infrastructure-for-enterprise) Trigger.dev is per-invocation. n8n Business is €667/mo. [Toolradar](https://toolradar.com/blog/n8n-pricing-2026) Inngest Hobby is $20/mo. None of them sell a one-time anything, because they're *ongoing platforms*. A migration tool is a *one-shot job*. The pricing should match the job shape.

The danger to flag: you cannot offer the paid SLA at this price if you do high-touch hand-holding. The unit economics work only if 80%+ of paid runs succeed without human intervention. Budget for a Stripe refund flow from day one; treat refunds as a feature, not a failure.

### 6. Architecture: source adapter → IR → emitter

This is the single most important architectural decision because it future-proofs the open repo for Webflow and Framer in v2/v3 and makes the codebase legible to contributors.

```
[Source Adapter]              [Intermediate Representation]      [Emitter]
WordPress (REST/WXR)    ─┐                                    ┌─→ Astro + MDX
Webflow (CMS API+crawl) ─┼─→  site.json (typed IR schema)  ──┤
Framer (rendered DOM)   ─┘                                    └─→ Next.js (v2)
                                                              └─→ Hugo (community)
```

The IR is a versioned JSON schema covering: pages, posts, custom collections, media, redirects, SEO metadata, navigation, theme metadata. Anyone can write a new source adapter (Ghost, Squarespace, Drupal) or a new emitter (SvelteKit, Nuxt). This is the surface area open-source contributors will care about.

**Tech stack for the engine:**
- **Language**: TypeScript on Node.js 20+. Required for `@wordpress/block-serialization-default-parser`, sharp, and the broader npm ecosystem.
- **CLI framework**: `commander` or `clipanion`
- **HTML→MDX conversion**: `rehype` + `remark` + `hast-util-to-mdast` pipeline; output via `mdast-util-to-markdown` with MDX extensions
- **Image processing**: `sharp` for WebP/AVIF conversion
- **HTTP**: `undici` or native fetch with concurrency limiting via `p-limit`
- **Schema validation**: `zod`
- **Git output**: `simple-git` to initialize the output repo and commit cleanly
- **Tests**: `vitest`, fixtures from real anonymized WP exports

**Hosted service stack (matches the user's locked stack):**
- **Frontend**: Next.js or Astro on Vercel (the marketing site, dashboard, migration progress UI)
- **DB + Auth**: Supabase (Postgres + email/GitHub auth + Row Level Security)
- **Workers**: Long-running migrations need a queue. Use Inngest or Trigger.dev (open-source background jobs, free tier covers initial volume). Avoid putting migration logic in Vercel functions — they time out at 60s on Pro plan.
- **Storage**: Supabase Storage for migration artifacts (the generated repo as a tarball, image bundles)
- **Output delivery**: Push to a GitHub repo on the user's account via the GitHub App flow + open a PR with one-click Vercel deploy. Don't try to host the output yourself — that creates ongoing infra costs.
- **Payments**: Stripe one-time Checkout; webhook to enqueue the migration job; refund button in dashboard.

### 7. v1 MVP scope — what to ship, what to defer

**SHIP in v1 (the smallest lovable migration):**
- WordPress REST API + WXR fallback
- ~30 core Gutenberg block mappings
- Yoast OR RankMath SEO metadata (auto-detect which is installed)
- Image download + WebP conversion + Astro `<Image>` rewriting
- 301 redirect map (Vercel + Netlify formats)
- One Astro starter template ("blog/marketing", Tailwind, Pagefind search built-in)
- CLI runnable locally
- Hosted dashboard: paste URL → paste Application Password → progress UI → GitHub PR
- Stripe one-time checkout at $249

**DELIBERATELY DEFER:**
- Webflow and Framer adapters (defer to v2)
- WooCommerce, Elementor, Beaver Builder, Divi (defer; document as not supported)
- Multilingual sites (WPML, Polylang) — explicitly out of scope v1
- Membership sites, paywalls
- Visual design recreation — punt entirely
- The "AI CMS" editing interface — that's the v3/Phase 2 vision; do not build it now
- Self-service plugin/adapter marketplace
- Native commenting export beyond static read-only

**Verification gates (SLICE → BUILD → VERIFY → SHIP):**
- SLICE: Define IR schema as a Zod type. One slice = one block type end-to-end (input WP block → IR → MDX output).
- BUILD: Each slice has a golden-file test with a real anonymized fixture.
- VERIFY: A "verify" command in the CLI that runs the migrated Astro build, executes Lighthouse, and diffs page titles / meta against the source site. If Lighthouse drops below 90 or any indexed URL is missing a redirect, the migration is flagged.
- SHIP: Hosted run only succeeds if the verification gate passes; otherwise, manual review queue + email.

### 8. Launch sequence (the part that matters most)

The open-source-as-marketing flywheel is real but slow. Cal.com hit roughly 50,000 signups via this model — confirmed via Cal.com's own public Open Startup metrics page and a contemporaneous tweet from co-founder Peer Richelsen: "damn, 50k signups on cal.com 🤯 y'all are crazzyyy thats an entire football stadium full of people." [Substack](https://kp.substack.com/p/how-cal-is-building-an-open-source) Dub.co got to scale by leading with the repo. PostHog's own retrospective is unsparing: "developers typically want to wrangle your software themselves before paying for help or maintenance. This makes it a hard sell." [PostHog](https://posthog.com/blog/open-source-business-models) The implication: **the repo is the lead magnet, the paid service is the upsell**. Don't reverse this.

**Week -2 (preparation):**
- Clean repo, thorough README with GIF demo, contributing guide, real test fixtures committed.
- Land 50–100 stars before launch via personal network. As Vince Caldéron documented in his own dev.to retrospective ("How I promoted my open source repo to 6k stars in 6 months"), the Wasp/OpenSaaS project reached 6,000 GitHub stars in 6 months [DEV Community](https://dev.to/wasp/how-i-promoted-my-open-source-repo-to-6k-stars-in-6-months-3li9) specifically through a clean repo, r/webdev Showoff Saturday posts, cross-posts to r/SaaS and r/sideproject, and consistent F5Bot-driven comment outreach in adjacent discussions. [DEV Community](https://dev.to/wasp/how-i-promoted-my-open-source-repo-to-6k-stars-in-6-months-3li9) Copy that distribution playbook.
- Set up a tiny website (Astro, of course — dogfooding) with the CLI install command above the fold and the paid service below.
- Pre-write a 1,500-word dev.to / Hashnode post titled something like "I migrated 12 WordPress sites to Astro this month. Here's what broke."

**Week 0 — Hacker News (Tuesday or Wednesday, ~9am ET):**
The HN launch playbook is unambiguous from the data:
- Use `Show HN:` prefix to land in the Show tab (less competitive) [Lucasfcosta](https://lucasfcosta.com/2023/08/21/hn-launch.html)
- Title pattern that works (from the Show HN sample): "Show HN: [Name] – Open-source CLI to convert WordPress sites to Astro" [Lucasfcosta](https://lucasfcosta.com/2023/08/21/hn-launch.html) or "Show HN: I converted my 200-post WordPress blog to a clean Astro repo (open source tool)"
- The Hugo equivalent ("Show HN: I made a service to convert WordPress blogs to Hugo," HN item 42795249, January 2025) framed it as a personal-pain story — "It came about when I was talking to somebody who was trying to move their site over and didn't want to manually copy and reformat all their posts. They had trouble finding a tool to do it, so I wrote one." [Hacker News](https://news.ycombinator.com/item?id=42795249) Copy that template exactly: pain → tool → repo.
- Link to the GitHub repo, NOT the landing page. HN dev audience trusts repos. [Markepear](https://www.markepear.dev/blog/dev-tool-hacker-news-launch)
- First comment from author: paragraph on origin story, what's in the OSS repo, honest list of limitations. Do NOT mention the paid service in the post — let people find it via the README/site link.
- Engage every comment within 30 minutes for the first 6 hours. Per the HN guidelines themselves: "When criticized, act like the critics are doing you a favor." [Markepear](https://www.markepear.dev/blog/dev-tool-hacker-news-launch)

**Week 0 — Same week:**
- **r/SideProject** (Tue/Wed 8–11am ET): "I built an open-source tool that converts WordPress to a clean Astro codebase. Looking for sites to test it on." Link to GitHub. Promotion-tolerant sub, [Mediafa](https://www.mediafa.st/marketing-on-rsideproject) but lead with the work.
- **r/selfhosted**: This is a high-conversion niche per the data because the audience self-identifies with "I want to escape SaaS." Frame: "Tired of WordPress maintenance? Open-source CLI to convert your WP site to a static Astro codebase you can self-host on Cloudflare Pages for free."
- **GitHub topics**: Tag the repo `wordpress`, `astro`, `migration`, `static-site`, `mdx`, `cli`. Submit to `awesome-astro`, `awesome-wordpress`, `awesome-static-site-generators`.

**Week 1:**
- **r/webdev Showoff Saturday**: Project demo GIF, technical detail, link to repo. r/webdev tolerates self-promo only in this thread. [DEV Community](https://dev.to/wasp/how-i-promoted-my-open-source-repo-to-6k-stars-in-6-months-3li9)
- **r/wordpress**: This is delicate. r/wordpress audience defends WordPress reflexively. Don't post "leave WordPress." Post a technical writeup: "Building a faithful Gutenberg block parser in Node — here's what I learned about the block grammar." Link to the OSS repo at the bottom. Be a peer, not a vendor.
- **Indie Hackers**: Post the launch + early revenue numbers (transparently). "Launched a WordPress→Astro migration tool — $X in the first week from Y customers."
- **dev.to / Hashnode**: Publish the pre-written long-form post. Cross-post to Medium.

**Week 2–4:**
- **Twitter/X**: Daily build-in-public posts. Target the post–WP Engine/Mullenweg drama audience — there's an identifiable population of WordPress users actively researching exits. Use specific keywords: "leaving WordPress", "WordPress maintenance", "static site WordPress", "headless WordPress".
- **Product Hunt**: Yes, do it, but in week 3–4 AFTER the GitHub stars are visible — Product Hunt rewards traction signal. Don't waste it on day one.
- **F5Bot keyword alerts**: Set up for "wordpress to astro", "wordpress migration", "leave wordpress", "wordpress alternative". When someone asks on Reddit / forums, respond as a helpful peer with a CLI command, not a sales pitch. [DEV Community](https://dev.to/wasp/how-i-promoted-my-open-source-repo-to-6k-stars-in-6-months-3li9)
- **YouTube**: One screencast — "Migrating a real WordPress site to Astro in 12 minutes" — using a public test site. This is the highest-leverage long-tail asset and what agencies will share internally.

**Channels NOT to invest in for v1**: LinkedIn (wrong audience for a CLI), TikTok (irrelevant), paid ads (open-source projects burn money on paid before they have organic signal), Lobsters (too small to matter, and unfriendly to launch posts).

**Traction metric for "is this working"**:
- Week 1: 200+ GitHub stars, 5+ paid migrations
- Week 4: 500+ stars, 20+ paid migrations (~$5K revenue)
- Month 3: 1,500+ stars, 60+ paid migrations, 1 viral case study (a notable WP site that migrated)

If you don't hit ~500 stars by week 4, the launch missed and you should diagnose: was the README weak, was the title wrong, did HN reject it. Don't relaunch the same week.

## Recommendations

**Build in this order. Don't deviate.**

1. **Week 1–2**: Design the IR schema (Zod types). This is the most important code in the repo. Get it right before writing any extractor.
2. **Week 3–4**: WordPress REST adapter + WXR fallback + Gutenberg parser integration. Test against 5 anonymized real WP sites you've collected from friends.
3. **Week 5–6**: Astro emitter + one starter template + the `verify` command. Until verify works, you cannot promise SLA on the paid service.
4. **Week 7**: Image pipeline + redirect generation + Yoast/RankMath extraction.
5. **Week 8**: Hosted dashboard (Supabase + Vercel + Stripe + Inngest). Keep it ugly; functionality over polish.
6. **Week 9**: Internal beta with 5 invited customers at $99 (loss-leader price for case studies). Capture failures.
7. **Week 10**: Polish, write the launch posts, line up the HN/Reddit launch.
8. **Week 11**: Launch.

**Decision benchmarks that should change the plan:**
- If after week 4 the WordPress REST + Gutenberg parser path is producing <80% block fidelity on test fixtures, **pivot to WXR-primary** and accept the ACF limitation as a v1 honesty constraint.
- If after launch month 1 you have <5 paid migrations but >500 GitHub stars, the product is fine but the pricing/positioning of the paid tier is wrong — A/B test $149 vs $349 anchors and add a "we'll do it for you in 24 hours or refund" guarantee badge.
- If you have >20 paid migrations but stars are flat (<500), the open-source story isn't landing — ship a high-leverage CLI improvement (like an interactive `--ai-clean` flag using local Claude/Ollama) and relaunch on HN with a "v2" angle in month 3.
- Only after consistent $5K+/month from migrations should you start building the "Native AI CMS" editing layer. The wedge has to pay for the long arc.

**On the "AI CMS" north star**: Resist the urge to mention it in v1 marketing. The wedge needs to be coherent on its own. The AI CMS pitch — "your content lives as MDX files an AI agent can edit" — should appear in v1 only as a single line in the README: "Output is designed for AI-agent editing. More on that soon." That seeds curiosity without diluting the immediate value prop.

## Caveats

- **The Gutenberg block ecosystem is huge and chaotic.** Core blocks (~30) cover ~80% of sites. The long tail of plugin-defined blocks (Kadence, GenerateBlocks, Spectra, Stackable, Greenshift) is genuinely large, and full fidelity is not achievable. The honest customer promise is "core blocks faithfully, custom blocks as raw HTML with TODOs" — set that expectation in the sales copy.
- **The data on HN launches in 2025 is mixed.** Sturdy Statistics' "State of Show HN 2025" analysis flagged a meaningful drop in average Show HN performance vs prior years, with AI-tagged launches particularly underperforming. [Sturdystatistics](https://blog.sturdystatistics.com/posts/show_hn/) This is good news for a non-AI utility CLI (which this is, in its v1 framing) but means absolute upvote benchmarks from 2022–2023 launches are unreliable.
- **There is no live, publicly successful "$249 one-time managed dev migration" precedent.** Documenso self-host enterprise is $30K/yr; WPvivid lifetime is a closed plugin. Lifetime/one-time deals in the modern open-core dev-infra space are essentially absent per the comparative landscape — Dub, Inngest, Trigger.dev, n8n, ToolJet all use subscriptions. This is a real gap, but it is also a *reason no one's done it*: unit economics on a one-time fee are hard if customer-acquisition cost is high. Mitigate by keeping CAC low through OSS-led distribution.
- **WordPress is a moving target.** The data-liberation initiative inside WordPress core may produce a better export format [GitHub](https://github.com/WordPress/data-liberation/discussions/56) in 2025–2026, which could either help (cleaner input) or hurt (commoditize the extraction layer). Stay close to the `WordPress/data-liberation` GitHub discussions.
- **Some platform features quoted in this report (Vercel function timeouts, Supabase plan limits, GitHub App rate limits) may have changed.** Verify each before architecture is final.
- **The "AI agents will edit MDX content" thesis is forward-looking.** It is defensible — file-based content with deterministic schemas is genuinely easier for agents than a CMS DB — but it is not a *demonstrated* product fit yet. Don't bet the launch on it. Bet the launch on "escape WordPress maintenance pain" and let the AI angle be the second-order story.