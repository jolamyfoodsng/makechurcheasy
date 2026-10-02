import { NextRequest, NextResponse } from "next/server";
import { listPublishedBlogPosts, getBlogPostBySlug } from "@/lib/blog";

// Public endpoint for published blog posts
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (slug) {
      const post = await getBlogPostBySlug(slug, true);
      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }
      return NextResponse.json({ post });
    }

    const tag = req.nextUrl.searchParams.get("tag") || undefined;
    const category = req.nextUrl.searchParams.get("category") || undefined;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);
    const skip = parseInt(req.nextUrl.searchParams.get("skip") || "0", 10);

    const result = await listPublishedBlogPosts({ tag, category, limit, skip });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch blog posts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
