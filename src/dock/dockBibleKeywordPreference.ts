import {
  readDockPreference,
  writeDockPreference,
} from "../services/dockPreferenceStorage";

export const DOCK_BIBLE_PREFS_KEY = "ocs-dock-bible-preferences";
export const DOCK_BIBLE_KEYWORD_MATCH_CHANGED_EVENT = "mce:dock-bible-keyword-match-changed";

type DockBibleKeywordPreference = Record<string, unknown> & {
  keywordMatchPushDirectlyToObs?: boolean;
};

export function readDockBibleKeywordMatchPreference(): boolean {
  return readDockPreference<DockBibleKeywordPreference>(DOCK_BIBLE_PREFS_KEY)
    ?.keywordMatchPushDirectlyToObs === true;
}

export function updateDockBibleKeywordMatchPreference(enabled: boolean): void {
  const current = readDockPreference<DockBibleKeywordPreference>(DOCK_BIBLE_PREFS_KEY) ?? {};
  writeDockPreference(DOCK_BIBLE_PREFS_KEY, {
    ...current,
    keywordMatchPushDirectlyToObs: enabled,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DOCK_BIBLE_KEYWORD_MATCH_CHANGED_EVENT, {
      detail: { enabled },
    }));
  }
}
