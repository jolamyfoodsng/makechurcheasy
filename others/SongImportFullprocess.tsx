import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  FileSearch,
  FileText,
  FileUp,
  Loader2,
  Music2,
  Plus,
  RefreshCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  assessExtractedTextQuality,
  extractTextFromFile,
  getFileTypeLabel,
  normalizeExtractedLyricsText,
  type ExtractedTextQuality,
} from "../src/worship/bulkImportService";
import { processDocumentViaApi } from "../src/worship/bulkImportAiService";
import {
  createEmptyImportSection,
  estimateDraftSlideCount,
  importSmartSongs,
} from "../src/worship/smartImportService";
import { parseWorshipLyricSections } from "../src/worship/slideEngine";
import type {
  SmartImportSectionDraft,
  SmartImportSongDraft,
} from "../src/worship/smartImportTypes";
import "./SongimportFullprocess.css";

type ImportStep = "pick" | "review" | "importing" | "done";
type SourceMode = "file" | "text";

interface SongImportFullprocessProps {
  onClose: () => void;
  onImported: () => void;
}

interface EditableImportSongDraft extends SmartImportSongDraft {
  enabled: boolean;
}

interface LocalDetectedSong {
  title: string;
  lyrics: string;
  hymnNumber?: string;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractNumber(value: string): string | undefined {
  const match = value.match(/\b(\d+|[ivxlcdm]+)\b/i);
  return match?.[1];
}

function toSectionDrafts(lyrics: string): SmartImportSectionDraft[] {
  const normalized = normalizeExtractedLyricsText(lyrics);
  const parsed = parseWorshipLyricSections(normalized, 2);
  if (parsed.length === 0) {
    return [{
      ...createEmptyImportSection("verse"),
      content: normalized,
    }];
  }

  return parsed.map((section, index) => ({
    id: uid(`import-section-${index + 1}`),
    type: section.type,
    label: section.label,
    number: extractNumber(section.label),
    content: section.lines.join("\n"),
    warnings: [],
  }));
}

function defaultSongTitle(sourceName: string, index = 0): string {
  const base = sourceName.replace(/\.[^.]+$/, "").trim() || "Imported Song";
  return index > 0 ? `${base} ${index + 1}` : base;
}

function buildDraftFromLyrics(
  title: string,
  lyrics: string,
  sourceName: string,
  index = 0,
  hymnNumber?: string,
): SmartImportSongDraft {
  const normalizedLyrics = normalizeExtractedLyricsText(lyrics);
  return {
    id: uid(`import-song-${index + 1}`),
    title: title.trim() || defaultSongTitle(sourceName, index),
    artist: "",
    hymnNumber: hymnNumber?.trim() || undefined,
    language: undefined,
    method: "fallback",
    warnings: [],
    reviewNotes: [],
    rawExcerpt: normalizedLyrics.slice(0, 2400),
    sections: toSectionDrafts(normalizedLyrics),
  };
}

function detectNumberedSongs(text: string, sourceName: string): LocalDetectedSong[] {
  const lines = text.split("\n");
  const boundaries: Array<{ index: number; title: string; hymnNumber?: string }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    let match = line.match(/^(?:song|hymn|orin)\s+(\d{1,4})(?:[.: -]+(.+))?$/i);
    if (match) {
      boundaries.push({
        index,
        hymnNumber: match[1],
        title: match[2]?.trim() || `Hymn ${match[1]}`,
      });
      continue;
    }

    match = line.match(/^(\d{1,4})[.)-]\s+(.+)$/);
    if (match) {
      boundaries.push({
        index,
        hymnNumber: match[1],
        title: match[2].trim() || `Song ${match[1]}`,
      });
      continue;
    }

    match = line.match(/^(\d{1,4})$/);
    if (match) {
      const nextLine = lines[index + 1]?.trim() ?? "";
      boundaries.push({
        index,
        hymnNumber: match[1],
        title: nextLine && nextLine.length <= 90 ? nextLine : `Hymn ${match[1]}`,
      });
    }
  }

  if (boundaries.length < 2) {
    return [];
  }

  const songs: LocalDetectedSong[] = [];
  for (let i = 0; i < boundaries.length; i += 1) {
    const start = boundaries[i];
    const endIndex = i + 1 < boundaries.length ? boundaries[i + 1].index : lines.length;
    const bodyStart = lines[start.index + 1]?.trim() === start.title ? start.index + 2 : start.index + 1;
    const lyrics = lines
      .slice(bodyStart, endIndex)
      .join("\n")
      .trim();

    if (!lyrics) continue;

    songs.push({
      title: start.title || defaultSongTitle(sourceName, i),
      lyrics,
      hymnNumber: start.hymnNumber,
    });
  }

  return songs.filter((song) => song.lyrics.trim().length > 0);
}

function isTitleCandidate(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() ?? "";
  if (!line || line.length > 90) return false;
  if (/^\d{1,4}$/.test(line)) return false;
  if (/^(?:song|hymn|orin)\s+\d{1,4}/i.test(line)) return false;
  if (/^(?:verse|chorus|bridge|tag|intro|outro|pre-chorus|refrain)\b/i.test(line)) return false;
  const next = lines[index + 1]?.trim() ?? "";
  return next === "";
}

function detectTitledSongs(text: string, sourceName: string): LocalDetectedSong[] {
  const lines = text.split("\n");
  const songs: LocalDetectedSong[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!isTitleCandidate(lines, index)) {
      index += 1;
      continue;
    }

    const title = lines[index].trim();
    let cursor = index + 2;
    const lyricsLines: string[] = [];
    let lyricCount = 0;

    while (cursor < lines.length) {
      if (isTitleCandidate(lines, cursor) && lyricCount >= 2) {
        break;
      }

      const line = lines[cursor];
      if (line.trim()) {
        lyricCount += 1;
      }
      lyricsLines.push(line);
      cursor += 1;
    }

    const lyrics = lyricsLines.join("\n").trim();
    if (lyrics && lyricCount >= 2) {
      songs.push({
        title: title || defaultSongTitle(sourceName, songs.length),
        lyrics,
      });
      index = cursor;
      continue;
    }

    index += 1;
  }

  return songs;
}

function detectSongsLocally(text: string, sourceName: string): {
  songs: LocalDetectedSong[];
  warning: string;
} {
  const numbered = detectNumberedSongs(text, sourceName);
  if (numbered.length > 1) {
    return {
      songs: numbered,
      warning: `API structuring was unavailable. Local detection found ${numbered.length} songs from numbered headings.`,
    };
  }

  const titled = detectTitledSongs(text, sourceName);
  if (titled.length > 1) {
    return {
      songs: titled,
      warning: `API structuring was unavailable. Local detection found ${titled.length} titled songs.`,
    };
  }

  return {
    songs: [{
      title: defaultSongTitle(sourceName),
      lyrics: text,
    }],
    warning: "API structuring was unavailable. The document is loaded as one song for review.",
  };
}

function sanitizeDraftsForImport(drafts: EditableImportSongDraft[]): SmartImportSongDraft[] {
  return drafts
    .filter((draft) => draft.enabled)
    .map((draft) => ({
      ...draft,
      title: draft.title.trim(),
      artist: draft.artist?.trim() || "",
      hymnNumber: draft.hymnNumber?.trim() || undefined,
      sections: draft.sections
        .map((section) => ({
          ...section,
          label: section.label.trim(),
          number: section.number?.trim() || undefined,
          content: normalizeExtractedLyricsText(section.content),
          warnings: section.warnings ?? [],
        }))
        .filter((section) => section.content.trim().length > 0),
    }))
    .filter((draft) => draft.title.length > 0 && draft.sections.length > 0);
}

export default function SongImportFullprocess({
  onClose,
  onImported,
}: SongImportFullprocessProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("pick");
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [sourceName, setSourceName] = useState("Imported Document");
  const [drafts, setDrafts] = useState<EditableImportSongDraft[]>([]);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [quality, setQuality] = useState<ExtractedTextQuality | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("Preparing import...");
  const [importProgress, setImportProgress] = useState({ saved: 0, total: 0 });
  const [importedTitles, setImportedTitles] = useState<string[]>([]);

  const activeSong = useMemo(
    () => drafts.find((draft) => draft.id === activeSongId) ?? drafts[0] ?? null,
    [activeSongId, drafts],
  );

  const enabledCount = useMemo(
    () => drafts.filter((draft) => draft.enabled).length,
    [drafts],
  );

  const handleReset = () => {
    setStep("pick");
    setSelectedFile(null);
    setPastedText("");
    setSourceName("Imported Document");
    setDrafts([]);
    setActiveSongId(null);
    setQuality(null);
    setWarnings([]);
    setError("");
    setLoadingLabel("Preparing import...");
    setImportProgress({ saved: 0, total: 0 });
    setImportedTitles([]);
  };

  const handleDetectSongs = async () => {
    setError("");
    setWarnings([]);

    try {
      setStep("importing");
      setLoadingLabel("Extracting text...");

      const resolvedSourceName = sourceMode === "file"
        ? selectedFile?.name || "Imported Document"
        : "Pasted Lyrics";

      const rawText = sourceMode === "file"
        ? await extractTextFromFile(selectedFile as File)
        : normalizeExtractedLyricsText(pastedText);

      const normalizedText = normalizeExtractedLyricsText(rawText);
      if (!normalizedText.trim()) {
        throw new Error("No text was found. Upload a file with readable lyrics or paste the text directly.");
      }

      const textQuality = assessExtractedTextQuality(normalizedText);
      const nextWarnings: string[] = [];
      if (!textQuality.usable) {
        nextWarnings.push("The extracted text looks noisy. Review titles and lyrics carefully before importing.");
      }

      setQuality(textQuality);
      setSourceName(resolvedSourceName);
      setLoadingLabel("Structuring songs...");

      let processedSongs: SmartImportSongDraft[] = [];

      try {
        const apiResult = await processDocumentViaApi(normalizedText, resolvedSourceName);
        processedSongs = apiResult.songs;
        nextWarnings.push(...apiResult.warnings);
      } catch (apiError) {
        const fallback = detectSongsLocally(normalizedText, resolvedSourceName);
        processedSongs = fallback.songs.map((song, index) =>
          buildDraftFromLyrics(song.title, song.lyrics, resolvedSourceName, index, song.hymnNumber),
        );

        const message = apiError instanceof Error ? apiError.message : String(apiError);
        nextWarnings.push(fallback.warning);
        nextWarnings.push(`AI import service error: ${message}`);
      }

      if (processedSongs.length === 0) {
        processedSongs = [buildDraftFromLyrics(defaultSongTitle(resolvedSourceName), normalizedText, resolvedSourceName)];
      }

      const editableDrafts = processedSongs.map((draft) => ({
        ...draft,
        enabled: true,
        title: draft.title.trim() || defaultSongTitle(resolvedSourceName),
        sections: draft.sections.length > 0 ? draft.sections : toSectionDrafts(normalizedText),
      }));

      setDrafts(editableDrafts);
      setActiveSongId(editableDrafts[0]?.id ?? null);
      setWarnings(nextWarnings);
      setStep("review");
    } catch (detectError) {
      setError(detectError instanceof Error ? detectError.message : String(detectError));
      setStep("pick");
    }
  };

  const handleImport = async () => {
    setError("");

    const sanitizedDrafts = sanitizeDraftsForImport(drafts);
    if (sanitizedDrafts.length === 0) {
      setError("Select at least one song with a title and lyrics before importing.");
      return;
    }

    try {
      setStep("importing");
      setLoadingLabel("Saving songs to your worship library...");
      setImportProgress({ saved: 0, total: sanitizedDrafts.length });

      const imported = await importSmartSongs(
        sanitizedDrafts,
        { sourceName },
        (saved, total) => setImportProgress({ saved, total }),
      );

      setImportedTitles(imported.map((song) => song.metadata.title));
      onImported();
      setStep("done");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
      setStep("review");
    }
  };

  const updateSong = (songId: string, updater: (draft: EditableImportSongDraft) => EditableImportSongDraft) => {
    setDrafts((current) => current.map((draft) => (draft.id === songId ? updater(draft) : draft)));
  };

  const updateActiveSection = (
    songId: string,
    sectionId: string,
    field: "label" | "type" | "content",
    value: string,
  ) => {
    updateSong(songId, (draft) => ({
      ...draft,
      sections: draft.sections.map((section) => {
        if (section.id !== sectionId) return section;
        if (field === "type") {
          return { ...section, type: value as SmartImportSectionDraft["type"] };
        }
        return { ...section, [field]: value };
      }),
    }));
  };

  const activeSongLyricsPreview = useMemo(() => {
    if (!activeSong) return "";
    return activeSong.sections
      .map((section) => [section.label, section.content].filter(Boolean).join("\n"))
      .join("\n\n");
  }, [activeSong]);

  return (
    <div className="song-import-modal-backdrop" onMouseDown={step === "importing" ? undefined : onClose}>
      <div
        className="song-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Bulk import songs"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="song-import-modal__header">
          <div>
            <p className="song-import-modal__eyebrow">Worship</p>
            <h2>Bulk Import Songs</h2>
            <p className="song-import-modal__description">
              Use this screen for document import only. Add Song and online lyrics stay in their own flows.
            </p>
          </div>

          <div className="song-import-modal__header-actions">
            {step === "review" && (
              <button
                type="button"
                className="song-import-btn song-import-btn--secondary"
                onClick={handleReset}
                title="Start over"
              >
                <RefreshCcw size={16} />
                Start Over
              </button>
            )}
            <button
              type="button"
              className="song-import-modal__close"
              onClick={onClose}
              title="Close"
              aria-label="Close bulk import"
              disabled={step === "importing"}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="song-import-steps">
          <div className={`song-import-step${step === "pick" ? " is-active" : ""}`}>1. Pick</div>
          <div className={`song-import-step${step === "review" ? " is-active" : ""}`}>2. Review</div>
          <div className={`song-import-step${step === "importing" ? " is-active" : ""}`}>3. Import</div>
          <div className={`song-import-step${step === "done" ? " is-active" : ""}`}>4. Done</div>
        </div>

        {error && (
          <div className="song-import-alert song-import-alert--error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {step === "pick" && (
          <section className="song-import-pick">
            <div className="song-import-pick__workspace">
              <div className="song-import-source-tabs">
                <button
                  type="button"
                  className={`song-import-source-tab${sourceMode === "file" ? " is-active" : ""}`}
                  onClick={() => setSourceMode("file")}
                >
                  <FileUp size={16} />
                  File Upload
                </button>
                <button
                  type="button"
                  className={`song-import-source-tab${sourceMode === "text" ? " is-active" : ""}`}
                  onClick={() => setSourceMode("text")}
                >
                  <ClipboardPaste size={16} />
                  Paste Text
                </button>
              </div>

              {sourceMode === "file" ? (
                <div
                  className="song-import-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0];
                    if (!file) return;
                    setSelectedFile(file);
                    setError("");
                  }}
                >
                  <input
                    ref={fileInputRef}
                    className="song-import-hidden-input"
                    type="file"
                    accept=".pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setSelectedFile(file);
                      setError("");
                    }}
                  />
                  <Upload size={28} />
                  <h3>{selectedFile ? selectedFile.name : "Drop a PDF, DOCX, or TXT file here"}</h3>
                  <p>
                    {selectedFile
                      ? `${getFileTypeLabel(selectedFile.name)} ready for extraction`
                      : "Click to browse or drag a file into the import area."}
                  </p>
                </div>
              ) : (
                <div className="song-import-paste">
                  <label htmlFor="song-import-text">Paste lyrics or hymn text</label>
                  <textarea
                    id="song-import-text"
                    value={pastedText}
                    onChange={(event) => setPastedText(event.target.value)}
                    placeholder="Paste one song or many songs here."
                  />
                </div>
              )}
            </div>

            <aside className="song-import-pick__sidebar">
              <div className="song-import-side-card">
                <div className="song-import-side-card__icon">
                  <FileSearch size={18} />
                </div>
                <div>
                  <h3>What happens next</h3>
                  <p>Text is extracted, songs are detected, then you review titles and lyrics before anything is saved.</p>
                </div>
              </div>

              <div className="song-import-side-card">
                <div className="song-import-side-card__icon">
                  <Music2 size={18} />
                </div>
                <div>
                  <h3>Only for bulk import</h3>
                  <p>This screen is now reserved for document and pasted-text imports. Manual add and online lyrics use their own screens.</p>
                </div>
              </div>
            </aside>
          </section>
        )}

        {step === "review" && activeSong && (
          <section className="song-import-review">
            <div className="song-import-review__summary">
              <div className="song-import-summary-card">
                <span className="song-import-summary-card__label">Source</span>
                <strong>{sourceName}</strong>
              </div>
              <div className="song-import-summary-card">
                <span className="song-import-summary-card__label">Detected</span>
                <strong>{drafts.length} song{drafts.length === 1 ? "" : "s"}</strong>
              </div>
              <div className="song-import-summary-card">
                <span className="song-import-summary-card__label">Importing</span>
                <strong>{enabledCount} selected</strong>
              </div>
              <div className="song-import-summary-card">
                <span className="song-import-summary-card__label">Text Quality</span>
                <strong>{quality ? `${quality.score}/100` : "--"}</strong>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="song-import-alert song-import-alert--warning">
                <AlertCircle size={18} />
                <div>
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="song-import-review__body">
              <aside className="song-import-review__list">
                {drafts.map((draft) => {
                  const slideCount = estimateDraftSlideCount(draft, { linesPerSlide: 2, autoSplit: true });
                  return (
                    <button
                      key={draft.id}
                      type="button"
                      className={`song-import-song-tile${draft.id === activeSong.id ? " is-active" : ""}`}
                      onClick={() => setActiveSongId(draft.id)}
                    >
                      <div className="song-import-song-tile__head">
                        <label
                          className="song-import-checkbox"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(event) => {
                              updateSong(draft.id, (current) => ({ ...current, enabled: event.target.checked }));
                            }}
                          />
                          <span>{draft.enabled ? "Import" : "Skip"}</span>
                        </label>
                        <button
                          type="button"
                          className="song-import-icon-btn"
                          title="Remove from batch"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDrafts((current) => {
                              const next = current.filter((item) => item.id !== draft.id);
                              if (draft.id === activeSongId) {
                                setActiveSongId(next[0]?.id ?? null);
                              }
                              return next;
                            });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <strong>{draft.title || "Untitled song"}</strong>
                      <span>{draft.sections.length} sections</span>
                      <span>{slideCount} slides</span>
                    </button>
                  );
                })}
              </aside>

              <div className="song-import-review__editor">
                <div className="song-import-editor-grid">
                  <label>
                    <span>Song title</span>
                    <input
                      value={activeSong.title}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateSong(activeSong.id, (draft) => ({ ...draft, title: value }));
                      }}
                    />
                  </label>

                  <label>
                    <span>Artist</span>
                    <input
                      value={activeSong.artist ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateSong(activeSong.id, (draft) => ({ ...draft, artist: value }));
                      }}
                      placeholder="Optional"
                    />
                  </label>

                  <label>
                    <span>Hymn number</span>
                    <input
                      value={activeSong.hymnNumber ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateSong(activeSong.id, (draft) => ({ ...draft, hymnNumber: value }));
                      }}
                      placeholder="Optional"
                    />
                  </label>
                </div>

                <div className="song-import-sections">
                  <div className="song-import-sections__head">
                    <h3>Sections</h3>
                    <button
                      type="button"
                      className="song-import-btn song-import-btn--secondary"
                      onClick={() => {
                        updateSong(activeSong.id, (draft) => ({
                          ...draft,
                          sections: [...draft.sections, createEmptyImportSection("verse")],
                        }));
                      }}
                    >
                      <Plus size={16} />
                      Add Section
                    </button>
                  </div>

                  {activeSong.sections.map((section) => (
                    <div key={section.id} className="song-import-section-card">
                      <div className="song-import-section-card__row">
                        <input
                          value={section.label}
                          onChange={(event) => updateActiveSection(activeSong.id, section.id, "label", event.target.value)}
                          placeholder="Section label"
                        />

                        <select
                          value={section.type}
                          onChange={(event) => updateActiveSection(activeSong.id, section.id, "type", event.target.value)}
                        >
                          <option value="verse">Verse</option>
                          <option value="chorus">Chorus</option>
                          <option value="bridge">Bridge</option>
                          <option value="pre-chorus">Pre-Chorus</option>
                          <option value="tag">Tag</option>
                          <option value="intro">Intro</option>
                          <option value="outro">Outro</option>
                          <option value="other">Other</option>
                          <option value="refrain">Refrain</option>
                        </select>
                      </div>

                      <textarea
                        value={section.content}
                        onChange={(event) => updateActiveSection(activeSong.id, section.id, "content", event.target.value)}
                        placeholder="Section lyrics"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <aside className="song-import-review__preview">
                <div className="song-import-preview-card">
                  <h3>Preview</h3>
                  <pre>{activeSongLyricsPreview}</pre>
                </div>

                {quality && (
                  <div className="song-import-preview-card">
                    <h3>Extraction Stats</h3>
                    <dl className="song-import-stats">
                      <div>
                        <dt>Words</dt>
                        <dd>{quality.stats.words}</dd>
                      </div>
                      <div>
                        <dt>Lines</dt>
                        <dd>{quality.stats.lines}</dd>
                      </div>
                      <div>
                        <dt>Readable</dt>
                        <dd>{quality.stats.readableLines}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}

        {step === "importing" && (
          <section className="song-import-loading">
            <Loader2 className="song-import-loading__spinner" size={34} />
            <h3>{loadingLabel}</h3>
            <p>
              {importProgress.total > 0
                ? `${importProgress.saved} of ${importProgress.total} saved`
                : "Please wait while the document is processed."}
            </p>
            {importProgress.total > 0 && (
              <div className="song-import-progress">
                <div
                  className="song-import-progress__bar"
                  style={{
                    width: `${Math.max(8, (importProgress.saved / Math.max(importProgress.total, 1)) * 100)}%`,
                  }}
                />
              </div>
            )}
          </section>
        )}

        {step === "done" && (
          <section className="song-import-done">
            <CheckCircle2 size={42} />
            <h3>Import complete</h3>
            <p>{importedTitles.length} song{importedTitles.length === 1 ? "" : "s"} added to the worship library.</p>

            {importedTitles.length > 0 && (
              <div className="song-import-done__list">
                {importedTitles.map((title) => (
                  <span key={title}>{title}</span>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="song-import-modal__footer">
          {step === "pick" && (
            <>
              <button
                type="button"
                className="song-import-btn song-import-btn--secondary"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="button"
                className="song-import-btn song-import-btn--primary"
                onClick={() => void handleDetectSongs()}
                disabled={sourceMode === "file" ? !selectedFile : !pastedText.trim()}
              >
                Detect Songs
                <FileSearch size={16} />
              </button>
            </>
          )}

          {step === "review" && (
            <>
              <button
                type="button"
                className="song-import-btn song-import-btn--secondary"
                onClick={handleReset}
              >
                <ArrowLeft size={16} />
                Back
              </button>
              <button
                type="button"
                className="song-import-btn song-import-btn--primary"
                onClick={() => void handleImport()}
                disabled={enabledCount === 0 || drafts.length === 0}
              >
                Import Selected
                <FileText size={16} />
              </button>
            </>
          )}

          {step === "done" && (
            <>
              <button
                type="button"
                className="song-import-btn song-import-btn--secondary"
                onClick={handleReset}
              >
                Import Another
              </button>
              <button
                type="button"
                className="song-import-btn song-import-btn--primary"
                onClick={onClose}
              >
                Close
                <ArrowLeft size={16} className="song-import-btn__flip" />
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
