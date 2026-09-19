import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { getPlanConfig, insertSermonPoint, insertCreditTransaction } from "@/lib/db";
import { ObjectId } from "mongodb";
import { resolveEffectivePlan } from "@/lib/trial";
import { checkCredits } from "@/lib/credits";
import { CreditTransactionType } from "@/types/schemas";

const AI_CREDITS = 10;

async function getOpenAIKey(userId: string): Promise<string | null> {
  const client = await clientPromise;
  const db = client.db();
  const doc = await db.collection("apiKeys").findOne({ userId });
  return doc?.openaiKey || null;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = await req.json();
    const { sermonId, transcript, title } = body;
    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "transcript is required" }, { status: 400 });
    }

    // Check entitlement
    const planConfig = await getPlanConfig();
    const effectivePlan = resolveEffectivePlan(authUser.mongoUser);
    const planTier = planConfig.plans[effectivePlan];
    if (!planTier?.entitlements?.aiFeatures) {
      return NextResponse.json(
        { error: "AI features require Growth plan or higher", requiredPlan: "growth" },
        { status: 403 }
      );
    }

    // Check credits (admin/unlimited bypass built-in)
    const creditCheck = await checkCredits(userId, authUser.mongoUser, AI_CREDITS);
    if (!creditCheck.allowed) {
      return NextResponse.json(
        { error: "Insufficient credits", currentBalance: creditCheck.remaining, required: AI_CREDITS },
        { status: 402 }
      );
    }

    // Get OpenAI key
    const openaiKey = await getOpenAIKey(userId);
    if (!openaiKey) {
      return NextResponse.json(
        { error: "No OpenAI API key configured. Please add your key in Settings > API Keys." },
        { status: 400 }
      );
    }

    // Call OpenAI
    const truncated = transcript.slice(0, 12000);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a pastoral assistant. Extract sermon points from the transcript provided. Return JSON with these fields:
- points: Array of { title: string, explanation: string, scriptures: string[] } — extract 4-8 key sermon points with explanations and supporting scripture references
Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Sermon: ${title || "Untitled"}\n\nTranscript:\n${truncated}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[ai/points] OpenAI error:", err);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed: { points: { title: string; explanation: string; scriptures: string[] }[] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }

    if (!Array.isArray(parsed.points)) {
      return NextResponse.json({ error: "Invalid AI response format" }, { status: 502 });
    }

    // Deduct credits via transaction (no $inc on user doc)
    if (!creditCheck.unlimited) {
      await insertCreditTransaction({
        userId,
        type: CreditTransactionType.USAGE,
        source: "ai_generation",
        amount: -AI_CREDITS,
        description: "AI Sermon Points",
        metadata: { feature: "ai_sermon_points", sermonId: sermonId || null },
        createdAt: new Date().toISOString(),
      });
    }

    // Store result
    const point = await insertSermonPoint({
      userId,
      sermonId: sermonId || "",
      points: parsed.points,
      creditsUsed: AI_CREDITS,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      points: {
        _id: point._id?.toString(),
        points: parsed.points,
      },
      creditsUsed: AI_CREDITS,
      creditsRemaining: creditCheck.unlimited ? -1 : creditCheck.remaining - AI_CREDITS,
    });
  } catch (error) {
    console.error("[ai/points] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const skip = parseInt(searchParams.get("skip") || "0", 10);

    const points = await import("@/lib/db").then((m) =>
      m.getSermonPoints(userId, { limit, skip })
    );

    return NextResponse.json({ points });
  } catch (error) {
    console.error("[ai/points] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
