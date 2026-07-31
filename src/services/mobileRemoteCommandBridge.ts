import { safeTauriInvoke, safeTauriListen, type TauriUnlisten } from "./tauriSafe";
import { obsService } from "./obsService";
import { bibleObsService } from "../bible/bibleObsService";
import type { BibleSlide } from "../bible/types";
import { dockObsClient } from "../dock/dockObsClient";
import { lowerThirdObsService } from "../lowerthirds/lowerThirdObsService";
import { LT_THEMES } from "../lowerthirds/themes";
import { getChapter } from "../bible/bibleData";
import { getInstalledTranslations } from "../bible/bibleDb";
import type { BibleTranslation } from "../bible/types";

type MobileCommand =
  | {
      type: "show_scripture";
      reference: string;
      translation?: string;
      verse_text?: string;
      display_reference_label?: string;
      overlay_mode?: string;
      compare_enabled?: boolean;
      compare_layout?: string;
      translation_a?: string;
      translation_b?: string;
      compare_verse_text_a?: string;
      compare_verse_text_b?: string;
    }
  | { type: "clear_scripture" }
  | {
      type: "show_slide";
      song_id: string;
      slide_index: number;
      song_title?: string;
      artist?: string;
      slide_text?: string;
      section_label?: string;
      overlay_mode?: string;
    }
  | { type: "next_slide" }
  | { type: "prev_slide" }
  | { type: "clear_worship" }
  | { type: "show_lower_third"; name: string; title: string }
  | { type: "clear_lower_third" }
  | { type: "get_bible_translations" }
  | { type: "get_bible_chapter"; book: string; chapter: number; translation: string }
  | { type: "get_current_state" }
  | { type: "get_scenes" }
  | { type: "switch_scene"; scene_name: string }
  | { type: "set_preview_scene"; scene_name: string }
  | { type: "toggle_streaming" }
  | { type: "toggle_recording" }
  | { type: "toggle_mic" }
  | { type: "execute_automation"; macro_id: string };

interface MobileCommandEvent {
  commandId: string;
  command: MobileCommand;
}

function parseReference(reference: string): { book: string; chapter: number; verse: number } | null {
  const match = reference.trim().match(/^(.+?)\s+(\d+):(\d+)/);
  if (!match) return null;
  return {
    book: match[1].trim(),
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

async function complete(commandId: string, ok: boolean, payload?: unknown, error?: string) {
  await safeTauriInvoke("complete_mobile_command", {
    commandId,
    ok,
    payload: payload ?? null,
    error: error ?? null,
  }).catch((err) => {
    console.warn("[MobileRemote] Failed to complete command:", err);
  });
}

async function getCurrentStatePayload() {
  const scenes = obsService.status === "connected" ? await obsService.getSceneList() : [];
  const currentProgramScene =
    obsService.status === "connected" ? await obsService.getCurrentProgramScene().catch(() => "") : "";
  const currentPreviewScene =
    obsService.status === "connected" ? await obsService.getCurrentPreviewScene().catch(() => "") : "";

  return {
    obsConnected: obsService.status === "connected",
    currentProgramScene,
    currentPreviewScene,
    scenes: scenes.map((scene) => ({
      name: scene.sceneName,
      id: scene.sceneUuid || scene.sceneName,
    })),
  };
}

async function getBibleTranslationsPayload() {
  const installed = await getInstalledTranslations().catch(() => []);
  const mapped = installed
    .map((item) => ({
      value: String(item.abbr || "").trim().toUpperCase(),
      label: String(item.name || item.abbr || "").trim() || String(item.abbr || "").trim().toUpperCase(),
      language: item.language,
    }))
    .filter((item) => item.value);

  if (!mapped.some((item) => item.value === "KJV")) {
    mapped.unshift({ value: "KJV", label: "King James Version", language: "English" });
  }

  return mapped;
}

async function getBibleChapterPayload(command: Extract<MobileCommand, { type: "get_bible_chapter" }>) {
  const translation = (command.translation || "KJV").trim().toUpperCase() as BibleTranslation;
  const passage = await getChapter(command.book, command.chapter, translation);
  return {
    reference: passage.reference,
    book: passage.book,
    chapter: passage.chapter,
    translation: passage.translation,
    verses: passage.verses.map((verse) => ({
      verse: verse.verse,
      text: verse.text,
      reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
    })),
  };
}

async function handleBibleCommand(command: Extract<MobileCommand, { type: "show_scripture" }>) {
  const parsed = parseReference(command.reference);
  const overlayMode: "fullscreen" | "lower-third" =
    command.overlay_mode === "lower-third" ? "lower-third" : "fullscreen";
  const referenceText = command.display_reference_label || `${command.reference}${command.translation ? ` (${command.translation})` : ""}`;

  if (command.compare_enabled && parsed) {
    const translationA = (command.translation_a || command.translation || "KJV").toUpperCase();
    const translationB = (command.translation_b || "KJV").toUpperCase();
    const verseTextA = command.compare_verse_text_a || command.verse_text || command.reference;
    const verseTextB = command.compare_verse_text_b || verseTextA;
    const compare = {
      enabled: true,
      layout: command.compare_layout === "side-by-side" ? "side-by-side" : "line-by-line",
      columns: [
        {
          book: parsed.book,
          chapter: parsed.chapter,
          verse: parsed.verse,
          verseRange: String(parsed.verse),
          referenceLabel: command.reference,
          translation: translationA,
          verseText: verseTextA,
        },
        {
          book: parsed.book,
          chapter: parsed.chapter,
          verse: parsed.verse,
          verseRange: String(parsed.verse),
          referenceLabel: command.reference,
          translation: translationB,
          verseText: verseTextB,
        },
      ],
    };

    const payload = {
      book: parsed.book,
      chapter: parsed.chapter,
      verse: parsed.verse,
      verseRange: String(parsed.verse),
      referenceLabel: command.reference,
      displayReferenceLabel: referenceText,
      translation: translationA,
      verseText: verseTextA,
      overlayMode,
      compareEnabled: true,
      compareLayout: compare.layout,
      compare,
      translationA,
      translationB,
      bibleThemeSettings: {},
      liveOverrides: null,
    } as Parameters<typeof dockObsClient.pushBible>[0];

    await dockObsClient.bringBibleOverlayForward(overlayMode).catch(() => {});
    if (overlayMode === "lower-third") {
      await dockObsClient.pushBibleOverlayFast({
        verseText: verseTextA,
        referenceText,
        verseRange: String(parsed.verse),
        compareEnabled: true,
        compareLayout: compare.layout,
        compare,
        translationA,
        translationB,
        bibleThemeSettings: {},
        liveOverrides: null,
      });
    } else {
      await dockObsClient.pushBible(payload);
    }
    return;
  }

  const slide: BibleSlide = {
    id: `mobile-${command.reference.replace(/\s+/g, "-")}`,
    reference: referenceText,
    text: command.verse_text || command.reference,
    verseRange: parsed ? String(parsed.verse) : "",
    index: 0,
    total: 1,
  };
  const currentTheme = bibleObsService.getLiveState().theme;
  await bibleObsService.pushSlide(slide, currentTheme, true, false);
}

async function handleLowerThirdCommand(command: Extract<MobileCommand, { type: "show_lower_third" }>) {
  const theme = LT_THEMES.find((item) => item.category === "general") ?? LT_THEMES[0];
  if (!theme) throw new Error("No lower-third theme is available.");

  const values: Record<string, string> = {};
  for (const variable of theme.variables) {
    const key = variable.key.toLowerCase();
    if (key.includes("name") || key.includes("title")) {
      values[variable.key] = command.name;
    } else if (key.includes("role") || key.includes("subtitle") || key.includes("description")) {
      values[variable.key] = command.title;
    } else {
      values[variable.key] = variable.defaultValue;
    }
  }

  await lowerThirdObsService.pushToAll(theme, values, true, false);
}

async function handleWorshipSlideCommand(command: Extract<MobileCommand, { type: "show_slide" }>) {
  const sectionText = command.slide_text?.trim();
  if (!sectionText) {
    throw new Error("The mobile worship command did not include slide text.");
  }

  const overlayMode: "fullscreen" | "lower-third" =
    command.overlay_mode === "fullscreen" ? "fullscreen" : "lower-third";
  const obsData = {
    sectionText,
    sectionLabel: command.section_label || `Slide ${command.slide_index + 1}`,
    songTitle: command.song_title || command.song_id,
    artist: command.artist || "",
    overlayMode,
    bibleThemeSettings: {},
    liveOverrides: null,
    backgroundOnly: false,
  };

  await dockObsClient.bringWorshipOverlayForward(overlayMode).catch(() => {});
  if (overlayMode === "fullscreen") {
    await dockObsClient.pushWorshipLyrics(obsData);
  } else {
    await dockObsClient.pushWorshipOverlayFast(obsData);
  }
}

async function runMobileCommand(command: MobileCommand): Promise<unknown> {
  switch (command.type) {
    case "get_bible_translations":
      return getBibleTranslationsPayload();
    case "get_bible_chapter":
      return getBibleChapterPayload(command);
    case "get_current_state":
      return getCurrentStatePayload();
    case "get_scenes": {
      if (obsService.status !== "connected") return [];
      const scenes = await obsService.getSceneList();
      return scenes.map((scene) => ({ name: scene.sceneName, id: scene.sceneUuid || scene.sceneName }));
    }
    case "switch_scene":
      await obsService.setCurrentProgramScene(command.scene_name);
      return getCurrentStatePayload();
    case "set_preview_scene":
      await obsService.setCurrentPreviewScene(command.scene_name);
      return getCurrentStatePayload();
    case "toggle_streaming":
      await obsService.call("ToggleStream");
      return getCurrentStatePayload();
    case "toggle_recording":
      await obsService.call("ToggleRecord");
      return getCurrentStatePayload();
    case "toggle_mic":
      throw new Error("Mic toggle needs a selected OBS audio input before it can be controlled remotely.");
    case "show_scripture":
      await handleBibleCommand(command);
      return getCurrentStatePayload();
    case "clear_scripture":
      await bibleObsService.pushSlide(null, null, false, true);
      return getCurrentStatePayload();
    case "show_slide":
      await handleWorshipSlideCommand(command);
      return getCurrentStatePayload();
    case "clear_worship":
      await dockObsClient.clearWorshipLyrics();
      return getCurrentStatePayload();
    case "show_lower_third":
      await handleLowerThirdCommand(command);
      return getCurrentStatePayload();
    case "clear_lower_third":
      await lowerThirdObsService.clearAll();
      return getCurrentStatePayload();
    case "next_slide":
    case "prev_slide":
      throw new Error("Worship remote commands need the worship dock state synced first.");
    case "execute_automation":
      throw new Error("Automation execution is not wired to a desktop automation runner yet.");
  }
}

export async function initMobileRemoteCommandBridge(): Promise<TauriUnlisten> {
  return safeTauriListen<MobileCommandEvent>("mobile-companion-command", async ({ payload }) => {
    if (!payload?.commandId || !payload.command) return;

    try {
      const result = await runMobileCommand(payload.command);
      await complete(payload.commandId, true, result);
    } catch (error) {
      await complete(
        payload.commandId,
        false,
        null,
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
