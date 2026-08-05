import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { DockStagedItem } from "../dockTypes";
import { dockObsClient } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import type { BibleTheme } from "../../bible/types";
import {
  extractStructuredTextTitle,
  parseWorshipSectionLabelLine,
} from "../../worship/slideEngine";
import type { DockFullscreenQuickThemeSettings } from "../components/DockFullscreenThemeQuickSettings";
import Icon from "../DockIcon";
import DockBottomToolbar from "../components/DockBottomToolbar";
import DockThemeSettingsModal from "../components/DockThemeSettingsModal";
import DockTranslationControls, {
  type DockTranslationValue,
} from "../components/DockTranslationControls";
import {
  DOCK_NOTES_KEY,
  DOCK_NOTES_BROADCAST_CHANNEL,
  DOCK_NOTES_UPDATED_EVENT,
  appendTextToDockNotes,
  getDockNotesThemeForMode,
  getFallbackDockNotesTheme,
  loadDockNotes,
  loadDockNotesFromDockData,
  loadDockNotesPreferences,
  resolveDockNotesTheme,
  saveDockNotes,
  saveDockNotesPreferences,
  type DockNote,
  type DockNotesPreferences,
  type DockNotesOverlayMode,
} from "../dockNotesStorage";
import { getUserScopedKey } from "../../services/userScopedStorage";
import {
  loadDockNotesAppendCommands,
  type DockNotesAppendCommand,
} from "../../services/dockNotesInterop";
import { getRecommendedPollingInterval } from "../../services/performanceManager";
import { dockClient } from "../../services/dockBridge";
import {
  NOTE_TEXT_TOOL_BUTTONS,
  formatNoteText,
  type NoteTextToolAction,
} from "../noteTextTools";

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  isActive?: boolean;
}

type OverlayMode = DockNotesOverlayMode;

function getNoteDisplayTitle(note: DockNote): string {
  return extractStructuredTextTitle(note.content).title || note.title;
}

function getTranslatedNoteText(
  text: string,
  sectionId: string,
  translation: DockTranslationValue | null,
): string {
  const translated = translation?.translatedSections[sectionId]?.trim();
  if (!translation || !translated) return text;
  return translation.showBoth ? `${text}\n\n${translated}` : translated;
}

function generateNoteSlides(note: DockNote): { id: string; label: string; text: string }[] {
  const slides: { id: string; label: string; text: string }[] = [];
  const structuredText = extractStructuredTextTitle(note.content);
  const displayTitle = structuredText.title || note.title;
  const sections = structuredText.body.split(/\n\n+/).map((section) => section.trim()).filter(Boolean);
  if (sections.length === 0 && displayTitle) {
    slides.push({ id: crypto.randomUUID?.() ?? `s-${Date.now()}`, label: "", text: displayTitle });
  } else {
    sections.forEach((text, i) => {
      const lines = text.split("\n");
      const heading = parseWorshipSectionLabelLine(lines[0] ?? "");
      const slideText = heading
        ? [heading.rest, ...lines.slice(1)].filter(Boolean).join("\n")
        : text;
      slides.push({
        id: crypto.randomUUID?.() ?? `s-${Date.now()}-${i}`,
        label: heading?.label || (i === 0 ? displayTitle : ""),
        text: slideText,
      });
    });
  }
  return slides;
}

type ToastTone = "info" | "success" | "error";

function DockNotesTextTools({
  className,
  buttonClassName,
  onAction,
}: {
  className: string;
  buttonClassName: string;
  onAction: (action: NoteTextToolAction, linesPerSlide?: number) => void;
}) {
  const [autoSplitOpen, setAutoSplitOpen] = useState(false);
  const autoSplitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoSplitOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!autoSplitRef.current?.contains(event.target as Node)) setAutoSplitOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [autoSplitOpen]);

  return (
    <div className={className} role="toolbar" aria-label="Note text tools" onClick={(event) => event.stopPropagation()}>
      {NOTE_TEXT_TOOL_BUTTONS.map((tool) => {
        if (tool.action === "autosplit") {
          return (
            <div key={tool.action} className="dock-notes-text-tools__autosplit" ref={autoSplitRef}>
              <button
                type="button"
                className={`${buttonClassName} dock-notes-text-tools__btn--accent${autoSplitOpen ? " dock-notes-text-tools__btn--active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setAutoSplitOpen((open) => !open);
                }}
                title={tool.title}
                aria-label={tool.title}
                aria-haspopup="menu"
                aria-expanded={autoSplitOpen}
              >
                <Icon name={tool.icon ?? "format_align_left"} size={12} />
                <span className="dock-lyrics-toolbar__caret">▾</span>
              </button>
              {autoSplitOpen && (
                <div className="dock-notes-text-tools__menu" role="menu" aria-label="Auto split options">
                  {[2, 3, 4].map((lines) => (
                    <button
                      key={lines}
                      type="button"
                      className="dock-notes-text-tools__menu-option"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAction("autosplit", lines);
                        setAutoSplitOpen(false);
                      }}
                    >
                      {lines} lines
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <button
            key={tool.action}
            type="button"
            className={buttonClassName}
            onClick={(event) => {
              event.stopPropagation();
              onAction(tool.action);
            }}
            title={tool.title}
            aria-label={tool.title}
          >
            {tool.icon ? <Icon name={tool.icon} size={12} /> : <span>{tool.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function DockNotesTab({ onStage, isActive }: Props) {
  const initialPrefsRef = useRef<DockNotesPreferences | null>(null);
  if (initialPrefsRef.current === null) {
    initialPrefsRef.current = loadDockNotesPreferences();
  }
  const initialPrefs = initialPrefsRef.current;
  const initialOverlayMode: OverlayMode = initialPrefs.overlayMode === "lower-third" ? "lower-third" : "fullscreen";

  const [notes, setNotes] = useState<DockNote[]>(() => loadDockNotes());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<DockNote | null>(null);
  const [notesTranslation, setNotesTranslation] = useState<DockTranslationValue | null>(null);
  const [selectedSlideIdx, setSelectedSlideIdx] = useState<number | null>(null);
  const [visibleSlideIdx, setVisibleSlideIdx] = useState<number | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(initialOverlayMode);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [selectedFSTheme, setSelectedFSTheme] = useState<BibleTheme>(() =>
    getFallbackDockNotesTheme("fullscreen", initialPrefs.fullscreenThemeId),
  );
  const [selectedLTTheme, setSelectedLTTheme] = useState<BibleTheme>(() =>
    getFallbackDockNotesTheme("lower-third", initialPrefs.lowerThirdThemeId),
  );
  const [fullscreenQuickSettings, setFullscreenQuickSettings] = useState<DockFullscreenQuickThemeSettings | null>(() => initialPrefs.fullscreenQuickSettings ?? null);
  const [lowerThirdQuickSettings, setLowerThirdQuickSettings] = useState<DockFullscreenQuickThemeSettings | null>(() => initialPrefs.lowerThirdQuickSettings ?? null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<DockNote | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [toasts, setToasts] = useState<{ id: string; message: string; tone: ToastTone }[]>([]);
  const prefsReadyRef = useRef(false);
  const processedAppendCommandIdsRef = useRef<Set<string>>(new Set());

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
  const selectedNoteDisplayTitle = selectedNote ? getNoteDisplayTitle(selectedNote) : "";

  useEffect(() => {
    setNotesTranslation(null);
  }, [selectedNote?.id]);

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

  const refreshNotes = useCallback((incomingNotes?: DockNote[]) => {
    const localNotes = loadDockNotes();
    const next = Array.isArray(incomingNotes)
      ? (incomingNotes.length > 0 || localNotes.length === 0 ? incomingNotes : localNotes)
      : localNotes;
    setNotes(next);
    setSelectedNote((current) => {
      if (!current) return current;
      return next.find((note) => note.id === current.id) ?? null;
    });
  }, []);

  const applyAppendCommand = useCallback((command: DockNotesAppendCommand) => {
    const commandId = command.commandId.trim();
    if (!commandId || processedAppendCommandIdsRef.current.has(commandId)) return;
    processedAppendCommandIdsRef.current.add(commandId);

    const result = appendTextToDockNotes(command.text, command.title, { sourceId: commandId });
    if (result) refreshNotes(result.notes);
  }, [refreshNotes]);

  useEffect(() => {
    let cancelled = false;
    const prefs = initialPrefsRef.current ?? loadDockNotesPreferences();

    Promise.all([
      resolveDockNotesTheme("fullscreen", prefs),
      resolveDockNotesTheme("lower-third", prefs),
    ])
      .then(([fullscreenTheme, lowerThirdTheme]) => {
        if (cancelled) return;
        setSelectedFSTheme(fullscreenTheme);
        setSelectedLTTheme(lowerThirdTheme);
      })
      .catch(() => {
        // Keep the built-in fallback theme.
      })
      .finally(() => {
        if (!cancelled) prefsReadyRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === getUserScopedKey(DOCK_NOTES_KEY)) refreshNotes();
    };
    const handleNotesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ notes?: DockNote[] }>).detail;
      refreshNotes(detail?.notes);
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(DOCK_NOTES_BROADCAST_CHANNEL);
      bc.onmessage = (event: MessageEvent<{ type?: string; notes?: DockNote[] }>) => {
        if (event.data?.type === "notes-updated") refreshNotes(event.data.notes);
      };
    } catch {
      bc = null;
    }

    window.addEventListener(DOCK_NOTES_UPDATED_EVENT, handleNotesUpdated);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(DOCK_NOTES_UPDATED_EVENT, handleNotesUpdated);
      window.removeEventListener("storage", handleStorage);
      bc?.close();
    };
  }, [refreshNotes]);

  useEffect(() => {
    if (isActive) refreshNotes();
  }, [isActive, refreshNotes]);

  useEffect(() => {
    if (!isActive) return;
    let disposed = false;
    dockClient.sendCommand({ type: "request-library-data", timestamp: Date.now() });

    const fallbackTimer = window.setTimeout(() => {
      void loadDockNotesFromDockData().then((remoteNotes) => {
        if (!disposed && remoteNotes.length > 0) refreshNotes(remoteNotes);
      });
    }, 300);

    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [isActive, refreshNotes]);

  useEffect(() => {
    const unsubscribe = dockClient.onState((msg) => {
      if (msg.type !== "state:notes-updated") return;
      const payload = msg.payload as { notes?: DockNote[] } | null;
      refreshNotes(payload?.notes);
    });
    return unsubscribe;
  }, [refreshNotes]);

  useEffect(() => {
    if (!isActive) return;

    let disposed = false;
    let inFlight = false;

    const pollAppendCommands = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const commands = await loadDockNotesAppendCommands();
        if (disposed || commands.length === 0) return;
        commands.forEach(applyAppendCommand);
      } catch {
        // The overlay relay is a fallback; local storage/broadcast still work.
      } finally {
        inFlight = false;
      }
    };

    void pollAppendCommands();
    const timer = window.setInterval(
      () => void pollAppendCommands(),
      getRecommendedPollingInterval(750),
    );

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [applyAppendCommand, isActive]);

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

  const applyDraftTextTool = useCallback((action: NoteTextToolAction, linesPerSlide?: number) => {
    setDraftContent((current) => formatNoteText(current, action, linesPerSlide));
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
      saveDockNotes(next);
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
      saveDockNotes(next);
    }
    setShowNoteEditor(false);
    setEditingNote(null);
  }, [draftTitle, draftContent, editingNote, notes]);

  const deleteNote = useCallback((id: string) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    saveDockNotes(next);
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
      const selectedTheme = overlayMode === "fullscreen" ? selectedFSTheme : selectedLTTheme;
      const theme = getDockNotesThemeForMode(selectedTheme, overlayMode);
      const quickSettings = overlayMode === "fullscreen" ? fullscreenQuickSettings : lowerThirdQuickSettings;
      const themeSettings = quickSettings ?? theme.settings;
      const sectionText = getTranslatedNoteText(slide.text, slide.id, notesTranslation);
      return {
        stageItem: {
          type: "notes" as const,
          label: slide.label || selectedNoteDisplayTitle,
          subtitle: selectedNoteDisplayTitle,
          data: { sectionText, sectionLabel: slide.label, note: selectedNote, slideIdx: idx, overlayMode, theme: theme.id },
        },
        obsData: {
          sectionText,
          sectionLabel: slide.label || selectedNoteDisplayTitle,
          songTitle: selectedNoteDisplayTitle,
          overlayMode,
          bibleThemeSettings: themeSettings as unknown as Record<string, unknown>,
          liveOverrides: null,
          backgroundOnly: false,
        },
      };
    },
    [selectedNote, selectedNoteDisplayTitle, selectedNoteSlides, notesTranslation, overlayMode, selectedFSTheme, selectedLTTheme, fullscreenQuickSettings, lowerThirdQuickSettings],
  );

  const pushNoteSlide = useCallback(
    (idx: number) => {
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

  const handleOverlayModeChange = useCallback((nextMode: OverlayMode) => {
    if (nextMode === overlayMode) return;

    setOverlayMode(nextMode);
    const prefs = loadDockNotesPreferences();
    prefs.overlayMode = nextMode;
    saveDockNotesPreferences(prefs);
  }, [overlayMode]);

  // Persist theme preferences on change
  useEffect(() => {
    if (!prefsReadyRef.current) return;
    const prefs = loadDockNotesPreferences();
    prefs.fullscreenThemeId = selectedFSTheme.id;
    prefs.lowerThirdThemeId = selectedLTTheme.id;
    saveDockNotesPreferences(prefs);
  }, [selectedFSTheme.id, selectedLTTheme.id]);

  // Persist quick settings on change
  useEffect(() => {
    const prefs = loadDockNotesPreferences();
    prefs.fullscreenQuickSettings = fullscreenQuickSettings;
    prefs.lowerThirdQuickSettings = lowerThirdQuickSettings;
    saveDockNotesPreferences(prefs);
  }, [fullscreenQuickSettings, lowerThirdQuickSettings]);

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
                {/* <div className="dock-console-header__eyebrow">Search Notes</div> */}
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
                  <div key={note.id} className="dock-card dock-card--console dock-song-card dock-notes-card">
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
                      <span className="dock-card__title">{getNoteDisplayTitle(note)}</span>
                      <span className="dock-card__subtitle">
                        {extractStructuredTextTitle(note.content).body.split("\n")[0]?.substring(0, 80) || "No content"}
                      </span>
                    </button>
                    <button type="button" className="dock-song-card__edit" onClick={() => openEditNote(note)} aria-label="Edit" title="Edit">
                      <Icon name="edit" size={12} />
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
                  <div className="dock-worship-summary__title">{selectedNoteDisplayTitle}</div>
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

            <DockTranslationControls
              sections={selectedNoteSlides.map((slide) => ({ id: slide.id, text: slide.text }))}
              value={notesTranslation}
              onChange={setNotesTranslation}
            />
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
                        {notesTranslation?.translatedSections[slide.id] && notesTranslation.showBoth ? (
                          <>
                            <div className="dock-worship-slide-card__text">{slide.text}</div>
                            <div className="dock-worship-slide-card__translation">
                              {notesTranslation.translatedSections[slide.id]}
                            </div>
                          </>
                        ) : (
                          <div className="dock-worship-slide-card__text">
                            {getTranslatedNoteText(slide.text, slide.id, notesTranslation)}
                          </div>
                        )}
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
        quickSettings={overlayMode === "fullscreen"
          ? (fullscreenQuickSettings ?? getDockNotesThemeForMode(selectedFSTheme, "fullscreen").settings as unknown as DockFullscreenQuickThemeSettings)
          : (lowerThirdQuickSettings ?? getDockNotesThemeForMode(selectedLTTheme, "lower-third").settings as unknown as DockFullscreenQuickThemeSettings)}
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
              <DockNotesTextTools
                className="dock-notes-text-tools dock-notes-text-tools--editor"
                buttonClassName="dock-notes-text-tools__btn"
                onAction={applyDraftTextTool}
              />
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
