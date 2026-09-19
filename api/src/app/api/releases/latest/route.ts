import { NextResponse } from "next/server";

const REPO = "jolamyfoodsng/makechurcheasy-releases";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export async function GET() {
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: { Accept: "application/vnd.github.v3+json" },
      next: { rethrows: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    return NextResponse.json({
      tag_name: data.tag_name,
      name: data.name,
      body: data.body,
      published_at: data.published_at,
      assets: data.assets.map((a: { name: string; size: number }) => ({
        name: a.name,
        size: a.size,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch release:", error);
    return NextResponse.json(
      { error: "Failed to fetch release information" },
      { status: 500 }
    );
  }
}
