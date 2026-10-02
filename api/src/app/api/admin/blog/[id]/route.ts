import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  getBlogPostById,
  updateBlogPost,
  deleteBlogPost,
  type BlogPostInput,
} from "@/lib/blog";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const post = await getBlogPostById(id);
    if (!post) {
      return NextResponse.json({ error: "Blog post not found" }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load blog post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Partial<BlogPostInput>;
    const post = await updateBlogPost(id, body);
    return NextResponse.json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update blog post";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const success = await deleteBlogPost(id);
    if (!success) {
      return NextResponse.json({ error: "Post not found or already deleted" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete blog post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
