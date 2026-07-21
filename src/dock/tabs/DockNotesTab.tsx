import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { DockStagedItem } from "../dockTypes";
import { dockObsClient } from "../dockObsClient";
import { overlayBridge } from "../dockOverlayBridge";
import { ensureObsConnected } from "../obsConnectionGuard";
import { BUILTIN_THEMES } from "../../bible/themes/builtinThemes";
import type { BibleTheme } from "../../bible/types";
import type { DockFullscreenQuickThemeSettings } from "../components/DockFullscreenThemeQuickSettings";
import Icon from "../DockIcon";
import DockBottomToolbar from "../components/DockBottomToolbar";
import DockThemeSettingsModal from "../components/DockThemeSettingsModal";
import { getUserScopedKey } from "../../services/userScopedStorage";

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  isActive?: boolean;
}

type OverlayMode = "fullscreen" | "lower-third";

interface DockNote {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

const DOCK_NOTES_KEY = "ocs-dock-notes-v1";
const DOCK_NOTES_PREFS_KEY = "ocs-dock-notes-preferences";

interface DockNotesPreferences {
  overlayMode?: OverlayMode;
  fullscreenThemeId?: string;
  lowerThirdThemeId?: string;
  fullscreenQuickSettings?: DockFullscreenQuickThemeSettings | null;
  lowerThirdQuickSettings?: DockFullscreenQuickThemeSettings | null;
  updatedAt?: string;
}

function loadNotes(): DockNote[] {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_NOTES_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotes(items: DockNote[]): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_NOTES_KEY), JSON.stringify(items));
  } catch { }
}

function loadPreferences(): DockNotesPreferences {
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_NOTES_PREFS_KEY));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePreferences(prefs: DockNotesPreferences): void {
  try {
    localStorage.setItem(getUserScopedKey(DOCK_NOTES_PREFS_KEY), JSON.stringify(prefs));
  } catch { }
}

function generateNoteSlides(note: DockNote): { id: string; label: string; text: string }[] {
  const slides: { id: string; label: string; text: string }[] = [];
  const sections = note.content.split(/\n\n+/).filter(Boolean);
  if (sections.length === 0 && note.title) {
    slides.push({ id: crypto.randomUUID?.() ?? `s-${Date.now()}`, label: "", text: note.title });
  } else {
    sections.forEach((text, i) => {
      slides.push({
        id: crypto.randomUUID?.() ?? `s-${Date.now()}-${i}`,
        label: i === 0 ? note.title : "",
        text,
      });
    });
  }
  return slides;
}

type ToastTone = "info" | "success" | "error";

export default function DockNotesTab({ onStage, isActive }: Props) {
  const [notes, setNotes] = useState<DockNote[]>(() => loadNotes());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<DockNote | null>(null);
  const [selectedSlideIdx, setSelectedSlideIdx] = useState<number | null>(null);
  const [visibleSlideIdx, setVisibleSlideIdx] = useState<number | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(() => loadPreferences().overlayMode ?? "fullscreen");
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [selectedFSTheme, setSelectedFSTheme] = useState<BibleTheme>(BUILTIN_THEMES[0]);
  const [selectedLTTheme, setSelectedLTTheme] = useState<BibleTheme>(BUILTIN_THEMES[0]);
  const [fullscreenQuickSettings, setFullscreenQuickSettings] = useState<DockFullscreenQuickThemeSettings | null>(() => loadPreferences().fullscreenQuickSettings ?? null);
  const [lowerThirdQuickSettings, setLowerThirdQuickSettings] = useState<DockFullscreenQuickThemeSettings | null>(() => loadPreferences().lowerThirdQuickSettings ?? null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<DockNote | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [toasts, setToasts] = useState<{ id: string; message: string; tone: ToastTone }[]>([]);
  const obsAutoPushArmedRef = useRef(false);
  const modeOnlyChangeRef = useRef(false);
  const modeSwitchSequenceRef = useRef(0);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((n) =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [searchQuery, notes]);

  const selectedNoteSlides = useMemo(
    () => (selectedNote ? generateNoteSlides(selectedNote) : []),
    [selectedNote],
  );

  const activeSlideIndex = useMemo(() => {
    if (selectedSlideIdx !== null && selectedSlideIdx < selectedNoteSlides.length) return selectedSlideIdx;
    if (visibleSlideIdx !== null && visibleSlideIdx < selectedNoteSlides.length) return visibleSlideIdx;
    return selectedNoteSlides.length > 0 ? 0 : null;
  }, [selectedNoteSlides.length, selectedSlideIdx, visibleSlideIdx]);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 1500);
  }, []);

  const openNewNote = useCallback(() => {
    setEditingNote(null);
    setDraftTitle("");
    setDraftContent("");
    setShowNoteEditor(true);
  }, []);

  const openEditNote = useCallback((note: DockNote) => {
    setEditingNote(note);
    setDraftTitle(note.title);
    setDraftContent(note.content);
    setShowNoteEditor(true);
  }, []);

  const saveNoteDraft = useCallback(() => {
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title || !content) return;
    const now = Date.now();
    if (editingNote) {
      const updated: DockNote = { ...editingNote, title, content, updatedAt: now };
      const next = notes.map((n) => (n.id === updated.id ? updated : n));
      setNotes(next);
      saveNotes(next);
      setSelectedNote((cur) => (cur?.id === updated.id ? updated : cur));
    } else {
      const newNote: DockNote = {
        id: crypto.randomUUID?.() ?? `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        content,
        updatedAt: now,
      };
      const next = [newNote, ...notes];
      setNotes(next);
      saveNotes(next);
    }
    setShowNoteEditor(false);
    setEditingNote(null);
  }, [draftTitle, draftContent, editingNote, notes]);

  const deleteNote = useCallback((id: string) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    saveNotes(next);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
      setSelectedSlideIdx(null);
      setVisibleSlideIdx(null);
    }
    showToast("Note deleted", "info");
  }, [notes, selectedNote, showToast]);

  const buildNoteObsPayload = useCallback(
    (idx: number) => {
      if (!selectedNote) return null;
      const slide = selectedNoteSlides[idx];
      if (!slide) return null;
      const theme = overlayMode === "fullscreen" ? selectedFSTheme : selectedLTTheme;
      return {
        stageItem: {
          type: "notes" as const,
          label: slide.label || selectedNote.title,
          subtitle: selectedNote.title,
          data: { sectionText: slide.text, sectionLabel: slide.label, note: selectedNote, slideIdx: idx, overlayMode, theme: theme.id },
        },
        obsData: {
          sectionText: slide.text,
          sectionLabel: slide.label || selectedNote.title,
          songTitle: selectedNote.title,
          overlayMode,
          bibleThemeSettings: theme.settings as unknown as Record<string, unknown>,
          liveOverrides: null,
          backgroundOnly: false,
        },
      };
    },
    [selectedNote, selectedNoteSlides, overlayMode, selectedFSTheme, selectedLTTheme],
  );

  const pushNoteSlide = useCallback(
    (idx: number) => {
      obsAutoPushArmedRef.current = true;
      const payload = buildNoteObsPayload(idx);
      if (!payload) return;
      setActionError("");
      setSelectedSlideIdx(idx);
      setVisibleSlideIdx(idx);
      onStage(payload.stageItem);

      const pushLive = () => payload.obsData.overlayMode === "lower-third"
        ? dockObsClient.pushNotesOverlayFast(payload.obsData)
        : dockObsClient.pushNotesLyrics(payload.obsData);

      const bringNotesForward = dockObsClient
        .bringNotesOverlayForward(payload.obsData.overlayMode ?? "fullscreen")
        .catch(() => { });

      void bringNotesForward
        .then(() => dockObsClient.primeNotesOverlay(payload.obsData))
        .catch(() => { });

      bringNotesForward
        .then(pushLive)
        .then(() => {
          setOverlayVisible(true);
        })
        .catch((err) => {
          console.warn("[DockNotesTab] OBS push failed:", err);
          setActionError(err instanceof Error ? err.message : String(err));
        });
    },
    [buildNoteObsPayload, onStage],
  );

  const handleClear = useCallback(async () => {
    setActionError("");
    try {
      await ensureObsConnected();
      if (overlayVisible) {
        await dockObsClient.clearNotesLyrics();
        setOverlayVisible(false);
      } else if (activeSlideIndex !== null) {
        await pushNoteSlide(activeSlideIndex);
      }
    } catch (err) {
      console.warn("[DockNotesTab] Toggle failed:", err);
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }, [overlayVisible, activeSlideIndex, pushNoteSlide]);

  const restageCurrent = useCallback(async () => {
    if (activeSlideIndex === null) return;
    await pushNoteSlide(activeSlideIndex);
  }, [activeSlideIndex, pushNoteSlide]);

  const handleOverlayModeChange = useCallback((nextMode: OverlayMode) => {
    if (nextMode === overlayMode) return;

    modeOnlyChangeRef.current = true;

    setOverlayMode(nextMode);
    const prefs = loadPreferences();
    prefs.overlayMode = nextMode;
    savePreferences(prefs);

    overlayBridge.publish({
      channel: "notes",
      type: "mode-change",
      mode: nextMode,
      transitionId: ++modeSwitchSequenceRef.current,
      timestamp: performance.now(),
    });

    try {
      const bc = new BroadcastChannel("obs-church-studio-notes-overlay");
      bc.postMessage({
        type: "mode-change",
        mode: nextMode,
        theme: nextMode === "lower-third" ? selectedLTTheme.settings : selectedFSTheme.settings,
        transitionId: modeSwitchSequenceRef.current,
        timestamp: performance.now(),
      });
      bc.close();
    } catch { /* browser may not support BroadcastChannel */ }

    try {
      const raw = localStorage.getItem("notes-overlay-data");
      if (raw) {
        const existing = JSON.parse(raw);
        existing.mode = nextMode;
        localStorage.setItem("notes-overlay-data", JSON.stringify(existing));
      }
    } catch { /* ignore */ }

    requestAnimationFrame(() => {
      modeOnlyChangeRef.current = false;
    });
  }, [overlayMode]);

  // Persist theme preferences on change
  useEffect(() => {
    const prefs = loadPreferences();
    prefs.fullscreenThemeId = selectedFSTheme.id;
    prefs.lowerThirdThemeId = selectedLTTheme.id;
    savePreferences(prefs);
  }, [selectedFSTheme.id, selectedLTTheme.id]);

  // Persist quick settings on change
  useEffect(() => {
    const prefs = loadPreferences();
    prefs.fullscreenQuickSettings = fullscreenQuickSettings;
    prefs.lowerThirdQuickSettings = lowerThirdQuickSettings;
    savePreferences(prefs);
  }, [fullscreenQuickSettings, lowerThirdQuickSettings]);

  // Auto-restage on mode change (only if not a fast mode-only toggle)
  const prevOverlayMode = useRef(overlayMode);
  useEffect(() => {
    const changed = prevOverlayMode.current !== overlayMode;
    prevOverlayMode.current = overlayMode;
    if (!changed) return;
    if (modeOnlyChangeRef.current) return;
    if (!obsAutoPushArmedRef.current) return;
    if (selectedNote && activeSlideIndex !== null) {
      void restageCurrent();
    }
  }, [overlayMode, selectedNote, activeSlideIndex, restageCurrent]);

  // Escape key handler
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const targetElement = target instanceof Element ? target : null;
      if (event.key === "Escape") {
        if (showNoteEditor) {
          event.preventDefault();
          setShowNoteEditor(false);
          setEditingNote(null);
          return;
        }
        if (targetElement?.closest(".dtb-modal, .dock-dialog")) return;
        if (selectedNote) {
          event.preventDefault();
          setSelectedNote(null);
          setSelectedSlideIdx(null);
          setVisibleSlideIdx(null);
          onStage(null);
          ensureObsConnected().then(() => dockObsClient.clearNotesLyrics()).catch(() => { });
          return;
        }
      }
      if (!selectedNote || !selectedNoteSlides.length) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        const next = Math.min((activeSlideIndex ?? 0) + 1, selectedNoteSlides.length - 1);
        void pushNoteSlide(next);
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        const prev = Math.max((activeSlideIndex ?? 0) - 1, 0);
        void pushNoteSlide(prev);
      } else if (event.key === "Enter" && activeSlideIndex !== null) {
        event.preventDefault();
        void pushNoteSlide(activeSlideIndex);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, showNoteEditor, selectedNote, selectedNoteSlides, activeSlideIndex, onStage, pushNoteSlide]);

  return (
    <div className="dock-module dock-module--worship">
      {!selectedNote ? (
        <>
          <section className="dock-console-panel dock-console-panel--toolbar">
            <div className="dock-console-header">
              <div>
                <div className="dock-console-header__eyebrow"></div>
                <div className="dock-console-header__eyebrow"></div>
                <div className="dock-console-header__eyebrow"></div>
                <div className="dock-console-header__eyebrow">Search Notes</div>
                <div className="dock-console-header__eyebrow"></div>
              </div>
              <div className="dock-console-actions dock-console-actions--song-browser">
                <button type="button" className="dock-console-toggle" onClick={openNewNote} title="Add Note" aria-label="Add Note">
                  <Icon name="add" size={13} />
                  <span className="dock-console-toggle__label">Add Note</span>
                </button>
              </div>
            </div>
            <div className="dock-search dock-search--console" style={{ marginBottom: 0 }}>
              <Icon name="search" size={14} className="dock-search__icon" />
              <input
                className="dock-input"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search notes"
              />
              {searchQuery && (
                <button type="button" className="dock-search__clear" onClick={() => setSearchQuery("")} aria-label="Clear" title="Clear">
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          </section>

          <section className="dock-console-panel dock-console-panel--workspace dock-worship-workspace">
            {filteredNotes.length === 0 ? (
              <div className="dock-empty dock-worship-workspace__empty">
                <Icon name={notes.length === 0 ? "sticky_note_2" : "search_off"} size={20} />
                <div className="dock-empty__title">
                  {notes.length === 0 ? "No notes yet" : "No notes match"}
                </div>
                <div className="dock-empty__text">
                  {notes.length === 0 ? 'Click "Add Note" to create your first one.' : `No results for "${searchQuery}"`}
                </div>
              </div>
            ) : (
              <div className="dock-console-list dock-worship-workspace__list">
                {filteredNotes.map((note) => (
                  <div key={note.id} className="dock-card dock-card--console dock-song-card">
                    <button
                      type="button"
                      className="dock-song-card__main"
                      onClick={() => {
                        setSelectedNote(note);
                        setSelectedSlideIdx(0);
                        setVisibleSlideIdx(null);
                      }}
                      title={note.title}
                    >
                      <span className="dock-card__title">{note.title}</span>
                      <span className="dock-card__subtitle">
                        {note.content.split("\n")[0]?.substring(0, 80) || "No content"}
                      </span>
                    </button>
                    <button type="button" className="dock-song-card__edit" onClick={() => openEditNote(note)} aria-label="Edit" title="Edit">
                      <Icon name="edit" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="dock-console-panel dock-console-panel--toolbar dock-worship-summary">
            <div className="dock-worship-summary__header">
              <div className="dock-worship-summary__left">
                <button
                  type="button"
                  className="dock-worship-back-btn"
                  onClick={() => {
                    setSelectedNote(null);
                    setSelectedSlideIdx(null);
                    setVisibleSlideIdx(null);
                  }}
                  title="Back"
                >
                  <Icon name="arrow_back" size={14} />
                </button>
                <div className="dock-worship-summary__copy">
                  <div className="dock-worship-summary__title">{selectedNote.title}</div>
                  <div className="dock-worship-summary__artist">Note</div>
                </div>
              </div>
              <div className="dock-worship-summary__actions">
                <button type="button" className="dock-shell-icon-btn" onClick={() => openEditNote(selectedNote)} title="Edit">
                  <Icon name="edit" size={14} />
                </button>
                <button type="button" className="dock-shell-icon-btn" onClick={() => deleteNote(selectedNote.id)} title="Delete">
                  <Icon name="delete" size={14} />
                </button>
              </div>
            </div>
          </section>

          <section className="dock-console-panel dock-console-panel--workspace dock-worship-workspace">
            {selectedNoteSlides.length === 0 ? (
              <div className="dock-empty dock-worship-workspace__empty">
                <Icon name="sticky_note_2" size={18} />
                <div className="dock-empty__text">No content to display</div>
              </div>
            ) : (
              <div className="dock-console-list dock-worship-workspace__list dock-worship-slide-queue">
                {selectedNoteSlides.map((slide, idx) => {
                  const isVisible = visibleSlideIdx === idx;
                  const isSelected = selectedSlideIdx === idx;
                  return (
                    <div
                      key={slide.id}
                      className={`dock-worship-slide-card${isVisible ? " dock-worship-slide-card--visible" : ""}${isSelected && !isVisible ? " dock-worship-slide-card--selected" : ""}`}
                      title="Click to view in OBS"
                    >
                      <button type="button" className="dock-worship-slide-card__main" onClick={() => void pushNoteSlide(idx)}>
                        <div className="dock-worship-slide-card__header">
                          <div className="dock-worship-slide-card__label">
                            <span className="dock-worship-slide-card__name">{slide.label || `Slide ${idx + 1}`}</span>
                            <span className="dock-worship-slide-card__index">{idx + 1}</span>
                          </div>
                          <div className="dock-worship-slide-card__badges" />
                        </div>
                        <div className="dock-worship-slide-card__text">{slide.text}</div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="dock-console-panel dock-console-panel--deck dock-console-panel--deck-static dock-console-panel--deck-worship">
            <div className="dock-worship-toolbar">
              <DockBottomToolbar
                overlayMode={overlayMode}
                onModeChange={handleOverlayModeChange}
                clearLabel={overlayVisible ? "Hide note" : "Show note"}
                onClear={handleClear}
                sourceVisible={overlayVisible}
                collapsed={toolbarCollapsed}
                onCollapseChange={setToolbarCollapsed}
                inlineAction={
                  <button type="button" className="dock-btm-toolbar__icon-btn" onClick={() => setShowThemeSettings(true)} title="Theme Settings" aria-label="Theme Settings">
                    <Icon name="edit" size={14} />
                  </button>
                }
              />
            </div>
          </section>
        </>
      )}

      {actionError && (
        <div className="dock-console-error" style={{ padding: "8px 12px", fontSize: 11, color: "var(--error)" }}>
          {actionError}
        </div>
      )}

      <DockThemeSettingsModal
        selectedThemeId={overlayMode === "fullscreen" ? selectedFSTheme.id : selectedLTTheme.id}
        onSelect={(theme) => {
          if (overlayMode === "fullscreen") setSelectedFSTheme(theme);
          else setSelectedLTTheme(theme);
        }}
        allowedCategories={["worship", "general"]}
        isOpen={showThemeSettings}
        onClose={() => setShowThemeSettings(false)}
        overlayMode={overlayMode}
        showReferences={false}
        quickSettings={overlayMode === "fullscreen" ? (fullscreenQuickSettings ?? selectedFSTheme.settings as unknown as DockFullscreenQuickThemeSettings) : (lowerThirdQuickSettings ?? selectedLTTheme.settings as unknown as DockFullscreenQuickThemeSettings)}
        onQuickSettingsSave={(settings) => {
          if (overlayMode === "fullscreen") setFullscreenQuickSettings(settings);
          else setLowerThirdQuickSettings(settings);
        }}
        title="Note Theme"
        subtitle="Customize how notes appear"
        storageScope="notes"
      />

      {showNoteEditor && (
        <div className="dock-dialog-backdrop" role="presentation">
          <div className="dock-dialog" role="dialog" aria-modal="true" aria-labelledby="dock-note-editor-title">
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">{editingNote ? "Edit Note" : "Add Note"}</div>
                <h2 id="dock-note-editor-title" className="dock-dialog__title">
                  {editingNote ? "Edit Note" : "New Note"}
                </h2>
              </div>
              <button type="button" className="dock-dialog__close" onClick={() => { setShowNoteEditor(false); setEditingNote(null); }} aria-label="Close" title="Close">
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <label className="dock-dialog-field">
                <span className="dock-dialog-field__label">
                  <span>Title</span>
                  <span className="dock-dialog-field__tag dock-dialog-field__tag--required">Required</span>
                </span>
                <input className="dock-input" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Note title" />
              </label>
              <label className="dock-dialog-field">
                <span className="dock-dialog-field__label">
                  <span>Content</span>
                  <span className="dock-dialog-field__tag dock-dialog-field__tag--required">Required</span>
                </span>
                <textarea
                  className="dock-input dock-dialog-textarea"
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Note content. Use blank lines to separate slides."
                  rows={8}
                />
              </label>
            </div>
            <div className="dock-dialog__footer">
              <button type="button" className="dock-btn dock-btn--ghost" onClick={() => { setShowNoteEditor(false); setEditingNote(null); }} title="Cancel">Cancel</button>
              <button type="button" className="dock-btn dock-btn--primary" onClick={saveNoteDraft} disabled={!draftTitle.trim() || !draftContent.trim()} title="Save">Save</button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="dock-toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`dock-toast dock-toast--${toast.tone}`}>
              {toast.tone === "success" && <Icon name="check" size={13} />}
              {toast.tone === "error" && <Icon name="warning" size={13} />}
              {toast.tone === "info" && <Icon name="check_circle" size={13} />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
