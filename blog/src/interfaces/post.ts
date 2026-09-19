import { type Author } from "./author";

export type Post = {
  slug: string;
  title: string;
  date: string;
  modifiedDate?: string;
  coverImage: string;
  author: Author;
  excerpt: string;
  ogImage: {
    url: string;
  };
  content: string;
  preview?: boolean;
  published?: boolean;
  category?: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
};
