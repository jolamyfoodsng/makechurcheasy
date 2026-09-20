import { NextResponse } from "next/server";

const REPO = "jolamyfoodsng/makechurcheasy-releases";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

const LATEST_MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/latest.json`;

export async function GET() {
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      next: { revalidate: 300 },
    });

    if (res.ok) {
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
    }

    // Fallback to CDN-hosted latest.json if GitHub REST API returned 403/rate-limit
    const manifestRes = await fetch(LATEST_MANIFEST_URL, { next: { revalidate: 300 } });
    if (manifestRes.ok) {
      const manifest = await manifestRes.json();
      const assets = Object.values(manifest.platforms || {}).map((p: any) => {
        const url = p.url || "";
        const name = url.split("/").pop() || "";
        return { name, size: 0 };
      });

      return NextResponse.json({
        tag_name: `v${manifest.version}`,
        name: `v${manifest.version}`,
        body: manifest.notes || "",
        published_at: manifest.pub_date || new Date().toISOString(),
        assets,
      });
    }

    return NextResponse.json(
      { error: `GitHub API returned ${res.status}` },
      { status: res.status }
    );
  } catch (error) {
    console.error("Failed to fetch release:", error);
    return NextResponse.json(
      { error: "Failed to fetch release information" },
      { status: 500 }
    );
  }
}
