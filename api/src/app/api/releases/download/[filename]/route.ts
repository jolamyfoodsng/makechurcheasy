import { NextRequest, NextResponse } from "next/server";

const REPO = "jolamyfoodsng/makechurcheasy-releases";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const decoded = decodeURIComponent(filename);

  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: { Accept: "application/vnd.github.v3+json" },
      next: { rethrows: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not fetch release info" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const asset = data.assets?.find(
      (a: { name: string }) => a.name === decoded
    );

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found in latest release" },
        { status: 404 }
      );
    }

    return NextResponse.redirect(asset.browser_download_url, 302);
  } catch (error) {
    console.error("Download proxy error:", error);
    return NextResponse.json(
      { error: "Download failed" },
      { status: 500 }
    );
  }
}
