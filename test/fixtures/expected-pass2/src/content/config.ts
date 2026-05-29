import { defineCollection, z } from "astro:content";

const postSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: z.string(),
  excerpt: z.string().optional(),
});

const pageSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: z.string().optional(),
  excerpt: z.string().optional(),
});

export const collections = {
  posts: defineCollection({ type: "content", schema: postSchema }),
  pages: defineCollection({ type: "content", schema: pageSchema }),
};
