import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Icon from "../components/Icon";
import { UpgradeModal } from "../components/UpgradeModal";
import { useAuth } from "../contexts/AuthContext";
import { checkEntitlementSync } from "../services/entitlementClient";
import { getEffectivePlan } from "../services/licenseService";
import { processDocumentViaApi, processFileViaUpload } from "./bulkImportAiService";

import {
  createEmptyImportSection,
  estimateDraftSlideCount,
  formatDraftLyrics,
  importSmartSongs,
} from "./smartImportService";
import { assessExtractedTextQuality, extractTextFromFile, getFileTypeLabel } from "./bulkImportService";
import type {
  SmartImportSectionDraft,
  SmartImportSectionType,
  SmartImportSongDraft,
} from "./smartImportTypes";
import { generateSlides } from "./slideEngine";
import { SongImportFrame } from "./SongImportFrame";
import "./bulkImportModal.css";

interface BulkImportDocumentFlowProps {
  onClose: () => void;
  onImported: () => void;
}

type Step = "pick" | "extract" | "review" | "importing" | "done";

const STEP_LABELS: Record<Step, string> = {
  pick: "Pick",
  extract: "Extract",
  review: "Review",
  importing: "Import",
  done: "Done",
};

const VISIBLE_STEPS = [
  { id: "pick", label: STEP_LABELS.pick },
  { id: "extract", label: STEP_LABELS.extract },
  { id: "review", label: STEP_LABELS.review },
  { id: "importing", label: STEP_LABELS.importing },
] as const;

const SECTION_TYPE_OPTIONS: Array<{ value: SmartImportSectionType; label: string }> = [
  { value: "verse", label: "Verse" },
  { value: "chorus", label: "Chorus" },
  { value: "refrain", label: "Refrain" },
  { value: "bridge", label: "Bridge" },
  { value: "pre-chorus", label: "Pre-Chorus" },
  { value: "tag", label: "Tag" },
  { value: "intro", label: "Intro" },
  { value: "outro", label: "Outro" },
  { value: "other", label: "Other" },
];

const SLIDE_LAYOUT_OPTIONS = [
  { value: 1, label: "1 line" },
  { value: 2, label: "2 lines" },
  { value: 3, label: "3 lines" },
  { value: 4, label: "4 lines" },
];

const PREVIEW_MAX_LINES = 180;
const PREVIEW_MAX_CHARS = 12_000;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function firstLines(text: string, count: number): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, count);
  return lines.join("\n");
}

function nextSongAfterRemoval(songs: SmartImportSongDraft[], currentId: string): string {
  if (songs.length === 0) return "";
  const currentIndex = songs.findIndex((song) => song.id === currentId);
  if (currentIndex === -1) return songs[0].id;
  const next = songs[currentIndex + 1] ?? songs[currentIndex - 1] ?? songs[0];
  return next?.id ?? "";
}

function buildExtractPreview(text: string): { text: string; truncated: boolean; lineCount: number; charCount: number } {
  const lines = text.split("\n");
  const previewLines: string[] = [];
  let charCount = 0;

  for (const line of lines) {
    if (previewLines.length >= PREVIEW_MAX_LINES || charCount >= PREVIEW_MAX_CHARS) {
      break;
    }
    previewLines.push(line);
    charCount += line.length + 1;
  }

  const previewText = previewLines.join("\n");
  const truncated = previewLines.length < lines.length || previewText.length < text.length;

  return {
    text: previewText,
    truncated,
    lineCount: previewLines.length,
    charCount: previewText.length,
  };
}

function splitSectionDraft(section: SmartImportSectionDraft): SmartImportSectionDraft[] {
  const lines = section.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [section];
  }

  const splitPoint = Math.ceil(lines.length / 2);
  const first = lines.slice(0, splitPoint).join("\n");
  const second = lines.slice(splitPoint).join("\n");

  return [
    { ...section, content: first },
    {
      ...section,
      id: `${section.id}-split`,
      label: `${section.label} (cont)`,
      content: second,
    },
  ];
}

export function BulkImportDocumentFlow({ onClose, onImported }: BulkImportDocumentFlowProps) {
  const { user } = useAuth();
  const effectivePlan = getEffectivePlan(user);
  const importAccess = checkEntitlementSync("massImport", effectivePlan);
  const [step, setStep] = useState<Step>("pick");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [reviewSongs, setReviewSongs] = useState<SmartImportSongDraft[]>([]);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [activeSongId, setActiveSongId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  const [autoSplit, setAutoSplit] = useState(true);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ imported: 0, total: 0 });
  const [processingLabel, setProcessingLabel] = useState("");

  const previousFocusRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importedCountRef = useRef(0);
  const processRequestRef = useRef(0);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  const activeSong = useMemo(
    () => reviewSongs.find((song) => song.id === activeSongId) ?? reviewSongs[0] ?? null,
    [activeSongId, reviewSongs],
  );

  const activeSongSlides = useMemo(() => {
    if (!activeSong) return [];
    const lyrics = formatDraftLyrics(activeSong);
    return generateSlides(lyrics, linesPerSlide, autoSplit);
  }, [activeSong, autoSplit, linesPerSlide]);

  const selectedSongs = useMemo(
    () => reviewSongs.filter((song) => selectedSongIds.has(song.id)),
    [reviewSongs, selectedSongIds],
  );
  const selectedSongCount = selectedSongIds.size;

  const textStats = useMemo(() => {
    if (!rawText.trim()) return null;
    return {
      chars: rawText.length,
      words: wordCount(rawText),
      lines: rawText.split("\n").length,
    };
  }, [rawText]);

  const extractPreview = useMemo(
    () => (rawText.trim() ? buildExtractPreview(rawText) : null),
    [rawText],
  );
  const activeSongWordCount = useMemo(
    () => (activeSong ? wordCount(formatDraftLyrics(activeSong)) : 0),
    [activeSong],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && !processing && !importing) {
        event.preventDefault();
        onClose();
      }
    },
    [importing, onClose, processing],
  );

  const resetProcessState = useCallback(() => {
    setReviewSongs([]);
    setSelectedSongIds(new Set());
    setActiveSongId("");
  }, []);

  const resetImportFlow = useCallback(() => {
    processRequestRef.current += 1;
    importedCountRef.current = 0;
    setStep("pick");
    setRawText("");
    setFileName("");
    setFileType("");
    setPasteMode(false);
    setPasteText("");
    setError("");
    setProcessing(false);
    setImporting(false);
    setProgress({ imported: 0, total: 0 });
    setProcessingLabel("");
    resetProcessState();
  }, [resetProcessState]);

  const goToExtract = useCallback((text: string, nextFileName: string, nextFileType: string) => {
    setRawText(text);
    setFileName(nextFileName);
    setFileType(nextFileType);
    setError("");
    resetProcessState();
    setStep("extract");
  }, [resetProcessState]);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setProcessing(true);
    setProcessingLabel("Extracting text locally…");

    const nextFileType = getFileTypeLabel(file.name);

    try {
      const extractedText = await extractTextFromFile(file).catch(() => "");
      const extractionQuality = assessExtractedTextQuality(extractedText);

      if (extractionQuality.usable) {
        goToExtract(extractedText, file.name, nextFileType);
        return;
      }

      setFileName(file.name);
      setFileType(nextFileType);
      setProcessingLabel("Local extraction looked incomplete. Running OCR and AI…");

      const result = await processFileViaUpload(file, (_progress, label) => {
        const nextLabel = label?.trim() || "Running OCR and AI on the full document…";
        setProcessingLabel(nextLabel);
      });

      setReviewSongs(result.songs);
      setSelectedSongIds(new Set(result.songs.map((song) => song.id)));
      setActiveSongId(result.songs[0]?.id ?? "");
      setFileName(file.name);
      setFileType(nextFileType);
      setStep("review");

      if (result.needsReview && result.warnings.length > 0) {
        setError(result.warnings[0]);
      }
    } catch (nextError) {
      setError(`Import failed: ${nextError instanceof Error ? nextError.message : String(nextError)}`);
    } finally {
      setProcessingLabel("");
      setProcessing(false);
    }
  }, [goToExtract]);

  const handleFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    event.target.value = "";
  }, [handleFile]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files[0];
    if (file) {
      void handleFile(file);
    }
  }, [handleFile]);

  const handlePasteSubmit = useCallback(() => {
    const text = pasteText.trim();
    if (!text) {
      setError("Paste some worship content before continuing.");
      return;
    }
    goToExtract(text, "Pasted text", "Text");
    setPasteText("");
    setPasteMode(false);
  }, [goToExtract, pasteText]);

  const runProcessing = useCallback(async () => {
    const raw = rawText.trim();
    if (!raw) {
      setError("No extracted text is available to process.");
      return;
    }

    const requestId = processRequestRef.current + 1;
    processRequestRef.current = requestId;

    setProcessing(true);
    setError("");

    try {
      const result = await processDocumentViaApi(rawText, fileName);

      if (processRequestRef.current !== requestId) {
        return;
      }

      setReviewSongs(result.songs);
      setSelectedSongIds(new Set(result.songs.map((song) => song.id)));
      setActiveSongId(result.songs[0]?.id ?? "");
      setStep("review");

      if (result.needsReview && result.warnings.length > 0) {
        setError(result.warnings[0]);
      }
    } catch (statusError) {
      if (processRequestRef.current === requestId) {
        setError(`Processing failed: ${statusError instanceof Error ? statusError.message : String(statusError)}`);
      }
    } finally {
      if (processRequestRef.current === requestId) {
        setProcessing(false);
      }
    }
  }, [rawText, fileName]);

  const toggleSongSelection = useCallback((songId: string) => {
    setSelectedSongIds((previous) => {
      const next = new Set(previous);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }, []);

  const toggleAllSongs = useCallback(() => {
    setSelectedSongIds((previous) => {
      if (previous.size === reviewSongs.length) {
        return new Set();
      }
      return new Set(reviewSongs.map((song) => song.id));
    });
  }, [reviewSongs]);

  const updateSong = useCallback((songId: string, updater: (song: SmartImportSongDraft) => SmartImportSongDraft) => {
    setReviewSongs((previous) => previous.map((song) => (song.id === songId ? updater(song) : song)));
  }, []);

  const updateSongField = useCallback((
    songId: string,
    field: "title" | "hymnNumber" | "artist",
    value: string,
  ) => {
    updateSong(songId, (song) => ({ ...song, [field]: value }));
  }, [updateSong]);

  const updateSection = useCallback((
    songId: string,
    sectionId: string,
    updater: (section: SmartImportSectionDraft) => SmartImportSectionDraft,
  ) => {
    updateSong(songId, (song) => ({
      ...song,
      sections: song.sections.map((section) => (section.id === sectionId ? updater(section) : section)),
    }));
  }, [updateSong]);

  const addSection = useCallback((songId: string) => {
    updateSong(songId, (song) => ({
      ...song,
      sections: [...song.sections, createEmptyImportSection("verse")],
    }));
  }, [updateSong]);

  const deleteSection = useCallback((songId: string, sectionId: string) => {
    updateSong(songId, (song) => ({
      ...song,
      sections: song.sections.filter((section) => section.id !== sectionId),
    }));
  }, [updateSong]);

  const moveSection = useCallback((songId: string, sectionId: string, direction: -1 | 1) => {
    updateSong(songId, (song) => {
      const index = song.sections.findIndex((section) => section.id === sectionId);
      const nextIndex = index + direction;
      if (index === -1 || nextIndex < 0 || nextIndex >= song.sections.length) {
        return song;
      }

      const nextSections = [...song.sections];
      const [section] = nextSections.splice(index, 1);
      nextSections.splice(nextIndex, 0, section);
      return { ...song, sections: nextSections };
    });
  }, [updateSong]);

  const mergeSectionDown = useCallback((songId: string, sectionId: string) => {
    updateSong(songId, (song) => {
      const index = song.sections.findIndex((section) => section.id === sectionId);
      if (index === -1 || index >= song.sections.length - 1) {
        return song;
      }

      const current = song.sections[index];
      const next = song.sections[index + 1];
      const merged: SmartImportSectionDraft = {
        ...current,
        content: [current.content, next.content].filter(Boolean).join("\n"),
        warnings: [...current.warnings, ...next.warnings],
      };

      const nextSections = [...song.sections];
      nextSections.splice(index, 2, merged);
      return { ...song, sections: nextSections };
    });
  }, [updateSong]);

  const splitSection = useCallback((songId: string, sectionId: string) => {
    updateSong(songId, (song) => {
      const index = song.sections.findIndex((section) => section.id === sectionId);
      if (index === -1) {
        return song;
      }

      const nextSections = [...song.sections];
      const [section] = nextSections.splice(index, 1);
      nextSections.splice(index, 0, ...splitSectionDraft(section));
      return { ...song, sections: nextSections };
    });
  }, [updateSong]);

  const removeSong = useCallback((songId: string) => {
    setReviewSongs((previous) => {
      const next = previous.filter((song) => song.id !== songId);
      setActiveSongId((current) => (current === songId ? nextSongAfterRemoval(next, current) : current));
      return next;
    });
    setSelectedSongIds((previous) => {
      const next = new Set(previous);
      next.delete(songId);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (selectedSongs.length === 0) return;

    const importable = selectedSongs.filter((song) => song.title.trim() && formatDraftLyrics(song).trim());
    if (importable.length === 0) {
      setError("No selected songs have enough content to import.");
      return;
    }

    importedCountRef.current = importable.length;
    setImporting(true);
    setProgress({ imported: 0, total: importable.length });
    setStep("importing");

    try {
      await importSmartSongs(
        importable,
        {
          sourceName: fileName,
          linesPerSlide,
          autoSplit,
        },
        (imported, total) => setProgress({ imported, total }),
      );
      onImported();
      setStep("done");
    } catch (importError) {
      setError(`Import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
      setStep("review");
    } finally {
      setImporting(false);
    }
  }, [autoSplit, fileName, linesPerSlide, onImported, selectedSongs]);

  const canClose = !processing && !importing;

  if (!importAccess.allowed) {
    return (
      <UpgradeModal
        open
        onClose={onClose}
        feature="massImport"
        requiredPlan="growth"
        currentPlan={effectivePlan}
        message="Bulk import is available on Growth and Pro. Free trial users can use it during the trial. Upgrade to Growth to import documents and save multiple worship songs at once."
      />
    );
  }

  const footer = step === "done" ? null : (
    <div className="bulk-import-footer">
      <button
        type="button"
        className="bulk-import-btn-secondary"
        onClick={
          step === "pick"
            ? onClose
            : step === "extract"
              ? resetImportFlow
              : step === "review"
                ? () => setStep("extract")
                : onClose
        }
        disabled={!canClose}
        title={step === "pick" ? "Close" : "Back"}
      >
        {step === "pick" ? <Icon name="close" size={14} /> : <Icon name="arrow_back" size={14} />}
        {step === "pick" ? "Close" : "Back"}
      </button>

      {step === "extract" && !processing && (
        <button
          type="button"
          className="bulk-import-btn-primary"
          onClick={() => {
            void runProcessing();
          }}
          title="Process document"
        >
          <Icon name="auto_awesome" size={14} />
          Structure Document
        </button>
      )}

      {step === "review" && (
        <button
          type="button"
          className="bulk-import-btn-primary"
          disabled={selectedSongs.length === 0}
          onClick={() => {
            void handleImport();
          }}
          title="Import selected songs"
        >
          <Icon name="download_done" size={14} />
          Import {selectedSongs.length} Song{selectedSongs.length === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );

  return (
    <SongImportFrame
      step={step}
      steps={[...VISIBLE_STEPS]}
      eyebrow="Smart Worship Import"
      title="Import Worship Documents"
      subtitle="Select a document or pasted lyrics, then review detected songs and sections before sending everything into the worship library."
      onClose={onClose}
      canClose={canClose}
      onKeyDown={handleKeyDown}
      ariaLabel="Smart worship import"
      error={error ? <div className="bulk-import-error">{error}</div> : null}
      footer={footer}
    >
      <div className="bulk-import-body">
        {step === "pick" && (
          <div className="song-import-flow-pick-shell">
            <aside className="song-import-flow-overview">
              <div className="song-import-flow-overview-copy">
                <h3>Bring in your worship content</h3>
                <p>
                  Start with a file or pasted text. The importer will extract songs, detect sections,
                  and let you review slide-ready structure before anything is saved.
                </p>
              </div>

              <div className="song-import-flow-overview-list">
                <div className="song-import-flow-overview-item">
                  <span className="song-import-flow-overview-icon">
                    <Icon name="upload_file" size={18} />
                  </span>
                  <div>
                    <strong>Supported formats</strong>
                    <span>PDF, DOCX, and TXT files work best for hymn sheets, choir documents, and orders of service.</span>
                  </div>
                </div>

                <div className="song-import-flow-overview-item">
                  <span className="song-import-flow-overview-icon">
                    <Icon name="content_paste" size={18} />
                  </span>
                  <div>
                    <strong>Paste directly</strong>
                    <span>Use pasted text when lyrics already came from WhatsApp, email, or another document window.</span>
                  </div>
                </div>
              </div>

              <div className="song-import-flow-chip-row">
                <span className="song-import-flow-chip">Batch import</span>
                <span className="song-import-flow-chip">Section cleanup</span>
                <span className="song-import-flow-chip">Slide preview</span>
              </div>
            </aside>

            <div className="song-import-flow-workspace">
              <div className="bulk-import-source-grid">
                <button
                  type="button"
                  className={`bulk-import-source-card${!pasteMode ? " active" : ""}`}
                  onClick={() => {
                    setPasteMode(false);
                    setError("");
                  }}
                >
                  <span className="bulk-import-source-card__icon">
                    <Icon name="upload_file" size={18} />
                  </span>
                  <span className="bulk-import-source-card__body">
                    <strong>Upload document</strong>
                    <span>Use a PDF, DOCX, or TXT file and let the importer extract the worship songs.</span>
                  </span>
                </button>

                <button
                  type="button"
                  className={`bulk-import-source-card${pasteMode ? " active" : ""}`}
                  onClick={() => {
                    setPasteMode(true);
                    setError("");
                  }}
                >
                  <span className="bulk-import-source-card__icon">
                    <Icon name="content_paste" size={18} />
                  </span>
                  <span className="bulk-import-source-card__body">
                    <strong>Paste text</strong>
                    <span>Use this when the lyrics are already copied from another document or message.</span>
                  </span>
                </button>
              </div>

              <div
                className="bulk-import-dropzone"
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={() => !pasteMode && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx"
                  className="bulk-import-file-input"
                  disabled={processing}
                  onChange={handleFileInput}
                />
                <Icon name="upload_file" size={32} />
                <p className="bulk-import-dropzone-title">
                  {pasteMode ? "File upload is still available" : "Drop a PDF, DOCX, or TXT file here"}
                </p>
                <p className="bulk-import-dropzone-hint">
                  {pasteMode
                    ? "Switch to upload above, then pick a file or drag one into this area."
                    : "Hymn books, worship sheets, choir lyrics, and order-of-service documents are supported."}
                </p>
                <div className="bulk-import-format-chips" aria-hidden="true">
                  <span>PDF</span>
                  <span>DOCX</span>
                  <span>TXT</span>
                </div>
              </div>



              {pasteMode && (
                <div className="bulk-import-paste-area">
                  <textarea
                    className="bulk-import-paste-textarea"
                    placeholder={"Paste worship content here…\n\nHymn 101\nAmazing Grace\nVerse 1\nAmazing grace how sweet the sound"}
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    rows={12}
                    autoFocus
                  />
                  <div className="bulk-import-paste-actions">
                    <button
                      type="button"
                      className="bulk-import-btn-secondary"
                      onClick={() => {
                        setPasteMode(false);
                        setPasteText("");
                        setError("");
                      }}
                      title="Cancel"
                    >
                      <Icon name="close" size={14} />
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="bulk-import-btn-primary"
                      disabled={!pasteText.trim()}
                      onClick={handlePasteSubmit}
                      title="Use pasted text"
                    >
                      <Icon name="arrow_forward" size={14} />
                      Use Pasted Text
                    </button>
                  </div>
                </div>
              )}

              {processing && (
                <div className="bulk-import-processing-inline">
                  <Icon name="auto_awesome" size={16} />
                  <span>{processingLabel || "Preparing document..."}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {step === "extract" && (
          <div className="song-import-flow-hero-panel">
            <div className="bulk-import-preview-header">
              <span className="bulk-import-file-badge">
                <Icon name="description" size={14} />
                {fileName}
                <span className="bulk-import-file-type">{fileType}</span>
              </span>
              {textStats && (
                <span className="bulk-import-stats">
                  {textStats.chars.toLocaleString()} chars · {textStats.words.toLocaleString()} words · {textStats.lines.toLocaleString()} lines
                </span>
              )}
            </div>

            {textStats && (
              <div className="bulk-import-stat-grid">
                <div className="bulk-import-stat-card">
                  <span className="bulk-import-stat-card__icon">
                    <Icon name="notes" size={16} />
                  </span>
                  <span className="bulk-import-stat-card__label">Lines</span>
                  <strong>{textStats.lines.toLocaleString()}</strong>
                </div>
                <div className="bulk-import-stat-card">
                  <span className="bulk-import-stat-card__icon">
                    <Icon name="title" size={16} />
                  </span>
                  <span className="bulk-import-stat-card__label">Words</span>
                  <strong>{textStats.words.toLocaleString()}</strong>
                </div>
                <div className="bulk-import-stat-card">
                  <span className="bulk-import-stat-card__icon">
                    <Icon name="text_fields" size={16} />
                  </span>
                  <span className="bulk-import-stat-card__label">Characters</span>
                  <strong>{textStats.chars.toLocaleString()}</strong>
                </div>
              </div>
            )}

            <div className="bulk-import-text-preview">
              <pre>{extractPreview?.text ?? rawText}</pre>
            </div>

            <div className="bulk-import-pick-tip bulk-import-pick-tip--wide">
              <Icon name="psychology" size={16} />
              <span>Run structuring next to split the document into songs and detected sections for review.</span>
            </div>

            {extractPreview?.truncated && textStats && (
              <div className="bulk-import-preview-note">
                <Icon name="info" size={14} />
                <span>
                  Showing the first {extractPreview.lineCount.toLocaleString()} of {textStats.lines.toLocaleString()} lines to keep large document imports responsive.
                </span>
              </div>
            )}

            {processing && (
              <div className="bulk-import-processing-inline">
                <Icon name="auto_awesome" size={16} />
                <span>{processingLabel || "Organizing document content…"}</span>
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="bulk-import-review-shell">
            <div className="bulk-import-review-sidebar">
              <div className="bulk-import-preview-header">
                <span className="bulk-import-file-badge">
                  <Icon name="description" size={14} />
                  {fileName}
                  <span className="bulk-import-file-type">{fileType}</span>
                </span>
              </div>

              <div className="bulk-import-review-toolbar">
                <div className="bulk-import-review-summary">
                  <div className="bulk-import-review-summary__stat">
                    <Icon name="library_music" size={16} />
                    <div>
                      <strong>{reviewSongs.length}</strong>
                      <span>songs detected</span>
                    </div>
                  </div>
                  <div className="bulk-import-review-summary__stat">
                    <Icon name="check_circle" size={16} />
                    <div>
                      <strong>{selectedSongCount}</strong>
                      <span>selected to import</span>
                    </div>
                  </div>
                </div>

                <label className="bulk-import-select-all">
                  <input
                    type="checkbox"
                    checked={reviewSongs.length > 0 && selectedSongCount === reviewSongs.length}
                    onChange={toggleAllSongs}
                  />
                  Select all detected songs
                </label>

                <div className="bulk-import-review-layout">
                  <label>
                    <span>
                      <Icon name="view_agenda" size={14} />
                      Lines/slide
                    </span>
                    <select value={linesPerSlide} onChange={(event) => setLinesPerSlide(parseInt(event.target.value, 10))}>
                      {SLIDE_LAYOUT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="bulk-import-review-layout__toggle">
                    <input
                      type="checkbox"
                      checked={autoSplit}
                      onChange={(event) => setAutoSplit(event.target.checked)}
                    />
                    <span>
                      <Icon name="call_split" size={14} />
                      Auto slide split
                    </span>
                  </label>
                </div>
              </div>

              <div className="bulk-import-song-list bulk-import-song-list--review">
                {reviewSongs.map((song) => (
                  <div
                    key={song.id}
                    className={`bulk-import-song-card bulk-import-song-card--review${activeSong?.id === song.id ? " active" : ""}${selectedSongIds.has(song.id) ? " selected" : ""}`}
                    onClick={() => setActiveSongId(song.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveSongId(song.id);
                      }
                    }}
                  >
                    <div className="bulk-import-song-card-left">
                      <input
                        type="checkbox"
                        checked={selectedSongIds.has(song.id)}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleSongSelection(song.id);
                        }}
                        className="bulk-import-song-card-check"
                      />
                    </div>

                    <div className="bulk-import-song-card-body">
                      <div className="bulk-import-song-card-title-row">
                        <span className="bulk-import-song-card-title-text">{song.title}</span>
                        {song.hymnNumber && <span className="bulk-import-song-card-tag">Hymn {song.hymnNumber}</span>}
                        {song.language && <span className={`bulk-import-lang-badge bulk-import-lang-badge--${song.language}`}>{song.language}</span>}
                      </div>
                      <p className="bulk-import-song-card-preview">
                        {firstLines(formatDraftLyrics(song), 3)}
                      </p>
                      <div className="bulk-import-song-card-meta">
                        <span>{song.sections.length} sections</span>
                        <span>{estimateDraftSlideCount(song, { linesPerSlide, autoSplit })} slides</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="bulk-import-song-card-remove"
                      title="Remove song"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSong(song.id);
                      }}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bulk-import-review-detail">
              {activeSong ? (
                <>
                  <div className="bulk-import-detail-head">
                    <div className="bulk-import-detail-meta">
                      <label>
                        <span>Title</span>
                        <input
                          type="text"
                          value={activeSong.title}
                          onChange={(event) => updateSongField(activeSong.id, "title", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Hymn Number</span>
                        <input
                          type="text"
                          value={activeSong.hymnNumber ?? ""}
                          onChange={(event) => updateSongField(activeSong.id, "hymnNumber", event.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                      <label>
                        <span>Artist / Source</span>
                        <input
                          type="text"
                          value={activeSong.artist ?? ""}
                          onChange={(event) => updateSongField(activeSong.id, "artist", event.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                    </div>

                    <div className="bulk-import-detail-stats">
                      <div className="bulk-import-detail-stat">
                        <Icon name="segment" size={16} />
                        <div>
                          <strong>{activeSong.sections.length}</strong>
                          <span>sections</span>
                        </div>
                      </div>
                      <div className="bulk-import-detail-stat">
                        <Icon name="slideshow" size={16} />
                        <div>
                          <strong>{activeSongSlides.length}</strong>
                          <span>slides</span>
                        </div>
                      </div>
                      <div className="bulk-import-detail-stat">
                        <Icon name="text_fields" size={16} />
                        <div>
                          <strong>{activeSongWordCount}</strong>
                          <span>words</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {activeSong.warnings.length > 0 && (
                    <div className="bulk-import-smart-warnings">
                      {activeSong.warnings.map((warning) => (
                        <div key={warning} className="bulk-import-detect-warn">
                          <Icon name="warning" size={16} />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeSong.reviewNotes.length > 0 && (
                    <div className="bulk-import-smart-notes">
                      {activeSong.reviewNotes.map((note) => (
                        <div key={note} className="bulk-import-detect-warn">
                          <Icon name="auto_awesome" size={16} />
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bulk-import-section-editor">
                    <div className="bulk-import-section-editor__head">
                      <h3>Sections Detected</h3>
                      <button type="button" className="bulk-import-btn-secondary" onClick={() => addSection(activeSong.id)} title="Add section">
                        <Icon name="add" size={14} />
                        Add Section
                      </button>
                    </div>

                    <div className="bulk-import-section-list">
                      {activeSong.sections.map((section, index) => (
                        <div key={section.id} className="bulk-import-section-card">
                          <div className="bulk-import-section-card__head">
                            <div className="bulk-import-section-card__meta">
                              <label>
                                <span>Type</span>
                                <select
                                  value={section.type}
                                  onChange={(event) => updateSection(activeSong.id, section.id, (current) => ({
                                    ...current,
                                    type: event.target.value as SmartImportSectionType,
                                  }))}
                                >
                                  {SECTION_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Label</span>
                                <input
                                  type="text"
                                  value={section.label}
                                  onChange={(event) => updateSection(activeSong.id, section.id, (current) => ({
                                    ...current,
                                    label: event.target.value,
                                  }))}
                                />
                              </label>
                              <label className="bulk-import-section-card__number">
                                <span>No.</span>
                                <input
                                  type="text"
                                  value={section.number ?? ""}
                                  onChange={(event) => updateSection(activeSong.id, section.id, (current) => ({
                                    ...current,
                                    number: event.target.value,
                                  }))}
                                  placeholder="-"
                                />
                              </label>
                            </div>

                            <div className="bulk-import-section-card__actions">
                              <button type="button" onClick={() => moveSection(activeSong.id, section.id, -1)} disabled={index === 0} title="Move up" aria-label="Move section up">
                                <Icon name="arrow_upward" size={14} />
                              </button>
                              <button type="button" onClick={() => moveSection(activeSong.id, section.id, 1)} disabled={index === activeSong.sections.length - 1} title="Move down" aria-label="Move section down">
                                <Icon name="arrow_downward" size={14} />
                              </button>
                              <button type="button" onClick={() => splitSection(activeSong.id, section.id)} title="Split section" aria-label="Split section">
                                <Icon name="call_split" size={14} />
                              </button>
                              <button type="button" onClick={() => mergeSectionDown(activeSong.id, section.id)} disabled={index === activeSong.sections.length - 1} title="Merge with next" aria-label="Merge section with next">
                                <Icon name="merge" size={14} />
                              </button>
                              <button type="button" onClick={() => deleteSection(activeSong.id, section.id)} title="Delete section" aria-label="Delete section">
                                <Icon name="delete" size={14} />
                              </button>
                            </div>
                          </div>

                          <textarea
                            className="bulk-import-section-card__textarea"
                            value={section.content}
                            onChange={(event) => updateSection(activeSong.id, section.id, (current) => ({
                              ...current,
                              content: event.target.value,
                            }))}
                            rows={6}
                          />

                          {section.warnings.length > 0 && (
                            <div className="bulk-import-section-card__warnings">
                              {section.warnings.join(" ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bulk-import-slide-preview">
                    <div className="bulk-import-slide-preview__head">
                      <h3>Slide Preview</h3>
                      <span>{activeSongSlides.length} slide{activeSongSlides.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="bulk-import-slide-preview__grid">
                      {activeSongSlides.map((slide) => (
                        <div key={slide.id} className={`bulk-import-slide-card${slide.isContinuation ? " cont" : ""}`}>
                          <div className="bulk-import-slide-card__head">{slide.label}</div>
                          <pre>{slide.content}</pre>
                        </div>
                      ))}
                      {activeSongSlides.length === 0 && (
                        <div className="bulk-import-slide-preview__empty">
                          <Icon name="slideshow" size={18} />
                          <p>Add section content to generate slides.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bulk-import-slide-preview__empty bulk-import-slide-preview__empty--full">
                  <Icon name="library_music" size={20} />
                  <p>No songs available to review.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="song-import-flow-processing-shell">
            <div className="song-import-flow-processing-card">
              <div className="song-import-flow-processing-icon">
                <Icon name="auto_awesome" size={32} />
              </div>
              <h3>Importing worship songs...</h3>
              <p>We are saving the reviewed songs into your worship library and preparing them for presentation use.</p>
              <div className="song-import-flow-processing-meta">
                <Icon name="description" size={14} />
                <span>{fileName || "Selected worship content"}</span>
              </div>
              <div className="song-import-flow-processing-progress">
                <span style={{ width: `${progress.total > 0 ? (progress.imported / progress.total) * 100 : 0}%` }} />
              </div>
              <p className="bulk-import-progress-text">
                Importing {progress.imported} of {progress.total} worship song{progress.total === 1 ? "" : "s"}...
              </p>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="song-import-flow-success-shell">
            <div className="song-import-flow-success-card">
              <div className="song-import-flow-success-icon">
                <Icon name="check_circle" size={40} />
              </div>
              <h3>Import complete</h3>
              <p>
                {importedCountRef.current} song{importedCountRef.current === 1 ? "" : "s"} added to your worship
                library and ready for presentation.
              </p>
              <div className="song-import-flow-success-actions">
                <button
                  type="button"
                  className="bulk-import-btn-primary"
                  onClick={resetImportFlow}
                  title="Start a new import"
                >
                  <Icon name="refresh" size={14} />
                  Import Another
                </button>
                <button
                  type="button"
                  className="bulk-import-btn-secondary"
                  onClick={onClose}
                  title="Close"
                >
                  <Icon name="close" size={14} />
                  Close
                </button>
              </div>
            </div>

            <aside className="song-import-flow-success-side">
              <h4>Import summary</h4>
              <p>The library has been refreshed with your new songs and review settings.</p>
              <div className="song-import-flow-success-stats">
                <div className="song-import-flow-success-stat">
                  <strong>{importedCountRef.current}</strong>
                  <span>songs added</span>
                </div>
                <div className="song-import-flow-success-stat">
                  <strong>{linesPerSlide}</strong>
                  <span>lines per slide</span>
                </div>
              </div>
              <ul className="song-import-flow-success-list">
                <li>{fileName || "Imported from pasted text"}</li>
                <li>{autoSplit ? "Auto slide split enabled" : "Auto slide split disabled"}</li>
                <li>Review changes were saved before import.</li>
              </ul>
            </aside>
          </div>
        )}
      </div>
    </SongImportFrame>
  );
}
