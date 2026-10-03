import type { CollectionConfig } from "payload";
import { isCmsAdmin, isCmsEditor } from "../access.ts";

export const BlogPosts: CollectionConfig = {
  slug: "blog-posts",
  dbName: "blog_posts",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "category", "publishedAt", "updatedAt"],
    group: "Publishing",
  },
  access: {
    read: ({ req }) => {
      if (req.user?.collection === "cms-users") return true;
      return { status: { equals: "published" } };
    },
    create: isCmsEditor,
    update: isCmsEditor,
    delete: isCmsAdmin,
  },
  fields: [
    { name: "slug", type: "text", required: true, unique: true, index: true },
    { name: "title", type: "text", required: true },
    { name: "subtitle", type: "text" },
    { name: "excerpt", type: "textarea", required: true },
    { name: "content", type: "textarea", required: true, admin: { rows: 24 } },
    { name: "coverImage", type: "text" },
    { name: "category", type: "text", index: true },
    {
      name: "tags",
      type: "text",
      hasMany: true,
      admin: { description: "Search keywords for this article." },
    },
    {
      name: "author",
      type: "group",
      fields: [
        { name: "name", type: "text" },
        { name: "avatar", type: "text" },
        { name: "role", type: "text" },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      index: true,
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
    },
    { name: "featured", type: "checkbox", defaultValue: false },
    { name: "readingTimeMinutes", type: "number", min: 1 },
    { name: "publishedAt", type: "date" },
    { name: "createdBy", type: "text", admin: { readOnly: true } },
  ],
  timestamps: true,
};
