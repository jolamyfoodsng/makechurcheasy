/**
 * aiService.ts — Client-side AI generation for Growth+ features.
 * Calls /api/ai/summary, /api/ai/notes, /api/ai/points on the server.
 */

const API_BASE = "";

export interface AiSummaryResult {
  _id: string;
  title: string;
  summary: string;
  keyScriptures: string[];
  mainTakeaways: string[];
}

export interface AiNotesResult {
  _id: string;
  sections: { heading: string; content: string }[];
}

export interface AiPointsResult {
  _id: string;
  points: { title: string; explanation: string; scriptures: string[] }[];
}

interface AiResponse<T> {
  success: boolean;
  creditsUsed: number;
  creditsRemaining: number;
  summary?: T extends AiSummaryResult ? AiSummaryResult : never;
  notes?: T extends AiNotesResult ? AiNotesResult : never;
  points?: T extends AiPointsResult ? AiPointsResult : never;
  error?: string;
  requiredPlan?: string;
}

async function aiFetch<T>(endpoint: string, body: Record<string, unknown>): Promise<AiResponse<T>> {
  const res = await fetch(`${API_BASE}/api/ai/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `AI request failed (${res.status})`);
  }
  return data;
}

/**
 * Generate a sermon summary from transcript text.
 * Costs 5 credits. Requires Growth+ plan.
 */
export async function generateSummary(
  transcript: string,
  options: { sermonId?: string; title?: string } = {}
): Promise<{ result: AiSummaryResult; creditsUsed: number; creditsRemaining: number }> {
  const data = await aiFetch<AiSummaryResult>("summary", {
    transcript,
    sermonId: options.sermonId || "",
    title: options.title || "",
  });
  return {
    result: data.summary!,
    creditsUsed: data.creditsUsed,
    creditsRemaining: data.creditsRemaining,
  };
}

/**
 * Generate structured sermon notes from transcript text.
 * Costs 10 credits. Requires Growth+ plan.
 */
export async function generateNotes(
  transcript: string,
  options: { sermonId?: string; title?: string } = {}
): Promise<{ result: AiNotesResult; creditsUsed: number; creditsRemaining: number }> {
  const data = await aiFetch<AiNotesResult>("notes", {
    transcript,
    sermonId: options.sermonId || "",
    title: options.title || "",
  });
  return {
    result: data.notes!,
    creditsUsed: data.creditsUsed,
    creditsRemaining: data.creditsRemaining,
  };
}

/**
 * Generate sermon points from transcript text.
 * Costs 10 credits. Requires Growth+ plan.
 */
export async function generatePoints(
  transcript: string,
  options: { sermonId?: string; title?: string } = {}
): Promise<{ result: AiPointsResult; creditsUsed: number; creditsRemaining: number }> {
  const data = await aiFetch<AiPointsResult>("points", {
    transcript,
    sermonId: options.sermonId || "",
    title: options.title || "",
  });
  return {
    result: data.points!,
    creditsUsed: data.creditsUsed,
    creditsRemaining: data.creditsRemaining,
  };
}
