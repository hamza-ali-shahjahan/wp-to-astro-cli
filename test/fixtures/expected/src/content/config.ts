import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    date: z.string(),
    excerpt: z.string().optional(),
  }),
});

export const collections = { posts };
