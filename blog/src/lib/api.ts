import { Post } from "@/interfaces/post";
import fs from "fs";
import matter from "gray-matter";
import { join } from "path";

export const postsDirectory = join(process.cwd(), "_posts");

export function getPostSlugs() {
  if (!fs.existsSync(postsDirectory)) return [];
  return fs.readdirSync(postsDirectory).filter((slug) => slug.endsWith(".md"));
}

export function getPostBySlug(slug: string): Post | null {
  const realSlug = decodeURIComponent(slug).replace(/\.md$/, "");
  const fullPath = join(postsDirectory, `${realSlug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    ...data,
    slug: realSlug,
    coverImage: data.coverImage || "/assets/blog/hello-world/cover.jpg",
    author: data.author || {
      name: "MakeChurchEasy",
      picture: "/assets/blog/authors/mce.svg",
    },
    ogImage: data.ogImage || {
      url: data.coverImage || "/assets/blog/hello-world/cover.jpg",
    },
    content,
  } as Post;
}

export function getAllPosts(): Post[] {
  const slugs = getPostSlugs();
  const posts = slugs
    .map((slug) => getPostBySlug(slug))
    .filter((post): post is Post => Boolean(post && post.published !== false))
    // sort posts by date in descending order
    .sort((post1, post2) => (post1.date > post2.date ? -1 : 1));
  return posts;
}
