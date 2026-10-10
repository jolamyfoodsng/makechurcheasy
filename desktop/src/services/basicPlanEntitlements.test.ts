import { describe, expect, it } from "vitest";
import {
  PLAN_ENTITLEMENTS,
  getLegacyCompatibleEntitlementsForPlan,
} from "../lib/subscriptionSourceOfTruth";

describe("Basic plan entitlements", () => {
  it("keeps the resource limits and feature gates aligned with the paid offer", () => {
    expect(PLAN_ENTITLEMENTS.basic).toMatchObject({
      credits: 100,
      maxSongs: 100,
      maxImages: 100,
      maxVideos: 100,
      maxBibleVersions: -1,
      maxMultiviewTemplates: 5,
      multiview: true,
      tickers: true,
      maxLowerThirds: -1,
      maxTickerThemes: -1,
      speechToScripture: true,
      translation: false,
      countdowns: false,
    });
  });

  it("allows Verse AI but blocks transcript translation in legacy consumers", () => {
    expect(getLegacyCompatibleEntitlementsForPlan("basic")).toMatchObject({
      songs: 100,
      images: 100,
      videos: 100,
      bibleVersions: -1,
      multiviewTemplates: 5,
      multiview: true,
      tickers: true,
      lowerThirds: -1,
      tickerThemes: -1,
      speechToScripture: true,
      translation: false,
      sermonExport: false,
      aiFeatures: false,
      countdowns: false,
    });
  });

  it("keeps Growth unlimited and gives Free 3 broadcast graphics and 3 tickers", () => {
    expect(getLegacyCompatibleEntitlementsForPlan("free")).toMatchObject({
      multiviewTemplates: 0,
      multiview: false,
      tickers: true,
      lowerThirds: 3,
      tickerThemes: 3,
      countdowns: false,
    });
    expect(getLegacyCompatibleEntitlementsForPlan("growth")).toMatchObject({
      multiviewTemplates: -1,
      multiview: true,
      tickers: true,
      lowerThirds: -1,
      countdowns: true,
    });
  });
});
