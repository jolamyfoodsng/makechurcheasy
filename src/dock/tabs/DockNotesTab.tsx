import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import DockAutoAdvanceControl from "../components/DockAutoAdvanceControl";
import DockOutputQuickActions, {
  DEFAULT_DOCK_OUTPUT_QUICK_ACTIONS_TOP,
  type DockOutputQuickTextSettings,
} from "../components/DockOutputQuickActions";
import DockNotesTextTools from "../components/DockNotesTextTools";
import DockSpellcheckTextarea from "../components/DockSpellcheckTextarea";
import {
  getDockTranslationSourceSignature,
  getOrderedTranslationParts,
  normalizeDockTranslationOrder,
} from "../dockTranslation";
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
  const { t } = useTranslation();
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
            <div className="dock-dialog__eyebrow">{editing ? t("notes.editNote") : t("notes.addNote")}</div>
            <h2 id="dock-note-editor-title" className="dock-dialog__title">
              {editing ? t("notes.editNote") : t("notes.newNote")}
            </h2>
          </div>
          <button type="button" className="dock-dialog__close" onClick={onCancel} aria-label={t("common.close")} title={t("common.close")}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="dock-dialog__body">
          <label className="dock-dialog-field">
            <span className="dock-dialog-field__label">
              <span>{t("common.title")}</span>
              <span className="dock-dialog-field__tag dock-dialog-field__tag--required">{t("common.required")}</span>
            </span>
            <input className="dock-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("notes.noteTitlePlaceholder")} />
          </label>
          <DockNotesTextTools
            className="dock-notes-text-tools dock-notes-text-tools--editor"
            buttonClassName="dock-notes-text-tools__btn"
            onAction={handleFormat}
          />
          <div className="dock-dialog-field">
            <label className="dock-dialog-field__label" htmlFor="dock-note-content">
              <span>{t("notes.content")}</span>
              <span className="dock-dialog-field__tag dock-dialog-field__tag--required">{t("common.required")}</span>
            </label>
            <DockSpellcheckTextarea
              id="dock-note-content"
              className="dock-input dock-dialog-textarea"
              value={content}
              onChange={setContent}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") event.stopPropagation();
              }}
              placeholder={t("notes.contentPlaceholder")}
              rows={8}
            />
          </div>
        </div>
        <div className="dock-dialog__footer">
          <button type="button" className="dock-btn dock-btn--ghost" onClick={onCancel} title={t("common.cancel")}>{t("common.cancel")}</button>
          <button
            type="button"
            className="dock-btn dock-btn--primary"
            onClick={() => onSave({ title, content })}
            disabled={!title.trim() || !content.trim()}
            title={t("common.save")}>
            {t("common.save")}
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

const DOCK_NOTES_TRANSLATIONS_KEY = "ocs-dock-notes-translations-v1";
type StoredDockNoteTranslations = Record<string, DockTranslationValue>;

function isStoredDockTranslation(value: unknown): value is DockTranslationValue {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DockTranslationValue>;
  const translatedSections = candidate.translatedSections as Record<string, unknown> | undefined;
  return typeof candidate.targetLanguage === "string"
    && typeof candidate.targetLanguageLabel === "string"
    && typeof translatedSections === "object"
    && translatedSections !== null
    && Object.values(translatedSections).every((text) => typeof text === "string")
    && typeof candidate.showBoth === "boolean"
    && (candidate.translationOrder === "original-first" || candidate.translationOrder === "translation-first");
}

function loadDockNoteTranslations(): StoredDockNoteTranslations {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(getUserScopedKey(DOCK_NOTES_TRANSLATIONS_KEY));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => isStoredDockTranslation(value)),
    ) as StoredDockNoteTranslations;
  } catch {
    return {};
  }
}

function saveDockNoteTranslation(noteId: string, translation: DockTranslationValue | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    const stored = loadDockNoteTranslations();
    if (translation) stored[noteId] = translation;
    else delete stored[noteId];
    localStorage.setItem(getUserScopedKey(DOCK_NOTES_TRANSLATIONS_KEY), JSON.stringify(stored));
  } catch {
    // Ignore storage failures in embedded browser contexts.
  }
}

export default function DockNotesTab({
  onStage,
  isActive,
  presentationOutputTarget = "obs",
}: Props) {
  const { t } = useTranslation();
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
  const [autoAdvanceActive, setAutoAdvanceActive] = useState(false);
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
  const notesTranslationSourceSignature = useMemo(
    () => getDockTranslationSourceSignature(selectedNoteSlides),
    [selectedNoteSlides],
  );
  const effectiveNotesTranslation = useMemo(
    () => notesTranslation?.sourceSignature === notesTranslationSourceSignature ? notesTranslation : null,
    [notesTranslation, notesTranslationSourceSignature],
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

  const selectedNoteAutoAdvanceIndex = useMemo(
    () => (selectedNote ? 0 : -1),
    [selectedNote],
  );

  const handleAutoAdvanceNoteSelection = useCallback((_index: number) => {
    // Auto-advance is scoped to the opened note. It must never select from
    // the notes list.
  }, []);

  useEffect(() => {
    notesTranslationChangeRef.current = false;
    const stored = selectedNote ? loadDockNoteTranslations()[selectedNote.id] : null;
    const nextTranslation = stored?.sourceSignature === notesTranslationSourceSignature ? stored : null;
    if (selectedNote && stored && !nextTranslation) saveDockNoteTranslation(selectedNote.id, null);
    setNotesTranslation(nextTranslation);
    setNoteSlidesSearchQuery("");
  }, [notesTranslationSourceSignature, selectedNote?.id]);

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
    setNoteSlideEditor({ index: idx, label: slide.label || `${t("notes.slideLabel")} ${idx + 1}`, text: slide.text });
  }, [selectedNoteSlides, t]);

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
    showToast(t("notes.slideUpdated"), "success");
  }, [noteSlideEditor, notes, selectedNote, selectedNoteSlides, showToast, t]);

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
    saveDockNoteTranslation(selectedNote.id, null);
    showToast(t("notes.slideDeleted"), "info");
  }, [notes, selectedNote, selectedNoteSlides, showToast, t]);

  const handleNotesTranslationChange = useCallback((next: DockTranslationValue | null) => {
    notesTranslationChangeRef.current = true;
    setNotesTranslation(next);
    if (selectedNote?.id) {
      saveDockNoteTranslation(
        selectedNote.id,
        next?.sourceSignature === notesTranslationSourceSignature ? next : null,
      );
    }
  }, [notesTranslationSourceSignature, selectedNote?.id]);

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
      const translatedText = normalizeDockMultilineText(effectiveNotesTranslation?.translatedSections[slide.id] ?? "").trim();
      const showBoth = Boolean(effectiveNotesTranslation?.showBoth && translatedText);
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
            translationOrder: normalizeDockTranslationOrder(effectiveNotesTranslation?.translationOrder),
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
          translationOrder: normalizeDockTranslationOrder(effectiveNotesTranslation?.translationOrder),
          sectionLabel: slide.label || selectedNoteDisplayTitle,
          songTitle: selectedNoteDisplayTitle,
          overlayMode,
          bibleThemeSettings: themeSettings as unknown as Record<string, unknown>,
          liveOverrides: null,
          backgroundOnly: false,
        },
      };
    },
    [selectedNote, selectedNoteDisplayTitle, selectedNoteSlides, effectiveNotesTranslation, overlayMode, selectedFSTheme, selectedLTTheme, fullscreenQuickSettings, lowerThirdQuickSettings],
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

  const handleAutoAdvanceStart = useCallback((startIndex: number) => {
    if (startIndex !== selectedNoteAutoAdvanceIndex) return;
    const startSlideIndex = activeSlideIndex ?? (selectedNoteSlides.length > 0 ? 0 : null);
    if (startSlideIndex !== null) pushNoteSlide(startSlideIndex);
  }, [activeSlideIndex, pushNoteSlide, selectedNoteAutoAdvanceIndex, selectedNoteSlides.length]);

  const handleAutoAdvanceNoteStep = useCallback(
    (currentNoteIndex: number, nextItemIndex: number | null) => {
      if (!selectedNote || currentNoteIndex !== selectedNoteAutoAdvanceIndex) return;

      const nextSlideIndex = activeSlideIndex === null ? undefined : activeSlideIndex + 1;
      if (nextSlideIndex !== undefined && nextSlideIndex < selectedNoteSlides.length) {
        pushNoteSlide(nextSlideIndex);
        return { handled: true, nextIndex: currentNoteIndex };
      }

      // A loop stays inside this note and returns to its first slide. A null
      // candidate means stop-at-end, so the control finishes the run.
      if (nextItemIndex === currentNoteIndex) {
        if (selectedNoteSlides.length > 0) pushNoteSlide(0);
        return { handled: true, nextIndex: currentNoteIndex };
      }

      return;
    },
    [
      activeSlideIndex,
      pushNoteSlide,
      selectedNote,
      selectedNoteAutoAdvanceIndex,
      selectedNoteSlides.length,
    ],
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
    if (overlayVisible && activeSlideIndex !== null) {
      pendingQuickSettingsRefreshRef.current = true;
      setQuickSettingsRefreshNonce((current) => current + 1);
    }
  }, [activeSlideIndex, fullscreenQuickSettings, lowerThirdQuickSettings, overlayVisible, selectedFSTheme, selectedLTTheme]);

  const handleNotesQuickActionsPositionChange = useCallback((top: number, left: number | null) => {
    setQuickActionsTop(top);
    setQuickActionsLeft(left);
  }, []);

  useEffect(() => {
    if (!pendingQuickSettingsRefreshRef.current) return;
    if (!overlayVisible || activeSlideIndex === null) {
      pendingQuickSettingsRefreshRef.current = false;
      return;
    }
    pendingQuickSettingsRefreshRef.current = false;
    // Only refresh an output that is already visible. Quick settings must not
    // publish a hidden or not-yet-presented note.
    pushNoteSlide(activeSlideIndex);
  }, [activeSlideIndex, overlayVisible, pushNoteSlide, quickSettingsRefreshNonce]);

  useEffect(() => {
    if (!notesTranslationChangeRef.current) return;
    notesTranslationChangeRef.current = false;
    if (activeSlideIndex === null || !overlayVisible || visibleSlideIdx === null) return;
    pushNoteSlide(activeSlideIndex);
  }, [activeSlideIndex, effectiveNotesTranslation, overlayVisible, pushNoteSlide, visibleSlideIdx]);

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
                  title={t("notes.output")}
                />
                <button type="button" className="dock-console-toggle" onClick={openNewNote} title={t("notes.addNote")} aria-label={t("notes.addNote")}>
                  <Icon name="add" size={13} />
                  <span className="dock-console-toggle__label">{t("notes.addNote")}</span>
                </button>
              </div>
            </div>
            <div className="dock-search dock-search--console" style={{ marginBottom: 0 }}>
              <Icon name="search" size={14} className="dock-search__icon" />
              <input
                className="dock-input"
                placeholder={t("notes.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t("notes.searchPlaceholder")}
              />
              {searchQuery && (
                <button type="button" className="dock-search__clear" onClick={() => setSearchQuery("")} aria-label={t("common.clear")} title={t("common.clear")}>
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
                  {notes.length === 0 ? t("notes.noNotesYet") : t("notes.noNotesMatch")}
                </div>
                <div className="dock-empty__text">
                  {notes.length === 0 ? t("notes.createFirstHint") : t("notes.noResultsFor", { query: searchQuery })}
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
                        {extractStructuredTextTitle(normalizeDockMultilineText(note.content)).body.split("\n")[0]?.substring(0, 80) || t("notes.noContent")}
                      </span>
                    </button>
                    <button type="button" className="dock-song-card__edit" onClick={() => openEditNote(note)} aria-label={t("common.edit")} title={t("common.edit")}>
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
                  title={t("common.back")}
                >
                  <Icon name="arrow_back" size={14} />
                </button>
                <div className="dock-worship-summary__copy">
                  <div className="dock-worship-summary__title">{selectedNoteDisplayTitle}</div>
                  <div className="dock-worship-summary__artist">{t("notes.note")}</div>
                  <div className="dock-worship-summary__meta">
                    <span>{selectedNoteSlides.length} {selectedNoteSlides.length === 1 ? t("notes.slide") : t("notes.slides")}</span>
                    <span className="dock-worship-summary__meta-dot">·</span>
                    <span>{notesLinesPerSlide} {notesLinesPerSlide === 1 ? t("notes.linePerNote") : t("notes.linesPerNote")}</span>
                  </div>
                </div>
              </div>
              <div className="dock-worship-summary__actions">
                <DockTranslationControls
                  compact
                  sections={selectedNoteSlides.map((slide) => ({ id: slide.id, text: slide.text }))}
                  value={effectiveNotesTranslation}
                  onChange={handleNotesTranslationChange}
                />
                <DockAutoAdvanceControl
                  items={[{ id: selectedNote.id, label: selectedNoteDisplayTitle }]}
                  selectedIndex={selectedNoteAutoAdvanceIndex}
                  onSelectIndex={handleAutoAdvanceNoteSelection}
                  onAdvance={handleAutoAdvanceNoteStep}
                  onStart={handleAutoAdvanceStart}
                  onActiveChange={setAutoAdvanceActive}
                  itemKind="note"
                  storageScope="notes"
                />
                <button type="button" className="dock-shell-icon-btn" onClick={() => openEditNote(selectedNote)} title={t("notes.editNote")} aria-label={t("notes.editNote")}>
                  <Icon name="edit" size={16} />
                </button>
              </div>
            </div>
          </section>

          <section className="dock-console-panel dock-console-panel--toolbar dock-worship-lyrics-search">
            <div className="dock-media-search dock-media-search--plain">
              <input
                className="dock-media-search__input"
                placeholder={t("notes.searchSlidesPlaceholder")}
                value={noteSlidesSearchQuery}
                onChange={(event) => setNoteSlidesSearchQuery(event.target.value)}
                aria-label={t("notes.searchSlidesPlaceholder")}
              />
              {noteSlidesSearchQuery && (
                <button
                  type="button"
                  className="dock-media-search__clear"
                  onClick={() => setNoteSlidesSearchQuery("")}
                  aria-label={t("common.clear")}
                  title={t("common.clear")}
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
                <div className="dock-empty__text">{t("notes.noContentToDisplay")}</div>
              </div>
            ) : filteredNoteSlides.length === 0 ? (
              <div className="dock-empty dock-worship-workspace__empty">
                <Icon name="search_off" size={18} />
                <div className="dock-empty__text">{t("notes.noSlidesMatch", { query: noteSlidesSearchQuery })}</div>
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
                      title={t("notes.clickToView")}
                    >
                      <button type="button" className="dock-worship-slide-card__main" onClick={() => void pushNoteSlide(idx)}>
                        <div className="dock-worship-slide-card__header">
                          <div className="dock-worship-slide-card__label">
                            <span className="dock-worship-slide-card__name">{slide.label || `${t("notes.slideLabel")} ${idx + 1}`}</span>
                            <span className="dock-worship-slide-card__index">{idx + 1}</span>
                          </div>
                          <div className="dock-worship-slide-card__badges" />
                        </div>
                        {getOrderedTranslationParts(
                          slide.text,
                          normalizeDockMultilineText(effectiveNotesTranslation?.translatedSections[slide.id] ?? ""),
                          effectiveNotesTranslation?.showBoth ?? false,
                          effectiveNotesTranslation?.translationOrder,
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
                          title={t("notes.quickEditSlide")}
                          aria-label={t("notes.quickEditSlide")}
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
                          title={t("notes.deleteSlide")}
                          aria-label={t("notes.deleteSlide")}
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
              textLabel={t("notes.text")}
              lineLabel={t("notes.linesPerNote")}
              settings={activeNoteQuickSettings}
              lineCount={notesLinesPerSlide}
              maxLineCount={MAX_NOTE_LINES_PER_SLIDE}
              minFontSize={overlayMode === "fullscreen" ? 28 : 14}
              maxFontSize={overlayMode === "fullscreen" ? 180 : 100}
              updateImmediately={quickUpdateImmediately}
              isLive={overlayVisible}
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
                overlayModeToggleDisabled={autoAdvanceActive}
                clearLabel={overlayVisible ? t("notes.hide") : t("notes.show")}
                onClear={handleClear}
                sourceVisible={overlayVisible}
                collapsed={toolbarCollapsed}
                onCollapseChange={setToolbarCollapsed}
                inlineAction={
                  <button
                    type="button"
                    className="dock-btm-toolbar__icon-btn"
                    onClick={() => setShowThemeSettings(true)}
                    title={t("worship.quickEdits", "Quick Edits")}
                    aria-label={t("worship.quickEdits", "Quick Edits")}
                  >
                    <Icon name="tune" size={14} />
                  </button>
                }
                children={!presentationLinkMode ? (
                  <DockSceneRoutingControl
                    module="notes"
                    route={sceneRoute}
                    onRouteChange={updateSceneRoute}
                    title={t("sceneRouting.bible", "Output")}
                    placement="above"
                    showLabel
                    iconName="cast"
                  />
                ) : undefined}
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
        title={t("notes.theme")}
        subtitle={t("notes.themeDescription")}
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
                <div className="dock-dialog__eyebrow">{t("notes.quickEdit")}</div>
                <h2 id="dock-note-slide-editor-title" className="dock-dialog__title">{noteSlideEditor.label}</h2>
              </div>
              <button type="button" className="dock-dialog__close" onClick={closeNoteSlideEditor} aria-label={t("common.close")} title={t("common.close")}>
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
              <div className="dock-dialog-field">
                <label className="dock-dialog-field__label" htmlFor="dock-note-slide-text">
                  <span>{t("notes.slideText")}</span>
                </label>
                <DockSpellcheckTextarea
                  id="dock-note-slide-text"
                  className="dock-input dock-dialog-textarea dock-dialog-textarea--short"
                  value={noteSlideEditor.text}
                  onChange={(value) => setNoteSlideEditor((current) => current ? { ...current, text: value } : current)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                  }}
                />
              </div>
            </div>
            <div className="dock-dialog__footer">
              <button type="button" className="dock-btn dock-btn--ghost" onClick={closeNoteSlideEditor} title={t("common.cancel")}>{t("common.cancel")}</button>
              <button type="button" className="dock-btn dock-btn--primary" onClick={saveNoteSlideEditor} disabled={!noteSlideEditor.text.trim()} title={t("common.save")}>{t("common.save")}</button>
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
