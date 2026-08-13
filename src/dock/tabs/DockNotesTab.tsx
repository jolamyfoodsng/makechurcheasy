import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { DockStagedItem } from "../dockTypes";
import type { DockPresentationOutputTarget } from "../dockPresentationTarget";
import { isPresentationLinkTarget } from "../dockPresentationTarget";
import { dockObsClient, type DockTabContentPushData } from "../dockObsClient";
import { ensureObsConnected } from "../obsConnectionGuard";
import type { BibleTheme } from "../../bible/types";
import {
  extractStructuredTextTitle,
  parseWorshipSectionLabelLine,
} from "../../worship/slideEngine";
import type { DockFullscreenQuickThemeSettings } from "../components/DockFullscreenThemeQuickSettings";
import Icon from "../DockIcon";
import DockBottomToolbar from "../components/DockBottomToolbar";
import DockSceneRoutingControl from "../components/DockSceneRoutingControl";
import DockThemeSettingsModal from "../components/DockThemeSettingsModal";
import DockTranslationControls, {
  type DockTranslationValue,
} from "../components/DockTranslationControls";
import DockOutputQuickActions, {
  DEFAULT_DOCK_OUTPUT_QUICK_ACTIONS_TOP,
  type DockOutputQuickTextSettings,
} from "../components/DockOutputQuickActions";
import DockNotesTextTools from "../components/DockNotesTextTools";
import { getOrderedTranslationParts, normalizeDockTranslationOrder } from "../dockTranslation";
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
  formatNoteText,
  type NoteTextToolAction,
} from "../noteTextTools";
import { paginateNoteSections, splitNoteBodyIntoSections } from "../noteSlideParser";
import { normalizeDockMultilineText } from "../textLineBreaks";
import { useDockSceneRoute } from "../dockSceneRouting";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

interface Props {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  isActive?: boolean;
  presentationOutputTarget?: DockPresentationOutputTarget;
}

type OverlayMode = DockNotesOverlayMode;

const MIN_NOTE_LINES_PER_SLIDE = 1;
const MAX_NOTE_LINES_PER_SLIDE = 8;
const DEFAULT_NOTE_LINES_PER_SLIDE = 4;

function clampNoteLinesPerSlide(value?: number): number {
  if (!value || Number.isNaN(value)) return DEFAULT_NOTE_LINES_PER_SLIDE;
  return Math.min(MAX_NOTE_LINES_PER_SLIDE, Math.max(MIN_NOTE_LINES_PER_SLIDE, Math.trunc(value)));
}

function readQuickActionsLeft(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getNoteDisplayTitle(note: DockNote): string {
  return extractStructuredTextTitle(normalizeDockMultilineText(note.content)).title || note.title;
}

interface DockNoteEditorDialogProps {
  editing: boolean;
  initialTitle: string;
  initialContent: string;
  onCancel: () => void;
  onSave: (draft: { title: string; content: string }) => void;
  onFormat: (content: string, action: NoteTextToolAction, linesPerSlide?: number) => string;
}

function DockNoteEditorDialog({
  editing,
  initialTitle,
  initialContent,
  onCancel,
  onSave,
  onFormat,
}: DockNoteEditorDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);

  const handleFormat = useCallback((action: NoteTextToolAction, linesPerSlide?: number) => {
    setContent((current) => onFormat(current, action, linesPerSlide));
  }, [onFormat]);

  return (
    <div className="dock-dialog-backdrop" role="presentation">
      <div className="dock-dialog" role="dialog" aria-modal="true" aria-labelledby="dock-note-editor-title">
        <div className="dock-dialog__header">
          <div>
            <div className="dock-dialog__eyebrow">{editing ? "Edit Note" : "Add Note"}</div>
            <h2 id="dock-note-editor-title" className="dock-dialog__title">
              {editing ? "Edit Note" : "New Note"}
            </h2>
          </div>
          <button type="button" className="dock-dialog__close" onClick={onCancel} aria-label="Close" title="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="dock-dialog__body">
          <label className="dock-dialog-field">
            <span className="dock-dialog-field__label">
              <span>Title</span>
              <span className="dock-dialog-field__tag dock-dialog-field__tag--required">Required</span>
            </span>
            <input className="dock-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Note title" />
          </label>
          <DockNotesTextTools
            className="dock-notes-text-tools dock-notes-text-tools--editor"
            buttonClassName="dock-notes-text-tools__btn"
            onAction={handleFormat}
          />
          <label className="dock-dialog-field">
            <span className="dock-dialog-field__label">
              <span>Content</span>
              <span className="dock-dialog-field__tag dock-dialog-field__tag--required">Required</span>
            </span>
            <textarea
              className="dock-input dock-dialog-textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") event.stopPropagation();
              }}
              placeholder="Lines are grouped by the Lines per note setting."
              rows={8}
            />
          </label>
        </div>
        <div className="dock-dialog__footer">
          <button type="button" className="dock-btn dock-btn--ghost" onClick={onCancel} title="Cancel">Cancel</button>
          <button
            type="button"
            className="dock-btn dock-btn--primary"
            onClick={() => onSave({ title, content })}
            disabled={!title.trim() || !content.trim()}
            title="Save">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function generateNoteSlides(note: DockNote, linesPerSlide = DEFAULT_NOTE_LINES_PER_SLIDE): { id: string; label: string; text: string }[] {
  const slides: { id: string; label: string; text: string }[] = [];
  const structuredText = extractStructuredTextTitle(normalizeDockMultilineText(note.content));
  const displayTitle = structuredText.title || note.title;
  const sections = splitNoteBodyIntoSections(structuredText.body);
  if (sections.length === 0 && displayTitle) {
    slides.push({ id: `note-${note.id}-0-0`, label: "", text: displayTitle });
  } else {
    const groupedSections: Array<{ headingLabel: string; lines: string[] }> = [];

    sections.forEach((text) => {
      const lines = text.split("\n");
      const heading = parseWorshipSectionLabelLine(lines[0] ?? "");
      const sectionText = heading
        ? [heading.rest, ...lines.slice(1)].filter(Boolean).join("\n")
        : text;
      const sectionLines = sectionText.split("\n").map((line) => line.trim()).filter(Boolean);
      if (sectionLines.length === 0) return;

      if (heading) {
        groupedSections.push({ headingLabel: heading.label, lines: sectionLines });
        return;
      }

      groupedSections.push({ headingLabel: "", lines: sectionLines });
    });

    paginateNoteSections(groupedSections, clampNoteLinesPerSlide(linesPerSlide)).forEach((slide, slideIndex) => {
      slides.push({
        id: `note-${note.id}-${slideIndex}`,
        label: slide.headingLabel || (slideIndex === 0 ? displayTitle : ""),
        text: slide.text,
      });
    });
  }
  return slides;
}

function serializeNoteSlides(note: DockNote, slides: Array<{ label: string; text: string }>): string {
  const structuredText = extractStructuredTextTitle(normalizeDockMultilineText(note.content));
  const titleMarker = structuredText.title ? `[${structuredText.title}]\n\n` : "";
  const body = slides
    .map((slide) => {
      const label = slide.label.trim();
      const isDocumentTitle = label === structuredText.title || (!structuredText.title && label === note.title);
      const heading = !isDocumentTitle && parseWorshipSectionLabelLine(label) ? `${label}:` : "";
      return [heading, slide.text.trim()].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  return `${titleMarker}${body}`.trim();
}

function getNoteQuickSettings(
  overlayMode: OverlayMode,
  selectedFSTheme: BibleTheme,
  selectedLTTheme: BibleTheme,
  fullscreenQuickSettings: DockFullscreenQuickThemeSettings | null,
  lowerThirdQuickSettings: DockFullscreenQuickThemeSettings | null,
): DockOutputQuickTextSettings {
  const theme = overlayMode === "fullscreen"
    ? getDockNotesThemeForMode(selectedFSTheme, "fullscreen")
    : getDockNotesThemeForMode(selectedLTTheme, "lower-third");
  const quickSettings = overlayMode === "fullscreen" ? fullscreenQuickSettings : lowerThirdQuickSettings;
  return {
    fontSize: quickSettings?.fontSize ?? theme.settings.fontSize,
    autoFontScale: quickSettings?.autoFontScale ?? theme.settings.autoFontScale ?? false,
  };
}

type ToastTone = "info" | "success" | "error";

export default function DockNotesTab({
  onStage,
  isActive,
  presentationOutputTarget = "obs",
}: Props) {
  const presentationLinkMode = isPresentationLinkTarget(presentationOutputTarget);
  const [sceneRoute, updateSceneRoute] = useDockSceneRoute("notes");
  const hasSceneRoute = sceneRoute.enabled && Boolean(sceneRoute.sceneName);

  const pushNotesToConfiguredOutput = useCallback(async (data: DockTabContentPushData) => {
    if (!hasSceneRoute) {
      await dockObsClient.pushNotesLyrics(data);
      return;
    }
    await dockObsClient.pushNotesToScene(data, sceneRoute.sceneName);
    if (sceneRoute.syncPresentation) await dockObsClient.pushNotesLyrics(data);
  }, [hasSceneRoute, sceneRoute.sceneName, sceneRoute.syncPresentation]);

  const clearNotesFromConfiguredOutput = useCallback(async () => {
    if (!hasSceneRoute) {
      await dockObsClient.clearNotesLyrics();
      return;
    }
    await dockObsClient.clearSceneRouteSource("notes", sceneRoute.sceneName);
    if (sceneRoute.syncPresentation) await dockObsClient.clearNotesLyrics();
  }, [hasSceneRoute, sceneRoute.sceneName, sceneRoute.syncPresentation]);
  const initialPrefsRef = useRef<DockNotesPreferences | null>(null);
  if (initialPrefsRef.current === null) {
    initialPrefsRef.current = loadDockNotesPreferences();
  }
  const initialPrefs = initialPrefsRef.current;
  const initialOverlayMode: OverlayMode = initialPrefs.overlayMode === "lower-third" ? "lower-third" : "fullscreen";

  const [notes, setNotes] = useState<DockNote[]>(() => loadDockNotes());
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 220);
  const [selectedNote, setSelectedNote] = useState<DockNote | null>(null);
  const [notesTranslation, setNotesTranslation] = useState<DockTranslationValue | null>(null);
  const [noteSlidesSearchQuery, setNoteSlidesSearchQuery] = useState("");
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
  const [notesLinesPerSlide, setNotesLinesPerSlide] = useState(() => clampNoteLinesPerSlide(initialPrefs.linesPerSlide));
  const [quickActionsTop, setQuickActionsTop] = useState(() => (
    typeof initialPrefs.quickActionsTop === "number" && Number.isFinite(initialPrefs.quickActionsTop)
      ? initialPrefs.quickActionsTop
      : DEFAULT_DOCK_OUTPUT_QUICK_ACTIONS_TOP
  ));
  const [quickActionsLeft, setQuickActionsLeft] = useState<number | null>(() => readQuickActionsLeft(initialPrefs.quickActionsLeft));
  const [quickUpdateImmediately, setQuickUpdateImmediately] = useState(() => initialPrefs.quickUpdateImmediately !== false);
  const [quickSettingsRefreshNonce, setQuickSettingsRefreshNonce] = useState(0);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<DockNote | null>(null);
  const [noteSlideEditor, setNoteSlideEditor] = useState<{ index: number; label: string; text: string } | null>(null);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [toasts, setToasts] = useState<{ id: string; message: string; tone: ToastTone }[]>([]);
  const prefsReadyRef = useRef(false);
  const processedAppendCommandIdsRef = useRef<Set<string>>(new Set());
  const pendingQuickSettingsRefreshRef = useRef(false);
  const notesTranslationChangeRef = useRef(false);

  const filteredNotes = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return notes;
    const q = debouncedSearchQuery.trim().toLowerCase();
    return notes.filter((n) =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [debouncedSearchQuery, notes]);

  const selectedNoteSlides = useMemo(
    () => (selectedNote ? generateNoteSlides(selectedNote, notesLinesPerSlide) : []),
    [notesLinesPerSlide, selectedNote],
  );
  const filteredNoteSlides = useMemo(() => {
    const query = noteSlidesSearchQuery.trim().toLocaleLowerCase();
    return selectedNoteSlides
      .map((slide, idx) => ({ slide, idx }))
      .filter(({ slide }) => {
        if (!query) return true;
        return `${slide.label} ${slide.text}`.toLocaleLowerCase().includes(query);
      });
  }, [noteSlidesSearchQuery, selectedNoteSlides]);
  const selectedNoteDisplayTitle = selectedNote ? getNoteDisplayTitle(selectedNote) : "";

  useEffect(() => {
    notesTranslationChangeRef.current = false;
    setNotesTranslation(null);
    setNoteSlidesSearchQuery("");
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
    setShowNoteEditor(true);
  }, []);

  const openEditNote = useCallback((note: DockNote) => {
    setEditingNote(note);
    setShowNoteEditor(true);
  }, []);

  const formatNoteDraft = useCallback((content: string, action: NoteTextToolAction, linesPerSlide?: number) => {
    return formatNoteText(content, action, linesPerSlide);
  }, []);

  const saveNoteDraft = useCallback(({ title: draftTitle, content: draftContent }: { title: string; content: string }) => {
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title || !content) return;
    const now = Date.now();
    if (editingNote) {
      const updated: DockNote = { ...editingNote, title, content, splitOnLineBreaks: false, updatedAt: now };
      const next = notes.map((n) => (n.id === updated.id ? updated : n));
      setNotes(next);
      saveDockNotes(next);
      setSelectedNote((cur) => (cur?.id === updated.id ? updated : cur));
    } else {
      const newNote: DockNote = {
        id: crypto.randomUUID?.() ?? `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        content,
        splitOnLineBreaks: false,
        updatedAt: now,
      };
      const next = [newNote, ...notes];
      setNotes(next);
      saveDockNotes(next);
    }
    setShowNoteEditor(false);
    setEditingNote(null);
  }, [editingNote, notes]);

  const openNoteSlideEditor = useCallback((idx: number) => {
    const slide = selectedNoteSlides[idx];
    if (!slide) return;
    setNoteSlideEditor({ index: idx, label: slide.label || `Slide ${idx + 1}`, text: slide.text });
  }, [selectedNoteSlides]);

  const closeNoteSlideEditor = useCallback(() => setNoteSlideEditor(null), []);

  const saveNoteSlideEditor = useCallback(() => {
    if (!selectedNote || !noteSlideEditor || !noteSlideEditor.text.trim()) return;
    const nextSlides = selectedNoteSlides.map((slide, index) => (
      index === noteSlideEditor.index ? { ...slide, text: noteSlideEditor.text } : slide
    ));
    const updated: DockNote = {
      ...selectedNote,
      content: serializeNoteSlides(selectedNote, nextSlides),
      splitOnLineBreaks: false,
      updatedAt: Date.now(),
    };
    const nextNotes = notes.map((note) => note.id === updated.id ? updated : note);
    setNotes(nextNotes);
    saveDockNotes(nextNotes);
    setSelectedNote(updated);
    setNoteSlideEditor(null);
    showToast("Slide updated", "success");
  }, [noteSlideEditor, notes, selectedNote, selectedNoteSlides, showToast]);

  const deleteNoteSlide = useCallback((idx: number) => {
    if (!selectedNote || selectedNoteSlides.length <= 1) return;
    const nextSlides = selectedNoteSlides.filter((_, index) => index !== idx);
    const updated: DockNote = {
      ...selectedNote,
      content: serializeNoteSlides(selectedNote, nextSlides),
      updatedAt: Date.now(),
    };
    const nextNotes = notes.map((note) => note.id === updated.id ? updated : note);
    setNotes(nextNotes);
    saveDockNotes(nextNotes);
    setSelectedNote(updated);
    setSelectedSlideIdx((current) => current === null ? null : Math.min(current > idx ? current - 1 : current, nextSlides.length - 1));
    setVisibleSlideIdx((current) => current === null ? null : Math.min(current > idx ? current - 1 : current, nextSlides.length - 1));
    setNotesTranslation(null);
    showToast("Slide deleted", "info");
  }, [notes, selectedNote, selectedNoteSlides, showToast]);

  const buildNoteObsPayload = useCallback(
    (idx: number) => {
      if (!selectedNote) return null;
      const slide = selectedNoteSlides[idx];
      if (!slide) return null;
      const selectedTheme = overlayMode === "fullscreen" ? selectedFSTheme : selectedLTTheme;
      const theme = getDockNotesThemeForMode(selectedTheme, overlayMode);
      const quickSettings = overlayMode === "fullscreen" ? fullscreenQuickSettings : lowerThirdQuickSettings;
      const themeSettings = quickSettings ?? theme.settings;
      const slideText = normalizeDockMultilineText(slide.text);
      const translatedText = normalizeDockMultilineText(notesTranslation?.translatedSections[slide.id] ?? "").trim();
      const showBoth = Boolean(notesTranslation?.showBoth && translatedText);
      const sectionText = showBoth ? slideText : (translatedText || slideText);
      const translationText = showBoth ? translatedText : "";
      return {
        stageItem: {
          type: "notes" as const,
          label: slide.label || selectedNoteDisplayTitle,
          subtitle: selectedNoteDisplayTitle,
          data: {
            sectionText,
            translationText,
            translationOrder: normalizeDockTranslationOrder(notesTranslation?.translationOrder),
            sectionLabel: slide.label,
            note: selectedNote,
            slideIdx: idx,
            overlayMode,
            theme: theme.id,
          },
        },
        obsData: {
          sectionText,
          translationText,
          translationOrder: normalizeDockTranslationOrder(notesTranslation?.translationOrder),
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

      if (presentationLinkMode) {
        setOverlayVisible(true);
        return;
      }

      const pushLive = () => hasSceneRoute
        ? pushNotesToConfiguredOutput(payload.obsData)
        : payload.obsData.overlayMode === "lower-third"
          ? dockObsClient.pushNotesOverlayFast(payload.obsData)
          : pushNotesToConfiguredOutput(payload.obsData);
      pushLive()
        .then(() => {
          setOverlayVisible(true);
        })
        .catch((err) => {
          console.warn("[DockNotesTab] OBS push failed:", err);
          setActionError(err instanceof Error ? err.message : String(err));
        });
    },
    [buildNoteObsPayload, hasSceneRoute, onStage, presentationLinkMode, pushNotesToConfiguredOutput],
  );

  const activeNoteQuickSettings = useMemo(
    () => getNoteQuickSettings(
      overlayMode,
      selectedFSTheme,
      selectedLTTheme,
      fullscreenQuickSettings,
      lowerThirdQuickSettings,
    ),
    [fullscreenQuickSettings, lowerThirdQuickSettings, overlayMode, selectedFSTheme, selectedLTTheme],
  );

  const handleNotesQuickCommit = useCallback((patch: Partial<DockOutputQuickTextSettings>, nextLineCount?: number) => {
    const fullscreenBase = fullscreenQuickSettings
      ?? (getDockNotesThemeForMode(selectedFSTheme, "fullscreen").settings as unknown as DockFullscreenQuickThemeSettings);
    const lowerThirdBase = lowerThirdQuickSettings
      ?? (getDockNotesThemeForMode(selectedLTTheme, "lower-third").settings as unknown as DockFullscreenQuickThemeSettings);
    setFullscreenQuickSettings({ ...fullscreenBase, ...patch });
    setLowerThirdQuickSettings({ ...lowerThirdBase, ...patch });
    if (nextLineCount !== undefined) {
      setNotesLinesPerSlide(clampNoteLinesPerSlide(nextLineCount));
      setSelectedSlideIdx(0);
      setVisibleSlideIdx(null);
    }
    pendingQuickSettingsRefreshRef.current = true;
    setQuickSettingsRefreshNonce((current) => current + 1);
  }, [fullscreenQuickSettings, lowerThirdQuickSettings, selectedFSTheme, selectedLTTheme]);

  const handleNotesQuickActionsPositionChange = useCallback((top: number, left: number | null) => {
    setQuickActionsTop(top);
    setQuickActionsLeft(left);
  }, []);

  useEffect(() => {
    if (!pendingQuickSettingsRefreshRef.current || activeSlideIndex === null) return;
    pendingQuickSettingsRefreshRef.current = false;
    // The nonce waits for the new settings and note slide layout to render before
    // pushing the current note to the configured output.
    pushNoteSlide(activeSlideIndex);
  }, [activeSlideIndex, pushNoteSlide, quickSettingsRefreshNonce]);

  useEffect(() => {
    if (!notesTranslationChangeRef.current) return;
    notesTranslationChangeRef.current = false;
    if (activeSlideIndex === null || !overlayVisible || visibleSlideIdx === null) return;
    pushNoteSlide(activeSlideIndex);
  }, [activeSlideIndex, notesTranslation, overlayVisible, pushNoteSlide, visibleSlideIdx]);

  const handleClear = useCallback(async () => {
    setActionError("");
    try {
      if (presentationLinkMode) {
        setOverlayVisible((visible) => !visible);
        return;
      }
      await ensureObsConnected();
      if (overlayVisible) {
        await clearNotesFromConfiguredOutput();
        setOverlayVisible(false);
      } else if (activeSlideIndex !== null) {
        await pushNoteSlide(activeSlideIndex);
      }
    } catch (err) {
      console.warn("[DockNotesTab] Toggle failed:", err);
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }, [overlayVisible, activeSlideIndex, clearNotesFromConfiguredOutput, presentationLinkMode, pushNoteSlide]);

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
    prefs.linesPerSlide = notesLinesPerSlide;
    prefs.quickActionsTop = quickActionsTop;
    prefs.quickActionsLeft = quickActionsLeft;
    prefs.quickUpdateImmediately = quickUpdateImmediately;
    saveDockNotesPreferences(prefs);
  }, [fullscreenQuickSettings, lowerThirdQuickSettings, notesLinesPerSlide, quickActionsLeft, quickActionsTop, quickUpdateImmediately]);

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
          if (!presentationLinkMode) {
            ensureObsConnected().then(() => clearNotesFromConfiguredOutput()).catch(() => { });
          }
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
  }, [isActive, showNoteEditor, selectedNote, selectedNoteSlides, activeSlideIndex, clearNotesFromConfiguredOutput, onStage, presentationLinkMode, pushNoteSlide]);

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
                <DockSceneRoutingControl
                  module="notes"
                  route={sceneRoute}
                  onRouteChange={updateSceneRoute}
                  disabled={presentationLinkMode}
                  title="Note output"
                />
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
                        setNoteSlidesSearchQuery("");
                      }}
                      title={note.title}
                    >
                      <span className="dock-card__title">{getNoteDisplayTitle(note)}</span>
                      <span className="dock-card__subtitle">
                        {extractStructuredTextTitle(normalizeDockMultilineText(note.content)).body.split("\n")[0]?.substring(0, 80) || "No content"}
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
                  <div className="dock-worship-summary__meta">
                    <span>{selectedNoteSlides.length} {selectedNoteSlides.length === 1 ? "slide" : "slides"}</span>
                    <span className="dock-worship-summary__meta-dot">·</span>
                    <span>{notesLinesPerSlide} {notesLinesPerSlide === 1 ? "line per note" : "lines per note"}</span>
                  </div>
                </div>
              </div>
              <div className="dock-worship-summary__actions">
                <DockTranslationControls
                  compact
                  sections={selectedNoteSlides.map((slide) => ({ id: slide.id, text: slide.text }))}
                  value={notesTranslation}
                  onChange={(next) => {
                    notesTranslationChangeRef.current = true;
                    setNotesTranslation(next);
                  }}
                />
                <button type="button" className="dock-shell-icon-btn" onClick={() => openEditNote(selectedNote)} title="Edit note" aria-label="Edit note">
                  <Icon name="edit" size={16} />
                </button>
              </div>
            </div>
          </section>

          <section className="dock-console-panel dock-console-panel--toolbar dock-worship-lyrics-search">
            <div className="dock-media-search dock-media-search--plain">
              <input
                className="dock-media-search__input"
                placeholder="Search note slides..."
                value={noteSlidesSearchQuery}
                onChange={(event) => setNoteSlidesSearchQuery(event.target.value)}
                aria-label="Search note slides"
              />
              {noteSlidesSearchQuery && (
                <button
                  type="button"
                  className="dock-media-search__clear"
                  onClick={() => setNoteSlidesSearchQuery("")}
                  aria-label="Clear"
                  title="Clear"
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          </section>

          <section className="dock-console-panel dock-console-panel--workspace dock-worship-workspace" data-toolbar-collapsed={toolbarCollapsed || undefined}>
            {selectedNoteSlides.length === 0 ? (
              <div className="dock-empty dock-worship-workspace__empty">
                <Icon name="sticky_note_2" size={18} />
                <div className="dock-empty__text">No content to display</div>
              </div>
            ) : filteredNoteSlides.length === 0 ? (
              <div className="dock-empty dock-worship-workspace__empty">
                <Icon name="search_off" size={18} />
                <div className="dock-empty__text">No note slides match “{noteSlidesSearchQuery}”</div>
              </div>
            ) : (
              <div className="dock-console-list dock-worship-workspace__list dock-worship-slide-queue">
                {filteredNoteSlides.map(({ slide, idx }) => {
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
                        {getOrderedTranslationParts(
                          slide.text,
                          normalizeDockMultilineText(notesTranslation?.translatedSections[slide.id] ?? ""),
                          notesTranslation?.showBoth ?? false,
                          notesTranslation?.translationOrder,
                        ).map((part, partIndex) => (
                          <div
                            key={`${slide.id}-${part.kind}-${partIndex}`}
                            className={part.kind === "translation"
                              ? `dock-worship-slide-card__translation${partIndex === 0 ? " dock-worship-slide-card__translation--first" : ""}`
                              : "dock-worship-slide-card__text"}
                          >
                            {normalizeDockMultilineText(part.text)}
                          </div>
                        ))}
                      </button>
                      <div className="dock-worship-slide-card__actions">
                        <button
                          type="button"
                          className="dock-worship-slide-card__action"
                          onClick={(event) => {
                            event.stopPropagation();
                            openNoteSlideEditor(idx);
                          }}
                          title="Quick edit slide"
                          aria-label="Quick edit slide"
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          type="button"
                          className="dock-worship-slide-card__action dock-worship-slide-card__action--danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteNoteSlide(idx);
                          }}
                          title="Delete slide"
                          aria-label="Delete slide"
                          disabled={selectedNoteSlides.length <= 1}
                        >
                          <Icon name="delete" size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <DockOutputQuickActions
              textLabel="Note text"
              lineLabel="Lines per note"
              settings={activeNoteQuickSettings}
              lineCount={notesLinesPerSlide}
              maxLineCount={MAX_NOTE_LINES_PER_SLIDE}
              minFontSize={overlayMode === "fullscreen" ? 28 : 14}
              maxFontSize={overlayMode === "fullscreen" ? 180 : 100}
              updateImmediately={quickUpdateImmediately}
              top={quickActionsTop}
              left={quickActionsLeft}
              onPositionChange={handleNotesQuickActionsPositionChange}
              onCommit={handleNotesQuickCommit}
              onUpdateImmediatelyChange={setQuickUpdateImmediately}
            />
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
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <DockSceneRoutingControl
                      module="notes"
                      route={sceneRoute}
                      onRouteChange={updateSceneRoute}
                      disabled={presentationLinkMode}
                      title="Note output"
                      placement="above"
                    />
                    <button type="button" className="dock-btm-toolbar__icon-btn" onClick={() => setShowThemeSettings(true)} title="Theme Settings" aria-label="Theme Settings">
                      <Icon name="edit" size={14} />
                    </button>
                  </div>
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
        <DockNoteEditorDialog
          key={editingNote?.id ?? "new-note"}
          editing={Boolean(editingNote)}
          initialTitle={editingNote?.title ?? ""}
          initialContent={editingNote?.content ?? ""}
          onCancel={() => {
            setShowNoteEditor(false);
            setEditingNote(null);
          }}
          onSave={saveNoteDraft}
          onFormat={formatNoteDraft}
        />
      )}

      {noteSlideEditor && (
        <div className="dock-dialog-backdrop" role="presentation">
          <div className="dock-dialog dock-dialog--compact" role="dialog" aria-modal="true" aria-labelledby="dock-note-slide-editor-title">
            <div className="dock-dialog__header">
              <div>
                <div className="dock-dialog__eyebrow">Quick edit</div>
                <h2 id="dock-note-slide-editor-title" className="dock-dialog__title">{noteSlideEditor.label}</h2>
              </div>
              <button type="button" className="dock-dialog__close" onClick={closeNoteSlideEditor} aria-label="Close" title="Close">
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-dialog__body">
              <DockNotesTextTools
                className="dock-notes-text-tools dock-notes-text-tools--editor"
                buttonClassName="dock-notes-text-tools__btn"
                onAction={(action, linesPerSlide) => {
                  setNoteSlideEditor((current) => current
                    ? { ...current, text: formatNoteText(current.text, action, linesPerSlide) }
                    : current);
                }}
              />
              <label className="dock-dialog-field">
                <span>Slide text</span>
                <textarea
                  className="dock-input dock-dialog-textarea dock-dialog-textarea--short"
                  value={noteSlideEditor.text}
                  onChange={(event) => setNoteSlideEditor((current) => current ? { ...current, text: event.target.value } : current)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                  }}
                />
              </label>
            </div>
            <div className="dock-dialog__footer">
              <button type="button" className="dock-btn dock-btn--ghost" onClick={closeNoteSlideEditor} title="Cancel">Cancel</button>
              <button type="button" className="dock-btn dock-btn--primary" onClick={saveNoteSlideEditor} disabled={!noteSlideEditor.text.trim()} title="Save">Save</button>
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
