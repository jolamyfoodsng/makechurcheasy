import { Post } from "@/interfaces/post";
import { getPostBySlug, postsDirectory } from "@/lib/api";
import fs from "fs";
import matter from "gray-matter";
import { join } from "path";

export type PostWriteInput = Partial<Post> & {
  title: string;
  excerpt: string;
  content: string;
};

export class ContentValidationError extends Error {}
export class ContentConflictError extends Error {}

const defaultCover = "/assets/blog/hello-world/cover.jpg";
const defaultAuthor = {
  name: "MakeChurchEasy",
  picture: "/assets/blog/authors/mce.svg",
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeAuthor(value: unknown) {
  if (!value || typeof value !== "object") return defaultAuthor;
  const author = value as Record<string, unknown>;
  return {
    name: text(author.name) || defaultAuthor.name,
    picture: text(author.picture) || defaultAuthor.picture,
  };
}

export function normalizePostInput(
  value: unknown,
  fallbackSlug?: string,
): Post {
  if (!value || typeof value !== "object") {
    throw new ContentValidationError("Request body must be an object.");
  }

  const input = value as Record<string, unknown>;
  const title = text(input.title);
  const excerpt = text(input.excerpt);
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const slug = slugify(text(input.slug) || fallbackSlug || title);

  if (!title) throw new ContentValidationError("title is required.");
  if (!excerpt) throw new ContentValidationError("excerpt is required.");
  if (!content) throw new ContentValidationError("content is required.");
  if (!slug) throw new ContentValidationError("A valid slug is required.");

  const tags = Array.isArray(input.tags)
    ? input.tags.map(text).filter(Boolean)
    : [];
  const ogImage =
    input.ogImage && typeof input.ogImage === "object"
      ? { url: text((input.ogImage as Record<string, unknown>).url) || defaultCover }
      : { url: text(input.ogImage) || text(input.coverImage) || defaultCover };

  return {
    slug,
    title,
    date: text(input.date) || new Date().toISOString(),
    coverImage: text(input.coverImage) || defaultCover,
    author: normalizeAuthor(input.author),
    excerpt,
    ogImage,
    content,
    preview: input.preview === true,
    published: input.published !== false,
    category: text(input.category) || "Church Media",
    tags,
    seoTitle: text(input.seoTitle) || title,
    seoDescription: text(input.seoDescription) || excerpt,
  };
}

function postToMarkdown(post: Post) {
  const { content, ...frontmatter } = post;
  return matter.stringify(content, frontmatter);
}

function githubConfig() {
  const token = process.env.GITHUB_CONTENT_TOKEN;
  const owner = process.env.CONTENT_REPOSITORY_OWNER;
  const repository = process.env.CONTENT_REPOSITORY_NAME;
  const branch = process.env.CONTENT_REPOSITORY_BRANCH || "main";

  if (!token || !owner || !repository) return null;
  return { token, owner, repository, branch };
}

export function getContentStorage() {
  if (githubConfig()) return "github" as const;
  return process.env.NODE_ENV === "production" ? "unconfigured" as const : "local" as const;
}

function githubPath(slug: string) {
  return `_posts/${slug}.md`
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

export async function writePost(post: Post, options: { overwrite?: boolean } = {}) {
  const config = githubConfig();

  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Production content storage is not configured. Add the GitHub content environment variables.",
      );
    }

    const fullPath = join(postsDirectory, `${post.slug}.md`);
    if (fs.existsSync(fullPath) && !options.overwrite) {
      throw new ContentConflictError(`A post with slug "${post.slug}" already exists.`);
    }
    fs.mkdirSync(postsDirectory, { recursive: true });
    fs.writeFileSync(fullPath, postToMarkdown(post), "utf8");
    return { storage: "local" as const };
  }

  const path = githubPath(post.slug);
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/contents/${path}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const current = await fetch(url, { headers });
  let sha: string | undefined;

  if (current.ok) {
    sha = (await current.json()).sha;
    if (!options.overwrite) {
      throw new ContentConflictError(`A post with slug "${post.slug}" already exists.`);
    }
  } else if (current.status !== 404) {
    throw new Error(`GitHub content lookup failed with ${current.status}.`);
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `${options.overwrite ? "Update" : "Add"} blog post: ${post.title}`,
      content: Buffer.from(postToMarkdown(post), "utf8").toString("base64"),
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub content write failed with ${response.status}.`);
  }

  const result = await response.json();
  return {
    storage: "github" as const,
    commitUrl: result.commit?.html_url as string | undefined,
  };
}

export function getPostForUpdate(slug: string) {
  return getPostBySlug(slug);
}
