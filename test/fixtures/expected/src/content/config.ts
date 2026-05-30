import { defineCollection, z } from "astro:content";

const seoSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    canonical: z.string().optional(),
    robots: z.string().optional(),
    ogImage: z.string().optional(),
    ogType: z.string().optional(),
    twitterCard: z.string().optional(),
    schema: z.array(z.unknown()).optional(),
  })
  .optional();

// Note: `slug` is intentionally not in the schema — Astro reserves it as a
// content-collection-builtin and errors with ContentSchemaContainsSlugError
// if it appears here. The emitted MDX frontmatter still carries `slug:` for
// human readability + non-Astro tooling; Astro silently ignores extra fields.
const postSchema = z.object({
  title: z.string(),
  date: z.string(),
  excerpt: z.string().optional(),
  seo: seoSchema,
});

const pageSchema = z.object({
  title: z.string(),
  date: z.string().optional(),
  excerpt: z.string().optional(),
  seo: seoSchema,
});

export const collections = {
  posts: defineCollection({ type: "content", schema: postSchema }),
  pages: defineCollection({ type: "content", schema: pageSchema }),
};
