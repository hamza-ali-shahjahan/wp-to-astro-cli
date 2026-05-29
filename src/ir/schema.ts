/**
 * Intermediate Representation (IR) schema — v0.1.0.
 *
 * The IR is the contract between source adapters (WXR, REST, etc.) and emitters
 * (Astro, future: Next.js, Hugo). It's deliberately small in Pass 1 and grows
 * by minor-version bumps in subsequent passes.
 *
 * Zod is the source of truth — TypeScript types are derived via `z.infer`.
 */
import { z } from "zod";

export const IR_VERSION = "0.4.0" as const;

export const ParagraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  text: z.string(),
});

export const HeadingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.union([
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  text: z.string(),
});

export const ListItemSchema = z.object({
  text: z.string(),
});

export const ListBlockSchema = z.object({
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(ListItemSchema),
});

export const QuoteBlockSchema = z.object({
  type: z.literal("quote"),
  text: z.string(),
  citation: z.string().optional(),
});

export const CodeBlockSchema = z.object({
  type: z.literal("code"),
  language: z.string().optional(),
  content: z.string(),
});

export const SeparatorBlockSchema = z.object({
  type: z.literal("separator"),
});

export const ImageBlockSchema = z.object({
  type: z.literal("image"),
  src: z.string(),
  alt: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  caption: z.string().optional(),
});

export const RawBlockSchema = z.object({
  type: z.literal("raw"),
  html: z.string(),
  todo: z.string(),
});

export const BlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  ListBlockSchema,
  QuoteBlockSchema,
  CodeBlockSchema,
  SeparatorBlockSchema,
  ImageBlockSchema,
  RawBlockSchema,
]);

// SEO metadata (Pass 4: populated from REST / Yoast; Pass 5: also from WXR
// postmeta; rendered into frontmatter).
export const SeoMetaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  canonical: z.string().optional(),
  robots: z.string().optional(),
  ogImage: z.string().optional(),
  ogType: z.string().optional(),
  twitterCard: z.string().optional(),
  // JSON-LD schema graph from Yoast/RankMath. Preserved verbatim.
  schema: z.array(z.unknown()).optional(),
});

export const PostSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  date: z.string(), // ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
  excerpt: z.string().optional(),
  blocks: z.array(BlockSchema),
  seo: SeoMetaSchema.optional(),
});

// Pages share Post's shape but `date` is optional (a static "About" page
// doesn't have a meaningful publication date).
export const PageSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  date: z.string().optional(),
  excerpt: z.string().optional(),
  blocks: z.array(BlockSchema),
  seo: SeoMetaSchema.optional(),
});

// Site-level config — Pass 6 uses `permalinkStructure` to generate redirects;
// Pass 5 may surface `title` / `description` in defaults; `baseUrl` lets us
// resolve relative URLs from WXR.
export const SiteConfigSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  baseUrl: z.string().optional(),
  // e.g. "/%year%/%monthnum%/%postname%/" or "/%postname%/"
  permalinkStructure: z.string().optional(),
});

export const SiteSchema = z.object({
  version: z.literal(IR_VERSION),
  posts: z.array(PostSchema),
  pages: z.array(PageSchema),
  config: SiteConfigSchema.optional(),
});

export type ParagraphBlock = z.infer<typeof ParagraphBlockSchema>;
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type ListBlock = z.infer<typeof ListBlockSchema>;
export type ListItem = z.infer<typeof ListItemSchema>;
export type QuoteBlock = z.infer<typeof QuoteBlockSchema>;
export type CodeBlock = z.infer<typeof CodeBlockSchema>;
export type SeparatorBlock = z.infer<typeof SeparatorBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type RawBlock = z.infer<typeof RawBlockSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type SeoMeta = z.infer<typeof SeoMetaSchema>;
export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Page = z.infer<typeof PageSchema>;
export type Site = z.infer<typeof SiteSchema>;
