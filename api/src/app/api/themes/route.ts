/**
 * GET    /api/themes            — List all custom themes for the authenticated user
 * POST   /api/themes            — Create or upsert a custom theme
 * DELETE /api/themes?themeId=<id> — Delete a custom theme by client-generated themeId
 *
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 * Ownership: all queries scoped by ownerId (MongoDB user _id).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { COLLECTIONS, ensureIndexes } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    if (!auth?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureIndexes();
    const client = await clientPromise;
    const db = client.db();
    const themes = await db
      .collection(COLLECTIONS.CUSTOM_THEMES)
      .find({ ownerId: auth.mongoUser._id })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ themes });
  } catch (error) {
    console.error("GET /api/themes error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    if (!auth?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { theme } = body;
    if (!theme?.themeId) {
      return NextResponse.json({ error: "theme.themeId is required" }, { status: 400 });
    }

    await ensureIndexes();
    const client = await clientPromise;
    const db = client.db();
    const ownerId = auth.mongoUser._id;
    const now = new Date().toISOString();

    const doc = {
      ownerId,
      themeId: theme.themeId,
      name: theme.name || "",
      description: theme.description || "",
      source: "custom" as const,
      templateType: theme.templateType || "fullscreen",
      category: theme.category || null,
      categories: theme.categories || [],
      settings: theme.settings || {},
      preview: theme.preview || null,
      hidden: theme.hidden || false,
      updatedAt: now,
    };

    await db
      .collection(COLLECTIONS.CUSTOM_THEMES)
      .updateOne(
        { ownerId, themeId: theme.themeId },
        { $set: doc, $setOnInsert: { createdAt: theme.createdAt || now } },
        { upsert: true },
      );

    return NextResponse.json({ success: true, themeId: theme.themeId });
  } catch (error) {
    console.error("POST /api/themes error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    if (!auth?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const themeId = searchParams.get("themeId");
    if (!themeId) {
      return NextResponse.json({ error: "themeId query parameter is required" }, { status: 400 });
    }

    await ensureIndexes();
    const client = await clientPromise;
    const db = client.db();

    const result = await db
      .collection(COLLECTIONS.CUSTOM_THEMES)
      .deleteOne({ ownerId: auth.mongoUser._id, themeId });

    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error("DELETE /api/themes error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
