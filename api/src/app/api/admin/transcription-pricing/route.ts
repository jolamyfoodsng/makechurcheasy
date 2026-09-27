import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  getPlatformSettings,
  updatePlatformSection,
  invalidatePlatformSettingsCache,
  type PlatformSettings,
} from "@/lib/platformSettings";
import {
  calculateTopupPricing,
  syncTranscriptionBalancesForPlans,
} from "@/lib/transcriptionCredits";
import { getUsdExchangeRate } from "@/lib/exchangeRates";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const settings = await getPlatformSettings();
    const transcriptionPricing = settings.transcriptionPricing;
    const usdRate = (await getUsdExchangeRate("NGN")) || 1450;

    const [pricingPreviewNGN, pricingPreviewUSD] = await Promise.all([
      calculateTopupPricing("NGN"),
      calculateTopupPricing("USD"),
    ]);

    return NextResponse.json({
      transcriptionPricing,
      usdRate,
      pricingPreviewNGN,
      pricingPreviewUSD,
    });
  } catch (error) {
    console.error("[api/admin/transcription-pricing GET] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const {
      providerCostPerHourUSD,
      profitPerHourNGN,
      freeDailyMinutes,
      freeWeeklyMinutes,
      tierPackages,
      planIncludedHours,
    } = body;

    const currentSettings = await getPlatformSettings();
    const current = currentSettings.transcriptionPricing;

    const updatedPricing = {
      ...current,
      ...(typeof providerCostPerHourUSD === "number" && providerCostPerHourUSD >= 0
        ? { providerCostPerHourUSD }
        : {}),
      ...(typeof profitPerHourNGN === "number" && profitPerHourNGN >= 0
        ? { profitPerHourNGN }
        : {}),
      ...(typeof freeDailyMinutes === "number" && freeDailyMinutes >= 0
        ? { freeDailyMinutes }
        : {}),
      ...(typeof freeWeeklyMinutes === "number" && freeWeeklyMinutes >= 0
        ? { freeWeeklyMinutes }
        : {}),
      ...(Array.isArray(tierPackages) ? { tierPackages } : {}),
      ...(planIncludedHours && typeof planIncludedHours === "object"
        ? {
            planIncludedHours: {
              ...current.planIncludedHours,
              ...planIncludedHours,
            },
          }
        : {}),
    };

    const changedPlans = planIncludedHours && typeof planIncludedHours === "object"
      ? Object.keys(planIncludedHours).filter((plan) => {
          const previous = current.planIncludedHours?.[plan as keyof typeof current.planIncludedHours];
          const next = (planIncludedHours as Record<string, unknown>)[plan];
          return typeof next === "number" && next >= 0 && Number(previous) !== next;
        })
      : [];

    await updatePlatformSection("transcriptionPricing", updatedPricing);
    invalidatePlatformSettingsCache();

    // A saved allowance must reach existing balances immediately. The reset
    // preserves purchased time and writes an auditable allocation transaction.
    const balanceSync = changedPlans.length > 0
      ? await syncTranscriptionBalancesForPlans(
          changedPlans,
          `Admin applied updated transcription allowances: ${changedPlans.join(", ")}`,
        )
      : { matched: 0, reset: 0, failed: 0 };

    const [pricingPreviewNGN, pricingPreviewUSD] = await Promise.all([
      calculateTopupPricing("NGN"),
      calculateTopupPricing("USD"),
    ]);

    return NextResponse.json({
      success: true,
      transcriptionPricing: updatedPricing,
      balanceSync,
      pricingPreviewNGN,
      pricingPreviewUSD,
    });
  } catch (error) {
    console.error("[api/admin/transcription-pricing PUT] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
