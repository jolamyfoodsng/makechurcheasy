import {
  ContentConflictError,
  ContentValidationError,
  getContentStorage,
  normalizePostInput,
  writePost,
} from "@/lib/content-api";
import { getAllPosts } from "@/lib/api";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";

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

export async function GET() {
  const posts = getAllPosts().map(({ content: _content, ...post }) => post);
  return Response.json({ posts, storage: getContentStorage() });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return errorResponse("Unauthorized.", 401);

  try {
    const post = normalizePostInput(await request.json());
    const result = await writePost(post);
    return Response.json({ post, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return errorResponse(error.message, 422);
    }
    if (error instanceof ContentConflictError) {
      return errorResponse(error.message, 409);
    }
    return errorResponse(
      error instanceof Error ? error.message : "Unable to create the post.",
      500,
    );
  }
}
