import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  listBlogPostsAdmin,
  createBlogPost,
  type BlogPostInput,
} from "@/lib/blog";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const posts = await listBlogPostsAdmin();
    return NextResponse.json({ posts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin blog posts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as BlogPostInput;
    const post = await createBlogPost(body, auth.adminUserId);
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create blog post";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
