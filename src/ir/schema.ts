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

export const IR_VERSION = "0.1.0" as const;

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

export const RawBlockSchema = z.object({
  type: z.literal("raw"),
  html: z.string(),
  todo: z.string(),
});

export const BlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  RawBlockSchema,
]);

export const PostSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  date: z.string(), // ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
  excerpt: z.string().optional(),
  blocks: z.array(BlockSchema),
});

// Pages reserved for Pass 2. In Pass 1, the array is required to be empty.
export const SiteSchema = z.object({
  version: z.literal(IR_VERSION),
  posts: z.array(PostSchema),
  pages: z.array(z.never()),
});

export type ParagraphBlock = z.infer<typeof ParagraphBlockSchema>;
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type RawBlock = z.infer<typeof RawBlockSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Site = z.infer<typeof SiteSchema>;
