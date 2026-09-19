import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  listProductionThemes,
  serializeProductionTheme,
  upsertProductionTheme,
  type ProductionThemeInput,
  type ProductionThemeKind,
} from "@/lib/productionThemes";

function parseKind(value: string | null): ProductionThemeKind | undefined {
  if (value === "ticker") return "ticker";
  if (value === "lower-third" || value === "lowerThird" || value === "lower_third") return "lower-third";
  return undefined;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const includeDisabled = searchParams.get("includeDisabled") !== "false";
    const kind = parseKind(searchParams.get("kind"));
    const themes = await listProductionThemes({ kind, includeDisabled });
    return NextResponse.json({ themes: themes.map(serializeProductionTheme) });
  } catch (error) {
    console.error("GET /api/admin/production-themes error:", error);
    return NextResponse.json({ error: "Failed to load production themes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const input = body.theme && typeof body.theme === "object"
      ? body.theme as ProductionThemeInput
      : body as ProductionThemeInput;
    const theme = await upsertProductionTheme(input, auth.adminUserId);
    return NextResponse.json({ success: true, theme: serializeProductionTheme(theme) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save production theme";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
