import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  type ProductionThemeInput,
  serializeProductionTheme,
  setProductionThemeEnabled,
  upsertProductionTheme,
} from "@/lib/productionThemes";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ themeId: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { themeId } = await params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const input = body.theme && typeof body.theme === "object"
      ? body.theme as ProductionThemeInput
      : body as ProductionThemeInput;
    const theme = await upsertProductionTheme({ ...input, themeId }, auth.adminUserId);
    return NextResponse.json({ success: true, theme: serializeProductionTheme(theme) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update production theme";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ themeId: string }> },
) {
  return PATCH(req, context);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ themeId: string }> },
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { themeId } = await params;
    const theme = await setProductionThemeEnabled(themeId, false, auth.adminUserId);
    if (!theme) {
      return NextResponse.json({ error: "Production theme not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, theme: serializeProductionTheme(theme) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disable production theme";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
