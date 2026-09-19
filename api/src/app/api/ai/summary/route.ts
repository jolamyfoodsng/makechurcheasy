import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { getPlanConfig, insertSermonSummary, getCreditUsageByDay, insertCreditTransaction } from "@/lib/db";
import { ObjectId } from "mongodb";
import { resolveEffectivePlan } from "@/lib/trial";
import { checkCredits } from "@/lib/credits";
import { CreditTransactionType } from "@/types/schemas";

const AI_CREDITS = 5;

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
            content: `You are a pastoral assistant. Generate a structured sermon summary from the transcript provided. Return JSON with these fields:
- title: string (concise sermon title)
- summary: string (3-5 sentence overview)
- keyScriptures: string[] (bible references mentioned or implied)
- mainTakeaways: string[] (3-5 key points)
Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Sermon title hint: ${title || "Untitled"}\n\nTranscript:\n${truncated}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[ai/summary] OpenAI error:", err);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed: { title: string; summary: string; keyScriptures: string[]; mainTakeaways: string[] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }

    // Deduct credits via transaction (no $inc on user doc)
    if (!creditCheck.unlimited) {
      await insertCreditTransaction({
        userId,
        type: CreditTransactionType.USAGE,
        source: "ai_generation",
        amount: -AI_CREDITS,
        description: "AI Sermon Summary",
        metadata: { feature: "ai_summary", sermonId: sermonId || null },
        createdAt: new Date().toISOString(),
      });
    }

    // Store result
    const summary = await insertSermonSummary({
      userId,
      sermonId: sermonId || "",
      title: parsed.title || title || "Untitled",
      summary: parsed.summary,
      keyScriptures: parsed.keyScriptures || [],
      mainTakeaways: parsed.mainTakeaways || [],
      creditsUsed: AI_CREDITS,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      summary: {
        _id: summary._id?.toString(),
        title: parsed.title,
        summary: parsed.summary,
        keyScriptures: parsed.keyScriptures,
        mainTakeaways: parsed.mainTakeaways,
      },
      creditsUsed: AI_CREDITS,
      creditsRemaining: creditCheck.unlimited ? -1 : creditCheck.remaining - AI_CREDITS,
    });
  } catch (error) {
    console.error("[ai/summary] Error:", error);
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

    const summaries = await import("@/lib/db").then((m) =>
      m.getSermonSummaries(userId, { limit, skip })
    );

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("[ai/summary] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
