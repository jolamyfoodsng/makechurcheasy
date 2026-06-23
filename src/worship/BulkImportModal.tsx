/**
 * BulkImportModal.tsx — Multi-step modal for importing bilingual hymns from PDF
 *
 * Steps:
 *   1. Pick PDF file
 *   2. Preview parsed hymns (select/deselect)
 *   3. Choose language mode
 *   4. Import
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Icon from "../components/Icon";
import {
  extractPdfText,
  parseBilingualHymns,
  bulkImportHymns,
  type ParsedHymn,
  type LanguageMode,
} from "./pdfImportService";
import "./bulkImportModal.css";

interface BulkImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

type Step = "pick" | "preview" | "importing" | "done";

function firstN(text: string, n: number): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const preview = lines.slice(0, n).join("\n");
  if (lines.length > n) return preview + "\n…";
  return preview;
}

const LANGUAGE_MODES: { value: LanguageMode; label: string; description: string }[] = [
  {
    value: "two-songs",
    label: "Two songs per hymn",
    description: "Each hymn becomes two songs — one in Yoruba, one in English. Filter by language in the sidebar.",
  },
  {
    value: "single-both",
    label: "Single song, both languages",
    description: "Each hymn is one song with [Yoruba] and [English] sections in the lyrics.",
  },
  {
    value: "side-by-side",
    label: "Side-by-side slides",
    description: "Each slide shows the Yoruba line followed by the English translation.",
  },
];

export function BulkImportModal({ onClose, onImported }: BulkImportModalProps) {
  const [step, setStep] = useState<Step>("pick");
  const [hymns, setHymns] = useState<ParsedHymn[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [languageMode, setLanguageMode] = useState<LanguageMode>("two-songs");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ imported: 0, total: 0 });
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { previousFocusRef.current?.focus(); };
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !importing) {
      event.preventDefault();
      onClose();
    }
  }, [importing, onClose]);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setFileName(file.name);
    try {
      const text = await extractPdfText(file);
      const parsed = parseBilingualHymns(text);
      if (parsed.length === 0) {
        setError("No hymns found in this PDF. Make sure it's a CCC hymnal with 'Orin N' / 'Hymn N' headers.");
        return;
      }
      setHymns(parsed);
      setSelected(new Set(parsed.map((_, i) => i)));
      setStep("preview");
    } catch (err) {
      setError(`Failed to extract text: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const toggleHymn = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === hymns.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(hymns.map((_, i) => i)));
    }
  }, [hymns, selected.size]);

  const handleImport = useCallback(async () => {
    const selectedHymns = hymns.filter((_, i) => selected.has(i));
    if (selectedHymns.length === 0) return;

    setImporting(true);
    setStep("importing");
    setProgress({ imported: 0, total: selectedHymns.length });

    try {
      await bulkImportHymns(selectedHymns, languageMode, (imported, total) => {
        setProgress({ imported, total });
      });
      setStep("done");
      onImported();
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setStep("preview");
    } finally {
      setImporting(false);
    }
  }, [hymns, selected, languageMode, onImported]);

  const selectedCount = selected.size;

  return (
    <div className="bulk-import-backdrop" onMouseDown={importing ? undefined : onClose}>
      <div
        ref={dialogRef}
        className="bulk-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Bulk import hymns from PDF"
        onKeyDown={handleKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bulk-import-header">
          <div className="bulk-import-header-text">
            <p className="bulk-import-eyebrow">Bulk Import</p>
            <h2>Import Hymns from PDF</h2>
            <p>Load a bilingual hymnal PDF and import all hymns at once.</p>
          </div>
          <button
            type="button"
            className="bulk-import-close"
            aria-label="Close"
            onClick={onClose}
            disabled={importing}
          >
            x
          </button>
        </div>

        {/* Step indicator */}
        {step !== "done" && (() => {
          const stepIdx = step === "pick" ? 0 : step === "preview" ? 1 : 2;
          return (
            <div className="bulk-import-steps">
              <div className={`bulk-import-step${stepIdx === 0 ? " active" : " done"}`}>
                <span className="bulk-import-step-num">1</span>
                <span>Pick PDF</span>
              </div>
              <div className="bulk-import-step-divider" />
              <div className={`bulk-import-step${stepIdx === 1 ? " active" : stepIdx > 1 ? " done" : ""}`}>
                <span className="bulk-import-step-num">2</span>
                <span>Review &amp; Mode</span>
              </div>
              <div className="bulk-import-step-divider" />
              <div className={`bulk-import-step${stepIdx === 2 ? " active" : ""}`}>
                <span className="bulk-import-step-num">3</span>
                <span>Import</span>
              </div>
            </div>
          );
        })()}

        {/* Content */}
        <div className="bulk-import-body">
          {/* Step 1: Pick file */}
          {step === "pick" && (
            <div
              className="bulk-import-dropzone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="bulk-import-file-input"
                onChange={handleFileInput}
              />
              <Icon name="upload_file" size={32} />
              <p className="bulk-import-dropzone-title">Drop a PDF here or click to browse</p>
              <p className="bulk-import-dropzone-hint">Supports CCC hymnals and similar bilingual PDFs</p>
            </div>
          )}

          {/* Step 2: Preview + language mode */}
          {step === "preview" && (
            <>
              <div className="bulk-import-preview-header">
                <span className="bulk-import-file-badge">
                  <Icon name="description" size={14} />
                  {fileName}
                </span>
                <span className="bulk-import-count">
                  {hymns.length} hymn{hymns.length !== 1 ? "s" : ""} found
                </span>
                <label className="bulk-import-select-all">
                  <input
                    type="checkbox"
                    checked={selected.size === hymns.length && hymns.length > 0}
                    onChange={toggleAll}
                  />
                  Select all
                </label>
              </div>

              <div className="bulk-import-hymn-list">
                {hymns.map((hymn, idx) => (
                  <label key={hymn.id} className={`bulk-import-hymn-card${selected.has(idx) ? " selected" : ""}`}>
                    <div className="bulk-import-hymn-card-check">
                      <input
                        type="checkbox"
                        checked={selected.has(idx)}
                        onChange={() => toggleHymn(idx)}
                      />
                    </div>
                    <div className="bulk-import-hymn-card-head">
                      <span className="bulk-import-hymn-card-num">Hymn {hymn.number}</span>
                      {hymn.sectionLabel && (
                        <span className="bulk-import-hymn-card-section">{hymn.sectionLabel}</span>
                      )}
                    </div>
                    <div className="bulk-import-hymn-card-columns">
                      {hymn.yoruba && (
                        <div className="bulk-import-hymn-card-col bulk-import-hymn-card-col--yoruba">
                          <span className="bulk-import-hymn-card-lang-label">Yoruba</span>
                          <p className="bulk-import-hymn-card-lyrics">{firstN(hymn.yoruba, 6)}</p>
                        </div>
                      )}
                      {hymn.english && (
                        <div className="bulk-import-hymn-card-col bulk-import-hymn-card-col--english">
                          <span className="bulk-import-hymn-card-lang-label">English</span>
                          <p className="bulk-import-hymn-card-lyrics">{firstN(hymn.english, 6)}</p>
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>

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
            </>
          )}

          {/* Step 3: Importing */}
          {step === "importing" && (
            <div className="bulk-import-progress">
              <div className="bulk-import-progress-bar">
                <div
                  className="bulk-import-progress-fill"
                  style={{ width: `${progress.total > 0 ? (progress.imported / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="bulk-import-progress-text">
                Importing {progress.imported} of {progress.total} songs…
              </p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && (
            <div className="bulk-import-done">
              <Icon name="check_circle" size={40} />
              <p className="bulk-import-done-title">Import complete</p>
              <p className="bulk-import-done-text">
                {selectedCount} song{selectedCount !== 1 ? "s" : ""} added to your worship library.
              </p>
            </div>
          )}

          {error && (
            <div className="bulk-import-error">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bulk-import-footer">
          <button
            type="button"
            className="bulk-import-btn-secondary"
            onClick={onClose}
            disabled={importing}
          >
            {step === "done" ? "Close" : "Cancel"}
          </button>
          {step === "preview" && (
            <button
              type="button"
              className="bulk-import-btn-primary"
              disabled={selectedCount === 0}
              onClick={handleImport}
            >
              Import {selectedCount} Hymn{selectedCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
