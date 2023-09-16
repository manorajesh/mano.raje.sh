import { defineCollection, z } from "astro:content";

const brainpickings = defineCollection({
  // Type-check frontmatter using a schema
  schema: z.object({
    title: z.string(),
    // Transform string to Date object
    date: z.coerce.date(),
  }),
});

const devlog = defineCollection({
  route: "/devlog/:project/:slug",
  path: "./src/content/devlog/:project/*.md",
  schema: z.object({
    title: z.string(),
    project: z.string(),
    date: z.coerce.date(),
  }),
});

export const collections = { brainpickings, devlog };
