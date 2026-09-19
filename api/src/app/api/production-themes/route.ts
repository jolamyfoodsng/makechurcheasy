import { NextRequest, NextResponse } from "next/server";
import {
  listProductionThemes,
  serializeProductionTheme,
  type ProductionThemeKind,
} from "@/lib/productionThemes";

function parseKind(value: string | null): ProductionThemeKind | undefined {
  if (value === "ticker") return "ticker";
  if (value === "lower-third" || value === "lowerThird" || value === "lower_third") return "lower-third";
  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = parseKind(searchParams.get("kind"));
    const themes = await listProductionThemes({ kind, includeDisabled: false });

    return NextResponse.json(
      { themes: themes.map(serializeProductionTheme) },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/production-themes error:", error);
    return NextResponse.json({ error: "Failed to load production themes" }, { status: 500 });
  }
}
