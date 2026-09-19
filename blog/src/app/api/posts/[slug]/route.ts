import { getPostBySlug } from "@/lib/api";
import {
  ContentConflictError,
  ContentValidationError,
  normalizePostInput,
  writePost,
} from "@/lib/content-api";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

function isAuthorized(request: Request) {
  const expected = process.env.BLOG_API_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const post = getPostBySlug(slug);
  if (!post || post.published === false) return errorResponse("Post not found.", 404);
  return Response.json({ post });
}

export async function PUT(request: Request, context: RouteContext) {
  if (!isAuthorized(request)) return errorResponse("Unauthorized.", 401);

  const { slug } = await context.params;
  const existing = getPostBySlug(slug);
  if (!existing) return errorResponse("Post not found.", 404);

  try {
    const incoming = await request.json();
    const post = normalizePostInput(
      { ...existing, ...(incoming as Record<string, unknown>), slug },
      slug,
    );
    const result = await writePost(post, { overwrite: true });
    return Response.json({ post, ...result });
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return errorResponse(error.message, 422);
    }
    if (error instanceof ContentConflictError) {
      return errorResponse(error.message, 409);
    }
    return errorResponse(
      error instanceof Error ? error.message : "Unable to update the post.",
      500,
    );
  }
}
