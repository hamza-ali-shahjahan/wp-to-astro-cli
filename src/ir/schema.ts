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

export const IR_VERSION = "0.3.0" as const;

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

export const PostSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  date: z.string(), // ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
  excerpt: z.string().optional(),
  blocks: z.array(BlockSchema),
});

// Pages share Post's shape but `date` is optional (a static "About" page
// doesn't have a meaningful publication date).
export const PageSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  date: z.string().optional(),
  excerpt: z.string().optional(),
  blocks: z.array(BlockSchema),
});

export const SiteSchema = z.object({
  version: z.literal(IR_VERSION),
  posts: z.array(PostSchema),
  pages: z.array(PageSchema),
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
export type Post = z.infer<typeof PostSchema>;
export type Page = z.infer<typeof PageSchema>;
export type Site = z.infer<typeof SiteSchema>;
