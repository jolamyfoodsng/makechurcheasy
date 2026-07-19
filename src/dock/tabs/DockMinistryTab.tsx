/**
 * DockMinistryTab.tsx — Ministry tab for the MakeChurchEasy Dock
 *
 * Sub-tabs:
 *   1. Lower Thirds — send/blank lower-third overlays via OBS
 *   2. Countdowns — countdown timers
 *
 * Uses dockObsClient for OBS communication (same WebSocket
 * connection shared across all dock tabs).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import type { DockStagedItem } from "../dockTypes";
import Icon from "../DockIcon";
import { LT_ALL_THEMES } from "../../lowerthirds/themes";
import { loadDockLTFavorites, loadDockFavoriteBibleThemes } from "../dockThemeData";
import type { LowerThirdTheme } from "../../lowerthirds/types";
import type { LTSize } from "../../lowerthirds/types";
import { LT_SIZE_LABELS, LT_SIZE_SCALE } from "../../lowerthirds/types";
import type { BibleTheme } from "../../bible/types";
import allThemesData from "../../../lower_thirds/all_themes.json";
import DockLowerThirdEditor from "./DockLowerThirdEditor";
import DockCountdownsTab from "./DockCountdownsTab";
import { requireEntitlement, getDockPlan } from "../dockEntitlement";
import { getSettings } from "../../multiview/mvStore";
import { localizeLowerThirdThemeAssets } from "../../lowerthirds/runtimeBranding";

const ALL_LT_THEMES: LowerThirdTheme[] = [
  ...LT_ALL_THEMES,
  ...((allThemesData.themes as unknown as LowerThirdTheme[]) || [])
    .map((t) => localizeLowerThirdThemeAssets(t))
    .filter(
      (t) => !LT_ALL_THEMES.some((lt) => lt.id === t.id),
    ),
];

// Tagged union: supports both LowerThirdTheme (HTML template) and BibleTheme (CSS overlay)
interface LTThemeEntry {
  kind: "lt";
  theme: LowerThirdTheme;
  label: string;
}
interface BibleThemeEntry {
  kind: "bible";
  theme: BibleTheme;
  label: string;
}
type MixedLTThemeEntry = LTThemeEntry | BibleThemeEntry;

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
}



type MinistrySubTab = "lower-thirds" | "countdowns";

const MINISTRY_TAB_KEY = "dock-ministry-active-tab";

function loadMinistryTab(): MinistrySubTab {
  try {
    const raw = localStorage.getItem(MINISTRY_TAB_KEY);
    if (raw === "lower-thirds" || raw === "countdowns") return raw;
  } catch { /* ignore */ }
  return "lower-thirds";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DockMinistryTab({ staged: _staged, onStage: _onStage }: Props) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<MinistrySubTab>(loadMinistryTab);
  const [obsConnected, setObsConnected] = useState(dockObsClient.isConnected);
  const [dockPlan, setDockPlan] = useState<string>(() => getDockPlan());

  // Lower-thirds state — mixed LowerThirdTheme + BibleTheme entries
  const [ltFavorites, setLtFavorites] = useState<MixedLTThemeEntry[]>([]);
  const [ltSelectedIdx, setLtSelectedIdx] = useState(0);
  const [ltSending, setLtSending] = useState(false);
  const [ltFeedback, setLtFeedback] = useState<string | null>(null);
  const [ltFeedbackTone, setLtFeedbackTone] = useState<"success" | "error">("success");
  const [ltSize, setLtSize] = useState<LTSize>(() => {
    const saved = getSettings().defaultSpeakerSize;
    return (saved && LT_SIZE_LABELS[saved as LTSize]) ? (saved as LTSize) : "xl";
  });
  const [ltLive, setLtLive] = useState(false);
  // BibleTheme lower-third text input (used when a BibleTheme is selected)
  const [bibleLtText, setBibleLtText] = useState("");

  const mountedRef = useRef(true);

  // Persist sub-tab preference
  useEffect(() => { try { localStorage.setItem(MINISTRY_TAB_KEY, subTab); } catch { /* ignore */ } }, [subTab]);

  // OBS connection
  useEffect(() => {
    mountedRef.current = true;
    const unsub = dockObsClient.onStatusChange((status) => {
      if (mountedRef.current) setObsConnected(status === "connected");
    });
    if (mountedRef.current) setObsConnected(dockObsClient.isConnected);
    return () => { mountedRef.current = false; unsub(); };
  }, []);

  // Refresh dock plan every 30s (matches DockAuthGate polling)
  useEffect(() => {
    const id = setInterval(() => {
      if (mountedRef.current) setDockPlan(getDockPlan());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Clear LT feedback after 3s
  useEffect(() => {
    if (!ltFeedback) return;
    const t = setTimeout(() => { if (mountedRef.current) setLtFeedback(null); }, 3000);
    return () => clearTimeout(t);
  }, [ltFeedback]);

  // Load favorite LT themes (both LowerThirdTheme and BibleTheme lower-thirds)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadDockLTFavorites().catch(() => new Set<string>()),
      loadDockFavoriteBibleThemes().catch(() => [] as BibleTheme[]),
    ]).then(([ltIdSet, bibleThemes]) => {
      if (cancelled) return;
      const entries: MixedLTThemeEntry[] = [];

      // LowerThirdTheme favorites
      const ltThemes = ALL_LT_THEMES.filter((t) => ltIdSet.has(t.id));
      for (const t of ltThemes.length > 0 ? ltThemes : LT_ALL_THEMES.slice(0, 6)) {
        entries.push({ kind: "lt", theme: t, label: t.name });
      }

      // BibleTheme lower-third favorites (custom themes from ProductionThemeSettingsPage)
      for (const bt of bibleThemes) {
        entries.push({ kind: "bible", theme: bt, label: `✦ ${bt.name}` });
      }

      setLtFavorites(entries);
    }).catch((err) => {
      console.warn("[DockMinistry] Failed to load LT favorites:", err);
      if (!cancelled) {
        setLtFavorites(LT_ALL_THEMES.slice(0, 6).map((t) => ({ kind: "lt" as const, theme: t, label: t.name })));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const ltSelectedEntry = ltFavorites[ltSelectedIdx] ?? ltFavorites[0] ?? null;

  // Reset selected index when favorites change
  useEffect(() => { setLtSelectedIdx(0); }, [ltFavorites]);

  const handleSelectLtTheme = useCallback((entryIdx: number) => {
    if (entryIdx >= 0 && entryIdx < ltFavorites.length) setLtSelectedIdx(entryIdx);
  }, [ltFavorites]);

  return (
    <div className="dock-mv-tab">
      {/* ── Header ── */}


      {/* ── Sub-Tab Switcher ── */}
      <div className="dock-ministry-tabs">
        <button
          type="button"
          className={`dock-ministry-tab${subTab === "lower-thirds" ? " dock-ministry-tab--active" : ""}`}
          onClick={() => setSubTab("lower-thirds")}
          title={t("ministry.lowerThirds")}>
          <Icon name="subtitles" size={12} />
          <span>{t("ministry.lowerThirds")}</span>
        </button>
        {dockPlan !== "free" && (
          <button
            type="button"
            className={`dock-ministry-tab${subTab === "countdowns" ? " dock-ministry-tab--active" : ""}`}
            onClick={() => setSubTab("countdowns")}
            title={t("ministry.countdowns")}>
            <Icon name="timer" size={12} />
            <span>{t("ministry.countdowns")}</span>
          </button>
        )}
      </div>

      {/* ── Lower Thirds Tab ── */}
      {subTab === "lower-thirds" && (
        <>
          {/* LT Feedback */}
          {ltFeedback && (
            <div className={`dock-mv-tab__feedback dock-mv-tab__feedback--${ltFeedbackTone}`}>
              <Icon name={ltFeedbackTone === "success" ? "check_circle" : "error"} size={14} />
              <span>{ltFeedback}</span>
              <button type="button" className="dock-mv-tab__feedback-close" onClick={() => setLtFeedback(null)} title={t("common.close")}>
                <Icon name="close" size={12} />
              </button>
            </div>
          )}

          <div className="dock-mv-tab__list">
            {ltFavorites.length === 0 ? (
              <div className="dock-mv-tab__section">
                <div style={{ fontSize: 11, color: "var(--dock-text-dim)", textAlign: "center", padding: "12px 0" }}>
                  <Icon name="subtitles" size={24} style={{ color: "var(--dock-border)", display: "block", margin: "0 auto 8px" }} />
                  {t("ministry.starThemeHint")}
                </div>
              </div>
            ) : (
              <>
                {/* Theme Picker Dropdown */}
                <div className="dock-mv-tab__section">
                  <div className="dock-mv-tab__section-label">{t("ministry.theme")}</div>
                  <div className="dock-mv-tab__section-desc">{t("ministry.themeDesc")}</div>
                  <div style={{ padding: "4px 0" }}>
                    <select
                      value={ltSelectedIdx}
                      onChange={(e) => handleSelectLtTheme(Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: "var(--dock-surface)",
                        border: "1px solid var(--dock-border)",
                        borderRadius: 3,
                        padding: "4px 6px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--dock-text)",
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {ltFavorites.map((entry, i) => (
                        <option key={`${entry.kind}-${entry.label}-${i}`} value={i}>
                          {entry.label}{entry.kind === "bible" ? ` ${t("ministry.custom")}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Size Multiplier */}
                <div className="dock-mv-tab__section">
                  <div className="dock-mv-tab__section-label">{t("ministry.size")}</div>
                  <div className="dock-mv-tab__section-desc">{t("ministry.sizeDesc")}</div>
                  <div style={{ padding: "4px 0", display: "flex", gap: 4 }}>
                    {(["xl", "x2"] as LTSize[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setLtSize(s)}
                        style={{
                          flex: 1,
                          padding: "4px 0",
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: "inherit",
                          borderRadius: 3,
                          border: `1px solid ${ltSize === s ? "var(--dock-accent)" : "var(--dock-border)"}`,
                          background: ltSize === s ? "var(--dock-accent)" : "transparent",
                          color: ltSize === s ? "#fff" : "var(--dock-text-dim)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {LT_SIZE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Render editor based on selected theme type */}
                {ltSelectedEntry?.kind === "lt" ? (
                  <DockLowerThirdEditor
                    theme={ltSelectedEntry.theme}
                    themes={ltFavorites.filter((e) => e.kind === "lt").map((e) => (e as LTThemeEntry).theme)}
                    onSelectTheme={(themeId) => {
                      const idx = ltFavorites.findIndex((e) => e.kind === "lt" && (e as LTThemeEntry).theme.id === themeId);
                      if (idx >= 0) setLtSelectedIdx(idx);
                    }}
                    sending={ltSending}
                    size={ltSize}
                    live={ltLive}
                    onSend={async (url) => {
                      if (!(await requireEntitlement("lowerThirds", 0))) return;
                      setLtSending(true);
                      setLtFeedback(null);
                      try {
                        await ensureObsConnected();
                        const scale = LT_SIZE_SCALE[ltSize] ?? 1;
                        await dockObsClient.pushLowerThirdOverlayUrl(url, {
                          sourceWidth: Math.round(1920 / scale),
                          sourceHeight: Math.round(1080 / scale),
                        });
                        setLtLive(true);
                        setLtFeedbackTone("success");
                        setLtFeedback(t("ministry.lowerThirdLive"));
                      } catch (err) {
                        setLtFeedbackTone("error");
                        setLtFeedback(err instanceof Error ? err.message : t("ministry.sendFailed"));
                      } finally {
                        setLtSending(false);
                      }
                    }}
                    onUpdate={async (url) => {
                      try {
                        await ensureObsConnected();
                        await dockObsClient.call("SetInputSettings", {
                          inputName: "MCE Lower Third",
                          inputSettings: { url },
                        });
                      } catch (err) {
                        console.warn("[DockMinistry] LT update failed:", err);
                      }
                    }}
                    onBlank={async (url) => {
                      setLtSending(true);
                      setLtFeedback(null);
                      try {
                        await ensureObsConnected();
                        const exitDuration = ((ltSelectedEntry?.theme as LowerThirdTheme)?.exitAnimation?.duration ?? 800) + 100;
                        await dockObsClient.animateLowerThirdOverlayUrlOut(url, exitDuration);
                        setLtLive(false);
                        setLtFeedbackTone("success");
                        setLtFeedback(t("ministry.lowerThirdCleared"));
                      } catch (err) {
                        setLtFeedbackTone("error");
                        setLtFeedback(err instanceof Error ? err.message : t("ministry.blankFailed"));
                      } finally {
                        setLtSending(false);
                      }
                    }}
                    onAnimateOut={async (url) => {
                      setLtSending(true);
                      setLtFeedback(null);
                      try {
                        await ensureObsConnected();
                        const exitDuration = ((ltSelectedEntry?.theme as LowerThirdTheme)?.exitAnimation?.duration ?? 800) + 100;
                        await dockObsClient.animateLowerThirdOverlayUrlOut(url, exitDuration);
                        setLtLive(false);
                        setLtFeedbackTone("success");
                        setLtFeedback(t("ministry.lowerThirdAnimatedOut"));
                      } catch (err) {
                        setLtFeedbackTone("error");
                        setLtFeedback(err instanceof Error ? err.message : t("ministry.animateOutFailed"));
                      } finally {
                        setLtSending(false);
                      }
                    }}
                  />
                ) : ltSelectedEntry?.kind === "bible" ? (
                  /* BibleTheme lower-third: simple text input + send via pushBible */
                  <div className="dock-mv-tab__section">
                    <div className="dock-mv-tab__section-label">{t("ministry.content")}</div>
                    <div className="dock-mv-tab__section-desc">{t("ministry.contentDesc")}</div>
                    <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea
                        value={bibleLtText}
                        onChange={(e) => setBibleLtText(e.target.value)}
                        placeholder={t("ministry.typeText")}
                        rows={3}
                        style={{
                          width: "100%",
                          background: "var(--dock-surface)",
                          border: "1px solid var(--dock-border)",
                          borderRadius: 3,
                          padding: "4px 6px",
                          fontSize: 11,
                          color: "var(--dock-text)",
                          resize: "none",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>

                    {/* BibleTheme preview note */}
                    <div style={{ fontSize: 9, color: "var(--dock-text-dim)", marginTop: 4 }}>
                      {t("ministry.usingCustomTheme")} {ltSelectedEntry.theme.name}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 6, padding: "6px 0" }}>
                      <button
                        type="button"
                        className={`dock-btn dock-btn--sm ${ltSending ? "dock-btn--loading" : "dock-btn--primary"}`}
                        disabled={ltSending || !bibleLtText.trim() || !obsConnected}
                        onClick={async () => {
                          if (!bibleLtText.trim() || ltSelectedEntry?.kind !== "bible") return;
                          setLtSending(true);
                          setLtFeedback(null);
                          try {
                            await ensureObsConnected();
                            await dockObsClient.pushBible({
                              book: "",
                              chapter: 0,
                              verse: 0,
                              translation: "",
                              verseText: bibleLtText.trim(),
                              overlayMode: "lower-third",
                              bibleThemeSettings: ltSelectedEntry.theme.settings as unknown as Record<string, unknown>,
                            });
                            setLtLive(true);
                            setLtFeedbackTone("success");
                            setLtFeedback(t("ministry.lowerThirdLive"));
                          } catch (err) {
                            setLtFeedbackTone("error");
                            setLtFeedback(err instanceof Error ? err.message : t("ministry.sendFailed"));
                          } finally {
                            setLtSending(false);
                          }
                        }}
                        style={{ flex: 1 }}
                      >
                        <Icon name="play_arrow" size={14} />
                        <span>{t("ministry.goLive")}</span>
                      </button>
                      {ltLive && (
                        <button
                          type="button"
                          className={`dock-btn dock-btn--sm ${ltSending ? "dock-btn--loading" : ""}`}
                          disabled={ltSending || !obsConnected}
                          onClick={async () => {
                            setLtSending(true);
                            setLtFeedback(null);
                            try {
                              await ensureObsConnected();
                              await dockObsClient.pushBible({
                                book: "",
                                chapter: 0,
                                verse: 0,
                                translation: "",
                                verseText: "",
                                overlayMode: "lower-third",
                                bibleThemeSettings: ltSelectedEntry?.kind === "bible" ? ltSelectedEntry.theme.settings as unknown as Record<string, unknown> : null,
                              });
                              // Wait for exit animation (use theme's animation duration), then disable the source
                              const animDuration = ltSelectedEntry?.kind === "bible" ? Number(ltSelectedEntry.theme.settings?.animationDuration) || 800 : 800;
                              await new Promise((r) => setTimeout(r, animDuration + 100));
                              await dockObsClient.clearBible();
                              setLtLive(false);
                              setLtFeedbackTone("success");
                              setLtFeedback(t("ministry.lowerThirdAnimatedOut"));
                            } catch (err) {
                              setLtFeedbackTone("error");
                              setLtFeedback(err instanceof Error ? err.message : t("ministry.animateOutFailed"));
                            } finally {
                              setLtSending(false);
                            }
                          }}
                          style={{
                            flex: 1,
                            background: "transparent",
                            border: "1px solid var(--dock-border)",
                            color: "var(--dock-text-dim)",
                          }}
                        >
                          <Icon name="animation" size={14} />
                          <span>{t("ministry.animateOut")}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`dock-btn dock-btn--sm ${ltSending ? "dock-btn--loading" : ""}`}
                        disabled={ltSending || !obsConnected}
                        onClick={async () => {
                          setLtSending(true);
                          setLtFeedback(null);
                          try {
                            await ensureObsConnected();
                            await dockObsClient.pushBible({
                              book: "",
                              chapter: 0,
                              verse: 0,
                              translation: "",
                              verseText: "",
                              overlayMode: "lower-third",
                              bibleThemeSettings: ltSelectedEntry?.kind === "bible" ? ltSelectedEntry.theme.settings as unknown as Record<string, unknown> : null,
                            });
                            // Wait for exit animation (use theme's animation duration), then disable the source
                            const animDuration = ltSelectedEntry?.kind === "bible" ? Number(ltSelectedEntry.theme.settings?.animationDuration) || 800 : 800;
                            await new Promise((r) => setTimeout(r, animDuration + 100));
                            await dockObsClient.clearBible();
                            setLtLive(false);
                            setLtFeedbackTone("success");
                            setLtFeedback(t("ministry.lowerThirdCleared"));
                          } catch (err) {
                            setLtFeedbackTone("error");
                            setLtFeedback(err instanceof Error ? err.message : t("ministry.blankFailed"));
                          } finally {
                            setLtSending(false);
                          }
                        }}
                        style={{
                          flex: 1,
                          background: "transparent",
                          border: "1px solid var(--dock-border)",
                          color: "var(--dock-text-dim)",
                        }}
                      >
                        <Icon name="visibility_off" size={14} />
                        <span>{t("ministry.blank")}</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Countdowns Tab ── */}
      {subTab === "countdowns" && dockPlan !== "free" && (
        <DockCountdownsTab />
      )}
    </div>
  );
}
