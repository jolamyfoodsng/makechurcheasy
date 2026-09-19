/**
 * GET    /api/transcripts       — List all transcripts for the authenticated user
 * POST   /api/transcripts       — Create or upsert a transcript
 * DELETE /api/transcripts?id=<id> — Delete a transcript by client-generated id
 *
 * Auth: fb-token cookie (web) OR X-Device-Id header (desktop app).
 * Ownership: all queries scoped by ownerId (MongoDB user _id).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { COLLECTIONS, ensureIndexes } from "@/lib/db";
import { recordActivationEvent } from "@/lib/activation";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    if (!auth?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureIndexes();
    const client = await clientPromise;
    const db = client.db();
    const transcripts = await db
      .collection(COLLECTIONS.TRANSCRIPTS)
      .find({ ownerId: auth.mongoUser._id })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ transcripts });
  } catch (error) {
    console.error("GET /api/transcripts error:", error);
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
    const { transcript } = body;
    if (!transcript?.id) {
      return NextResponse.json({ error: "transcript.id is required" }, { status: 400 });
    }

    await ensureIndexes();
    const client = await clientPromise;
    const db = client.db();
    const ownerId = auth.mongoUser._id;
    const now = new Date().toISOString();

    const doc = {
      ownerId,
      id: transcript.id,
      title: transcript.title || "",
      church: transcript.church || "",
      language: transcript.language || "English",
      durationSeconds: transcript.durationSeconds || 0,
      transcriptText: transcript.transcriptText || "",
      sourceType: transcript.sourceType || "uploaded",
      scriptures: transcript.scriptures || [],
      translations: transcript.translations || [],
      updatedAt: now,
    };

    const existing = await db.collection(COLLECTIONS.TRANSCRIPTS).findOne({ ownerId, id: transcript.id });
    await db
      .collection(COLLECTIONS.TRANSCRIPTS)
      .updateOne(
        { ownerId, id: transcript.id },
        { $set: doc, $setOnInsert: { createdAt: transcript.createdAt || now } },
        { upsert: true },
      );

    if (!existing) {
      const wordCount = (doc.transcriptText || "").split(/\s+/).filter(Boolean).length;
      recordActivationEvent(ownerId.toString(), "transcript_created", { wordCount }).catch(() => { });
    }

    return NextResponse.json({ success: true, id: transcript.id });
  } catch (error) {
    console.error("POST /api/transcripts error:", error);
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
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    await ensureIndexes();
    const client = await clientPromise;
    const db = client.db();

    const result = await db
      .collection(COLLECTIONS.TRANSCRIPTS)
      .deleteOne({ ownerId: auth.mongoUser._id, id });

    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error("DELETE /api/transcripts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
