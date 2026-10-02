import { NextRequest, NextResponse } from "next/server";
import { getBlogPostBySlug } from "@/lib/blog";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const post = await getBlogPostBySlug(slug, true);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
