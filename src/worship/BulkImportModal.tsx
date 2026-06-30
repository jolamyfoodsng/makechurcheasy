/**
 * BulkImportModal.tsx — Multi-step modal for importing songs from various formats.
 *
 * Steps:
 *   1. Pick — drop PDF/TXT/DOCX or paste text
 *   2. Extract — review raw extracted text
 *   3. Detect — auto-detect songs, show pattern + confidence
 *   4. Preview — select/deselect songs, edit titles, choose language mode (CCC)
 *   5. Importing — progress bar
 *   6. Done — success confirmation
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Icon from "../components/Icon";
import {
  extractTextFromFile,
  importDetectedSongs,
  getFileTypeLabel,
} from "./bulkImportService";
import {
  bulkImportHymns,
  parseBilingualHymns,
  type LanguageMode,
} from "./pdfImportService";
import {
  detectSongs,
  estimateSlideCount,
  type DetectedSong,
  type DetectionResult,
} from "./songDetector";
import "./bulkImportModal.css";

// ── Props & types ──────────────────────────────────────────────────────────

interface BulkImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

type Step = "pick" | "extract" | "detect" | "preview" | "importing" | "done";

// ── Constants ──────────────────────────────────────────────────────────────

const LANGUAGE_MODES: { value: LanguageMode; label: string; description: string }[] = [
  {
    value: "two-songs",
    label: "Two songs per hymn",
    description: "Each hymn becomes two songs — one in Yoruba, one in English.",
  },
  {
    value: "single-both",
    label: "Single song, both languages",
    description: "Each hymn is one song with [Yoruba] and [English] sections.",
  },
  {
    value: "side-by-side",
    label: "Side-by-side slides",
    description: "Each slide shows the Yoruba line followed by the English translation.",
  },
];

const STEP_LABELS: Record<string, string> = {
  pick: "Pick",
  extract: "Extract",
  detect: "Detect",
  preview: "Review",
  importing: "Import",
  done: "Done",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function firstNLines(text: string, n: number): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const preview = lines.slice(0, n).join("\n");
  return lines.length > n ? preview + "\n…" : preview;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ── Component ──────────────────────────────────────────────────────────────

export function BulkImportModal({ onClose, onImported }: BulkImportModalProps) {
  const [step, setStep] = useState<Step>("pick");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Detection
  const [detection, setDetection] = useState<DetectionResult | null>(null);

  // Preview — editable song list
  const [songs, setSongs] = useState<DetectedSong[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [languageMode, setLanguageMode] = useState<LanguageMode>("two-songs");

  // Import state
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ imported: 0, total: 0 });
  const [error, setError] = useState("");

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Focus management ─────────────────────────────────────────────────────

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && !importing) {
        event.preventDefault();
        onClose();
      }
    },
    [importing, onClose],
  );

  // ── Step navigation helpers ──────────────────────────────────────────────

  const goToExtract = useCallback((text: string, name: string, type: string) => {
    setRawText(text);
    setFileName(name);
    setFileType(type);
    setError("");
    setStep("extract");
  }, []);

  const goToDetect = useCallback(() => {
    setError("");
    const result = detectSongs(rawText);
    setDetection(result);
    setSongs(result.songs);
    setSelected(new Set(result.songs.map((_, i) => i)));
    setStep("detect");
  }, [rawText]);

  const goToPreview = useCallback(() => {
    setStep("preview");
  }, []);

  // ── File handling ────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      setError("");
      try {
        const text = await extractTextFromFile(file);
        if (!text.trim()) {
          setError("No text could be extracted from this file.");
          return;
        }
        goToExtract(text, file.name, getFileTypeLabel(file.name));
      } catch (err) {
        setError(`Extraction failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [goToExtract],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handlePasteSubmit = useCallback(() => {
    if (!pasteText.trim()) {
      setError("Please paste some text containing songs.");
      return;
    }
    goToExtract(pasteText.trim(), "Pasted text", "Text");
    setPasteText("");
    setPasting(false);
  }, [pasteText, goToExtract]);

  // ── Song editing ─────────────────────────────────────────────────────────

  const toggleSong = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === songs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(songs.map((_, i) => i)));
    }
  }, [songs, selected.size]);

  const removeSong = useCallback(
    (idx: number) => {
      setSongs((prev) => prev.filter((_, i) => i !== idx));
      setSelected((prev) => {
        const next = new Set<number>();
        for (const s of prev) {
          if (s < idx) next.add(s);
          else if (s > idx) next.add(s - 1);
        }
        return next;
      });
    },
    [],
  );

  const editTitle = useCallback((idx: number, newTitle: string) => {
    setSongs((prev) => prev.map((s, i) => (i === idx ? { ...s, title: newTitle } : s)));
  }, []);

  // ── Import ───────────────────────────────────────────────────────────────

  const isCCC = detection?.pattern === "ccc";
  const selectedSongs = songs.filter((_, i) => selected.has(i));

  const handleImport = useCallback(async () => {
    if (selectedSongs.length === 0) return;

    setImporting(true);
    setStep("importing");
    setProgress({ imported: 0, total: selectedSongs.length });

    try {
      if (isCCC) {
        // CCC path — use existing bilingual import with language mode
        const cccHymns = parseBilingualHymns(rawText);
        // Filter to only selected songs by matching titles
        const selectedTitles = new Set(selectedSongs.map((s) => s.title));
        const filtered = cccHymns.filter((h) => selectedTitles.has(h.title));
        await bulkImportHymns(filtered, languageMode, (imported, total) => {
          setProgress({ imported, total });
        });
      } else {
        // Generic path — use new import service
        await importDetectedSongs(selectedSongs, (imported, total) => {
          setProgress({ imported, total });
        });
      }
      setStep("done");
      onImported();
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setStep("preview");
    } finally {
      setImporting(false);
    }
  }, [selectedSongs, isCCC, rawText, languageMode, onImported]);

  // ── Step index for indicator ─────────────────────────────────────────────

  const stepOrder: Step[] = ["pick", "extract", "detect", "preview", "importing"];
  const stepIdx = stepOrder.indexOf(step);

  // ── Stats ────────────────────────────────────────────────────────────────

  const textStats = useMemo(() => {
    if (!rawText) return null;
    return {
      chars: rawText.length,
      words: wordCount(rawText),
      lines: rawText.split("\n").length,
    };
  }, [rawText]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bulk-import-backdrop" onMouseDown={importing ? undefined : onClose}>
      <div
        ref={dialogRef}
        className="bulk-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Bulk import songs"
        onKeyDown={handleKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bulk-import-header">
          <div className="bulk-import-header-text">
            <p className="bulk-import-eyebrow">Bulk Import</p>
            <h2>Import Songs</h2>
            <p>Import songs from PDF, TXT, DOCX files, or pasted text.</p>
          </div>
          <button
            type="button"
            className="bulk-import-close"
            aria-label="Close"
            onClick={onClose}
            disabled={importing}
            title="Close">
            x
          </button>
        </div>

        {/* Step indicator */}
        {step !== "done" && (
          <div className="bulk-import-steps">
            {stepOrder.map((s, i) => (
              <span key={s} className="bulk-import-step-group">
                {i > 0 && <div className="bulk-import-step-divider" />}
                <div
                  className={`bulk-import-step${i === stepIdx ? " active" : i < stepIdx ? " done" : ""}`}
                >
                  <span className="bulk-import-step-num">{i + 1}</span>
                  <span>{STEP_LABELS[s]}</span>
                </div>
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="bulk-import-body">
          {/* ── Step 1: Pick ─────────────────────────────────────────────── */}
          {step === "pick" && (
            <>
              <div
                className="bulk-import-dropzone"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => !pasting && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx"
                  className="bulk-import-file-input"
                  onChange={handleFileInput}
                />
                <Icon name="upload_file" size={32} />
                <p className="bulk-import-dropzone-title">
                  {pasting ? "Switch to file upload" : "Drop a file here or click to browse"}
                </p>
                <p className="bulk-import-dropzone-hint">
                  {pasting
                    ? "Click to switch back to file upload"
                    : "Supports PDF, TXT, and DOCX files"}
                </p>
              </div>

              <div className="bulk-import-paste-toggle">
                <button
                  type="button"
                  className="bulk-import-paste-toggle-btn"
                  onClick={() => {
                    setPasting((p) => !p);
                    setError("");
                  }}
                  title="Upload">
                  <Icon name={pasting ? "description" : "content_paste"} size={14} />
                  {pasting ? "Upload a file instead" : "Or paste text"}
                </button>
              </div>

              {pasting && (
                <div className="bulk-import-paste-area">
                  <textarea
                    ref={textareaRef}
                    className="bulk-import-paste-textarea"
                    style={{ fontFamily: '"Charis SIL", "SF Mono", "Noto Sans Mono", monospace' }}
                    placeholder="Paste song lyrics here...&#10;&#10;1. Amazing Grace&#10;Amazing grace how sweet the sound&#10;That saved a wretch like me&#10;&#10;2. How Great Thou Art&#10;O Lord my God when I in awesome wonder"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={10}
                    autoFocus
                  />
                  <div className="bulk-import-paste-actions">
                    <button
                      type="button"
                      className="bulk-import-btn-secondary"
                      onClick={() => {
                        setPasting(false);
                        setPasteText("");
                        setError("");
                      }}
                      title="Cancel">
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="bulk-import-btn-primary"
                      disabled={!pasteText.trim()}
                      onClick={handlePasteSubmit}
                      title="Extract Songs">
                      Extract Songs
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Extract ──────────────────────────────────────────── */}
          {step === "extract" && (
            <>
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

              <div className="bulk-import-text-preview">
                <pre style={{ fontFamily: '"Charis SIL", "SF Mono", "Noto Sans Mono", monospace' }}>{rawText}</pre>
              </div>

              <p className="bulk-import-extract-hint">
                Review the extracted text above. If it looks correct, proceed to detect songs.
              </p>
            </>
          )}

          {/* ── Step 3: Detect ───────────────────────────────────────────── */}
          {step === "detect" && detection && (
            <>
              <div className="bulk-import-detect-result">
                <div className="bulk-import-detect-row">
                  <span className="bulk-import-detect-label">Pattern</span>
                  <span className={`bulk-import-detect-badge bulk-import-detect-badge--${detection.pattern}`}>
                    {detection.pattern === "ccc"
                      ? "CCC Hymnal"
                      : detection.pattern === "numbered"
                        ? "Numbered Songs"
                        : "Titled Songs"}
                  </span>
                </div>
                <div className="bulk-import-detect-row">
                  <span className="bulk-import-detect-label">Confidence</span>
                  <div className="bulk-import-confidence-bar">
                    <div
                      className="bulk-import-confidence-fill"
                      style={{
                        width: `${detection.confidence}%`,
                        background:
                          detection.confidence >= 60
                            ? "var(--primary)"
                            : detection.confidence >= 30
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    />
                  </div>
                  <span className="bulk-import-confidence-num">{detection.confidence}%</span>
                </div>
                <div className="bulk-import-detect-row">
                  <span className="bulk-import-detect-label">Songs found</span>
                  <span className="bulk-import-detect-count">{detection.songs.length}</span>
                </div>
              </div>

              {detection.songs.length < 2 && (
                <div className="bulk-import-detect-warn">
                  <Icon name="warning" size={16} />
                  <span>Only {detection.songs.length} song{detection.songs.length !== 1 ? "s" : ""} detected. The results may be incomplete.</span>
                </div>
              )}

              {detection.confidence < 40 && detection.songs.length >= 2 && (
                <div className="bulk-import-detect-warn">
                  <Icon name="info" size={16} />
                  <span>Low confidence detection. Review the preview carefully.</span>
                </div>
              )}
            </>
          )}

          {/* ── Step 4: Preview ──────────────────────────────────────────── */}
          {step === "preview" && (
            <>
              <div className="bulk-import-preview-header">
                <span className="bulk-import-file-badge">
                  <Icon name="description" size={14} />
                  {fileName}
                  <span className="bulk-import-file-type">{fileType}</span>
                </span>
                <span className="bulk-import-count">
                  {songs.length} song{songs.length !== 1 ? "s" : ""} detected
                </span>
                <label className="bulk-import-select-all">
                  <input
                    type="checkbox"
                    checked={selected.size === songs.length && songs.length > 0}
                    onChange={toggleAll}
                  />
                  Select all
                </label>
              </div>

              <div className="bulk-import-song-list">
                {songs.map((song, idx) => (
                  <div
                    key={`${song.title}-${idx}`}
                    className={`bulk-import-song-card${selected.has(idx) ? " selected" : ""}`}
                  >
                    <div className="bulk-import-song-card-left">
                      <input
                        type="checkbox"
                        checked={selected.has(idx)}
                        onChange={() => toggleSong(idx)}
                        className="bulk-import-song-card-check"
                      />
                    </div>
                    <div className="bulk-import-song-card-body">
                      <div className="bulk-import-song-card-title-row">
                        <input
                          type="text"
                          className="bulk-import-song-card-title"
                          value={song.title}
                          onChange={(e) => editTitle(idx, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {song.language && (
                          <span className={`bulk-import-lang-badge bulk-import-lang-badge--${song.language}`}>
                            {song.language}
                          </span>
                        )}
                        <span className="bulk-import-slide-count">
                          ~{estimateSlideCount(song.lyrics)} slides
                        </span>
                      </div>
                      <p className="bulk-import-song-card-preview">
                        {firstNLines(song.lyrics, 4)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="bulk-import-song-card-remove"
                      title="Remove song"
                      onClick={() => removeSong(idx)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* CCC language mode */}
              {isCCC && (
                <div className="bulk-import-mode-section">
                  <p className="bulk-import-mode-label">Language handling</p>
                  <div className="bulk-import-mode-options">
                    {LANGUAGE_MODES.map((mode) => (
                      <label
                        key={mode.value}
                        className={`bulk-import-mode-option${languageMode === mode.value ? " active" : ""}`}
                      >
                        <input
                          type="radio"
                          name="language-mode"
                          value={mode.value}
                          checked={languageMode === mode.value}
                          onChange={() => setLanguageMode(mode.value)}
                        />
                        <div>
                          <span className="bulk-import-mode-title">{mode.label}</span>
                          <span className="bulk-import-mode-desc">{mode.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 5: Importing ────────────────────────────────────────── */}
          {step === "importing" && (
            <div className="bulk-import-progress">
              <div className="bulk-import-progress-bar">
                <div
                  className="bulk-import-progress-fill"
                  style={{
                    width: `${progress.total > 0 ? (progress.imported / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="bulk-import-progress-text">
                Importing {progress.imported} of {progress.total} songs…
              </p>
            </div>
          )}

          {/* ── Step 6: Done ─────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="bulk-import-done">
              <Icon name="check_circle" size={40} />
              <p className="bulk-import-done-title">Import complete</p>
              <p className="bulk-import-done-text">
                {selected.size} song{selected.size !== 1 ? "s" : ""} added to your worship library.
              </p>
            </div>
          )}

          {/* Error */}
          {error && <div className="bulk-import-error">{error}</div>}
        </div>

        {/* Footer */}
        <div className="bulk-import-footer">
          <button
            type="button"
            className="bulk-import-btn-secondary"
            onClick={
              step === "extract"
                ? () => setStep("pick")
                : step === "detect"
                  ? () => setStep("extract")
                  : step === "preview"
                    ? () => setStep("detect")
                    : onClose
            }
            disabled={importing}
            title="Close">
            {step === "done" ? "Close" : "Back"}
          </button>

          {step === "extract" && (
            <button type="button" className="bulk-import-btn-primary" onClick={goToDetect} title="Detect Songs →">
              Detect Songs →
            </button>
          )}

          {step === "detect" && (
            <button
              type="button"
              className="bulk-import-btn-primary"
              disabled={songs.length === 0}
              onClick={goToPreview}
              title="Review Song →">
              Review {songs.length} Song{songs.length !== 1 ? "s" : ""} →
            </button>
          )}

          {step === "preview" && (
            <button
              type="button"
              className="bulk-import-btn-primary"
              disabled={selected.size === 0}
              onClick={handleImport}
              title="Import">
              Import {selected.size} Song{selected.size !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
