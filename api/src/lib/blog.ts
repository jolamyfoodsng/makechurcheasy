import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import { COLLECTIONS, ensureIndexes } from "./db";

export type BlogPostStatus = "draft" | "published" | "archived";

export interface BlogPostAuthor {
  name: string;
  avatar?: string;
  role?: string;
}

export interface BlogPost {
  _id?: string | ObjectId;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  content: string; // Markdown / rich text
  coverImage?: string;
  category: string;
  tags: string[];
  author: BlogPostAuthor;
  status: BlogPostStatus;
  featured?: boolean;
  readingTimeMinutes: number;
  publishedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy?: string; // admin user ID
}

export interface BlogPostInput {
  title: string;
  subtitle?: string;
  excerpt?: string;
  content: string;
  slug?: string;
  coverImage?: string;
  category?: string;
  tags?: string[];
  author?: Partial<BlogPostAuthor>;
  status?: BlogPostStatus;
  featured?: boolean;
  publishedAt?: string | null;
}

export function calculateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerMinute = 200;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const INITIAL_POSTS: Array<Omit<BlogPost, "_id">> = [
  {
    slug: "a-simpler-bible-presentation-workflow-for-church-services",
    title: "A Simpler Bible Presentation Workflow for Church Services",
    subtitle: "Prepare scripture, notes, and supporting media without the chaos",
    excerpt: "Prepare scripture, notes, and supporting media in a way that helps the presenter stay focused from the first slide to the last.",
    content: `Bible presentation works best when the presenter can move through the service naturally. The goal is not to create more slides; it is to make the right content available at the right moment.

## Prepare the passage first

Add the scripture passage and check the wording, translation, and slide breaks before the service begins. A clear passage structure helps the congregation follow along and gives the presenter confidence.

## Keep notes close to the presentation

Service notes, speaker cues, and reminders should be easy to reach without turning the presentation into a maze. Keep the visible slide focused while leaving operational notes available to the person running the service.

## Build around the whole service

Bible slides are only one part of a Sunday workflow. Pair them with worship lyrics, announcement media, sermon artwork, and any lower thirds or stream graphics needed for the broadcast.

When preparation happens in one connected workflow, the presenter spends less time searching and more time paying attention to the service.`,
    coverImage: "/assets/blog/dynamic-routing/cover.jpg",
    category: "Bible Presentation",
    tags: ["Bible presentation", "church slides", "sermon notes"],
    author: {
      name: "MakeChurchEasy Editorial",
      avatar: "/assets/blog/authors/mce.svg",
      role: "Worship Tech Specialist",
    },
    status: "published",
    featured: true,
    readingTimeMinutes: 3,
    publishedAt: new Date("2026-08-21T09:00:00.000Z"),
    createdAt: new Date("2026-08-21T09:00:00.000Z"),
    updatedAt: new Date("2026-08-21T09:00:00.000Z"),
  },
  {
    slug: "how-makechurcheasy-helps-churches-prepare-better-services",
    title: "How MakeChurchEasy Helps Churches Prepare Better Services",
    subtitle: "Unifying Bible presentation, lyrics, and streaming into one calm Sunday morning",
    excerpt: "A practical look at how one workflow brings Bible presentation, worship, media, and live streaming into one calmer preparation process.",
    content: `Church services have enough moving parts without making the presentation workflow harder than it needs to be. MakeChurchEasy is built around a simple idea: the people preparing a service should be able to focus on the service, not fight disconnected tools.

## One place for the service plan

Start with the Bible passage, worship lyrics, notes, and media your team will use. Keeping these pieces together makes it easier for the presenter, worship leader, and media team to work from the same plan.

## Ready for the room and the stream

The presentation can support the in-room display while also fitting into a live-stream setup. Workflows for OBS and vMix make it easier to move from preparation to presentation without recreating the service in a second tool.

## Designed for real church teams

Not every operator is a broadcast engineer, and not every church has a large media department. MakeChurchEasy aims to keep the common actions clear: find the content, prepare the slides, present confidently, and keep the service moving.

The result is a calmer Sunday workflow with fewer last-minute surprises and more time for the people the service is meant to serve.`,
    coverImage: "/assets/blog/hello-world/cover.jpg",
    category: "Product & Workflow",
    tags: ["church presentation", "worship technology", "church media"],
    author: {
      name: "MakeChurchEasy Editorial",
      avatar: "/assets/blog/authors/mce.svg",
      role: "Product Lead",
    },
    status: "published",
    featured: false,
    readingTimeMinutes: 3,
    publishedAt: new Date("2026-08-22T09:00:00.000Z"),
    createdAt: new Date("2026-08-22T09:00:00.000Z"),
    updatedAt: new Date("2026-08-22T09:00:00.000Z"),
  },
  {
    slug: "using-obs-and-vmix-with-a-church-presentation-workflow",
    title: "Using OBS and vMix with a Church Presentation Workflow",
    subtitle: "Prepare once, broadcast everywhere with zero lag and native docks",
    excerpt: "How a church team can prepare presentation content once and use it confidently for the room, OBS, or vMix.",
    content: `Church media teams often have to serve two places at once: the people in the room and the people watching online. A good workflow should make that coordination easier.

## Prepare content once

Bible passages, worship lyrics, announcement slides, and media should be prepared in the same service context. This reduces duplicated work and keeps the room and stream aligned.

## Use a dock or browser window where it fits

OBS can use dock-style panels, while vMix can use browser inputs or a separate presentation window. The important thing is that the operator can keep the presentation controls close to the production interface without losing sight of the live output.

## Keep the operator in control

The presenter should be able to move forward, go back, and select the right service item quickly. Clear content organization matters more than a complicated production setup.

With a prepared workflow, OBS and vMix become the final delivery layer instead of another place where the service has to be rebuilt.`,
    coverImage: "/assets/blog/preview/cover.jpg",
    category: "Live Streaming",
    tags: ["OBS", "vMix", "live streaming", "church media"],
    author: {
      name: "MakeChurchEasy Editorial",
      avatar: "/assets/blog/authors/mce.svg",
      role: "Broadcast Engineer",
    },
    status: "published",
    featured: false,
    readingTimeMinutes: 3,
    publishedAt: new Date("2026-08-20T09:00:00.000Z"),
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
    updatedAt: new Date("2026-08-20T09:00:00.000Z"),
  },
];

async function seedIfEmpty(): Promise<void> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const count = await db.collection(COLLECTIONS.BLOG_POSTS).countDocuments();
    if (count === 0) {
      await db.collection(COLLECTIONS.BLOG_POSTS).insertMany(INITIAL_POSTS as any);
    }
  } catch (err) {
    console.warn("Failed to seed initial blog posts:", err);
  }
}

export async function listBlogPostsAdmin(limit = 100): Promise<BlogPost[]> {
  await ensureIndexes();
  await seedIfEmpty();
  const client = await clientPromise;
  const db = client.db();

  const docs = await db
    .collection(COLLECTIONS.BLOG_POSTS)
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    ...doc,
    _id: doc._id.toString(),
  })) as BlogPost[];
}

export async function listPublishedBlogPosts(options?: {
  tag?: string;
  category?: string;
  limit?: number;
  skip?: number;
}): Promise<{ posts: BlogPost[]; total: number }> {
  await ensureIndexes();
  await seedIfEmpty();
  const client = await clientPromise;
  const db = client.db();

  const query: Record<string, any> = { status: "published" };
  if (options?.tag) {
    query.tags = options.tag;
  }
  if (options?.category) {
    query.category = options.category;
  }

  const limit = Math.min(50, options?.limit || 20);
  const skip = options?.skip || 0;

  const [docs, total] = await Promise.all([
    db
      .collection(COLLECTIONS.BLOG_POSTS)
      .find(query)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTIONS.BLOG_POSTS).countDocuments(query),
  ]);

  return {
    posts: docs.map((doc) => ({
      ...doc,
      _id: doc._id.toString(),
    })) as BlogPost[],
    total,
  };
}

export async function getBlogPostBySlug(slug: string, requirePublished = true): Promise<BlogPost | null> {
  await ensureIndexes();
  await seedIfEmpty();
  const client = await clientPromise;
  const db = client.db();

  const query: Record<string, any> = { slug };
  if (requirePublished) {
    query.status = "published";
  }

  const doc = await db.collection(COLLECTIONS.BLOG_POSTS).findOne(query);
  if (!doc) return null;

  return {
    ...doc,
    _id: doc._id.toString(),
  } as BlogPost;
}

export async function getBlogPostById(id: string): Promise<BlogPost | null> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return null;
  }

  const doc = await db.collection(COLLECTIONS.BLOG_POSTS).findOne({ _id: objectId });
  if (!doc) return null;

  return {
    ...doc,
    _id: doc._id.toString(),
  } as BlogPost;
}

export async function createBlogPost(input: BlogPostInput, adminUserId: string): Promise<BlogPost> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();

  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  let baseSlug = (input.slug || slugify(title)).trim();
  if (!baseSlug) baseSlug = `post-${Date.now()}`;

  // Ensure unique slug
  let slug = baseSlug;
  let counter = 1;
  while (await db.collection(COLLECTIONS.BLOG_POSTS).findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const now = new Date();
  const status = input.status || "draft";
  const publishedAt = status === "published" ? (input.publishedAt ? new Date(input.publishedAt) : now) : null;
  const readingTimeMinutes = calculateReadingTime(input.content || "");

  const excerpt = (input.excerpt || input.content.slice(0, 180).replace(/[#*`_]/g, "")).trim();

  const doc: Omit<BlogPost, "_id"> = {
    slug,
    title,
    subtitle: input.subtitle?.trim() || "",
    excerpt,
    content: input.content || "",
    coverImage: input.coverImage?.trim() || "",
    category: input.category?.trim() || "General",
    tags: Array.isArray(input.tags) ? input.tags.map((t) => t.trim()).filter(Boolean) : [],
    author: {
      name: input.author?.name?.trim() || "MakeChurchEasy Team",
      avatar: input.author?.avatar?.trim() || "/favicon/apple-touch-icon.png",
      role: input.author?.role?.trim() || "Editorial Team",
    },
    status,
    featured: Boolean(input.featured),
    readingTimeMinutes,
    publishedAt,
    createdAt: now,
    updatedAt: now,
    createdBy: adminUserId,
  };

  const result = await db.collection(COLLECTIONS.BLOG_POSTS).insertOne(doc as any);
  return {
    ...doc,
    _id: result.insertedId.toString(),
  };
}

export async function updateBlogPost(id: string, input: Partial<BlogPostInput>): Promise<BlogPost> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();

  const objectId = new ObjectId(id);
  const existing = await db.collection(COLLECTIONS.BLOG_POSTS).findOne({ _id: objectId });
  if (!existing) throw new Error("Blog post not found");

  const updates: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.subtitle !== undefined) updates.subtitle = input.subtitle.trim();
  if (input.content !== undefined) {
    updates.content = input.content;
    updates.readingTimeMinutes = calculateReadingTime(input.content);
  }
  if (input.excerpt !== undefined) updates.excerpt = input.excerpt.trim();
  if (input.coverImage !== undefined) updates.coverImage = input.coverImage.trim();
  if (input.category !== undefined) updates.category = input.category.trim();
  if (input.tags !== undefined) updates.tags = input.tags.map((t) => t.trim()).filter(Boolean);
  if (input.featured !== undefined) updates.featured = Boolean(input.featured);

  if (input.author) {
    updates.author = {
      name: input.author.name?.trim() || existing.author?.name || "MakeChurchEasy Team",
      avatar: input.author.avatar?.trim() || existing.author?.avatar || "/favicon/apple-touch-icon.png",
      role: input.author.role?.trim() || existing.author?.role || "Editorial Team",
    };
  }

  if (input.slug && input.slug.trim() !== existing.slug) {
    const nextSlug = slugify(input.slug);
    const slugConflict = await db.collection(COLLECTIONS.BLOG_POSTS).findOne({ slug: nextSlug, _id: { $ne: objectId } });
    if (slugConflict) throw new Error(`Slug "${nextSlug}" is already in use`);
    updates.slug = nextSlug;
  }

  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === "published" && !existing.publishedAt) {
      updates.publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();
    }
  }

  if (input.publishedAt !== undefined) {
    updates.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  }

  await db.collection(COLLECTIONS.BLOG_POSTS).updateOne({ _id: objectId }, { $set: updates });
  const updated = await db.collection(COLLECTIONS.BLOG_POSTS).findOne({ _id: objectId });

  return {
    ...updated,
    _id: updated!._id.toString(),
  } as BlogPost;
}

export async function deleteBlogPost(id: string): Promise<boolean> {
  await ensureIndexes();
  const client = await clientPromise;
  const db = client.db();

  const objectId = new ObjectId(id);
  const result = await db.collection(COLLECTIONS.BLOG_POSTS).deleteOne({ _id: objectId });
  return result.deletedCount > 0;
}
