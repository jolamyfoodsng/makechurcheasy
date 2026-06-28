/**
 * BibleLibrary.tsx — Modal for browsing, downloading, and managing Bible translations
 *
 * Features:
 * - Search the remote API catalog (~1000 Bibles) — auto-search on 3+ characters
 * - Filter by language (all languages fetched from API)
 * - Download with progress bar
 * - View installed translations with delete option
 * - Import custom Bible XML files via drag-and-drop or file picker
 * - Auto-downloads top 4 on first run
 * - Horizontal list layout (no cards)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  searchCatalog,
  downloadAndParseBible,
  fetchAllLanguages,
  parseXmlToBibleData,
  getCachedCatalogResult,
  AUTO_DOWNLOAD_BIBLES,
  type CatalogResponse,
} from "../bibleApi";
import type { CatalogBible, InstalledBible } from "../types";
import {
  getInstalledTranslations,
  saveInstalledTranslation,
  deleteInstalledTranslation,
  isFirstRun,
} from "../bibleDb";
import { evictTranslationCache } from "../bibleData";
import Icon from "../../components/Icon";
import { useAuth } from "../../contexts/AuthContext";
import { getEffectivePlan } from "../../services/licenseService";
import { checkEntitlementSync } from "../../services/entitlementClient";

/** Auto-download bible abbreviations that cannot be deleted */
const PROTECTED_ABBRS = new Set(AUTO_DOWNLOAD_BIBLES.map(b => b.abbr));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BibleLibraryProps {
  open: boolean;
  onClose: () => void;
  /** Called after a new translation is installed or removed so the parent can refresh */
  onTranslationsChanged?: () => void;
  mode?: "modal" | "page" | "embedded";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "browse" | "installed" | "import";

interface DownloadState {
  /** Bible catalog ID currently downloading */
  id: string;
  abbr: string;
  progress: number; // 0–1
  status: "downloading" | "parsing" | "done" | "error";
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a short abbreviation from a catalog Bible name/version */
function deriveAbbr(bible: CatalogBible): string {
  const v = (bible.version ?? "").trim().toUpperCase();
  if (v && v.length <= 8 && /^[A-Z]/.test(v)) return v;
  return (bible.name ?? "Unknown")
    .split(/\s+/)
    .map((w) => w?.[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 6);
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BibleLibrary({
  open,
  onClose,
  onTranslationsChanged,
  mode = "modal",
}: BibleLibraryProps) {
  const [tab, setTab] = useState<Tab>("browse");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("English");
  const [catalogResult, setCatalogResult] = useState<CatalogResponse | null>(
    () => getCachedCatalogResult({ language: "English", page: 1, limit: 20 }),
  );
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [installed, setInstalled] = useState<Omit<InstalledBible, "data">[]>([]);
  const [downloads, setDownloads] = useState<Map<string, DownloadState>>(new Map());
  const [autoDownloadDone, setAutoDownloadDone] = useState(false);
  const [autoDownloadRunning, setAutoDownloadRunning] = useState(false);

  // All languages from API
  const [allLanguages, setAllLanguages] = useState<string[]>([]);

  // Confirm-delete modal
  const [confirmDelete, setConfirmDelete] = useState<{ abbr: string; name: string } | null>(null);

  // Import state
  const [importDragging, setImportDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: "idle" | "parsing" | "success" | "error"; message?: string }>({ type: "idle" });
  const [showBibleLimitModal, setShowBibleLimitModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Plan enforcement ──
  const { user: authUser } = useAuth();
  const effectivePlan = getEffectivePlan(authUser);
  const { limit: bibleVersionLimit } = checkEntitlementSync("bibleVersions", effectivePlan);
  const isBibleUnlimited = bibleVersionLimit === -1;
  const hasReachedBibleLimit = !isBibleUnlimited && installed.length >= bibleVersionLimit;
  const showBibleUsage = !isBibleUnlimited;

  const searchRef = useRef<HTMLInputElement>(null);
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPageMode = mode === "page";
  const isEmbeddedMode = mode === "embedded";

  // ── Load installed translations ──
  const refreshInstalled = useCallback(async () => {
    try {
      const list = await getInstalledTranslations();
      setInstalled(list);
    } catch (err) {
      console.error("Failed to load installed translations:", err);
    }
  }, []);

  useEffect(() => {
    if (open) refreshInstalled();
  }, [open, refreshInstalled]);

  // ── Fetch all languages on mount ──
  useEffect(() => {
    if (open && allLanguages.length === 0) {
      fetchAllLanguages().then(setAllLanguages).catch(console.error);
    }
  }, [open, allLanguages.length]);

  // ── Auto-download on first run ──
  useEffect(() => {
    if (!open || autoDownloadDone || autoDownloadRunning) return;

    let cancelled = false;
    (async () => {
      try {
        const first = await isFirstRun();
        if (!first || cancelled) {
          setAutoDownloadDone(true);
          return;
        }

        setAutoDownloadRunning(true);

        for (const bible of AUTO_DOWNLOAD_BIBLES) {
          if (cancelled) break;
          try {
            await downloadBible(bible.id, bible.abbr, bible.name, "English", 0);
          } catch (err) {
            console.error(`Auto-download failed for ${bible.abbr}:`, err);
          }
        }
      } catch (err) {
        console.error("[BibleLibrary] Auto-download check failed:", err);
      } finally {
        if (!cancelled) {
          setAutoDownloadRunning(false);
          setAutoDownloadDone(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [open, autoDownloadDone, autoDownloadRunning]);

  // ── Search catalog ──
  const doSearch = useCallback(
    async (p = 1) => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const result = await searchCatalog({
          query: query.trim() || undefined,
          language: language.trim() || undefined,
          page: p,
          limit: 20,
        });
        setCatalogResult(result);
        setPage(p);
      } catch (err: any) {
        setCatalogError(err.message || "Search failed");
      } finally {
        setCatalogLoading(false);
      }
    },
    [query, language]
  );

  // Initial search when opening browse tab
  useEffect(() => {
    if (open && tab === "browse" && !catalogResult) {
      doSearch(1);
    }
  }, [open, tab]);

  // ── Auto-search when query has 3+ characters ──
  useEffect(() => {
    if (!open || tab !== "browse") return;

    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);

    if (query.trim().length >= 3) {
      autoSearchTimer.current = setTimeout(() => {
        doSearch(1);
      }, 350);
    }

    return () => {
      if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    };
  }, [query, open, tab]);

  // Re-search when language changes
  useEffect(() => {
    if (open && tab === "browse") {
      doSearch(1);
    }
  }, [language]);

  // ── Download a Bible ──
  const downloadBible = useCallback(
    async (
      catalogId: string,
      abbr: string,
      name: string,
      lang: string,
      filesize: number
    ) => {
      const isInstalled = installed.some((i) => i.abbr === abbr);
      if (isInstalled) return;

      const existing = downloads.get(catalogId);
      if (existing && (existing.status === "downloading" || existing.status === "parsing")) return;

      const state: DownloadState = {
        id: catalogId,
        abbr,
        progress: 0,
        status: "downloading",
      };

      setDownloads((prev) => new Map(prev).set(catalogId, state));

      try {
        const data = await downloadAndParseBible(catalogId, (frac) => {
          setDownloads((prev) => {
            const next = new Map(prev);
            next.set(catalogId, { ...state, progress: frac, status: "downloading" });
            return next;
          });
        });

        setDownloads((prev) => {
          const next = new Map(prev);
          next.set(catalogId, { ...state, progress: 1, status: "parsing" });
          return next;
        });

        const record: InstalledBible = {
          id: catalogId,
          abbr,
          name,
          language: lang,
          data,
          downloadedAt: new Date().toISOString(),
          filesize,
        };
        await saveInstalledTranslation(record);

        setDownloads((prev) => {
          const next = new Map(prev);
          next.set(catalogId, { ...state, progress: 1, status: "done" });
          return next;
        });

        await refreshInstalled();
        onTranslationsChanged?.();

        setTimeout(() => {
          setDownloads((prev) => {
            const next = new Map(prev);
            next.delete(catalogId);
            return next;
          });
        }, 3000);
      } catch (err: any) {
        setDownloads((prev) => {
          const next = new Map(prev);
          next.set(catalogId, {
            ...state,
            progress: 0,
            status: "error",
            error: err.message || "Download failed",
          });
          return next;
        });
      }
    },
    [installed, downloads, refreshInstalled, onTranslationsChanged]
  );

  // ── Import Bible from XML file ──
  const handleImportFile = useCallback(
    async (file: File) => {
      if (hasReachedBibleLimit) {
        return;
      }
      setImportStatus({ type: "parsing", message: `Parsing ${file.name}…` });

      try {
        const text = await file.text();
        const data = parseXmlToBibleData(text);

        // Validate: must have at least a few books
        const bookCount = Object.keys(data).length;
        if (bookCount < 1) {
          throw new Error("No valid books found in the XML file. Ensure it uses the standard Bible XML format.");
        }

        // Try to extract translation name from XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        const bibleEl = doc.querySelector("bible");
        const translationAttr = bibleEl?.getAttribute("translation") ?? "";

        // Derive abbreviation from filename or translation attribute
        const rawName = translationAttr || file.name.replace(/\.xml$/i, "");
        const abbr = rawName
          .split(/\s+/)
          .map((w) => w[0] ?? "")
          .join("")
          .toUpperCase()
          .slice(0, 6) || "CUSTOM";

        // Check if abbreviation already exists
        const existingAbbrs = new Set(installed.map((i) => i.abbr));
        let finalAbbr = abbr;
        let counter = 2;
        while (existingAbbrs.has(finalAbbr)) {
          finalAbbr = `${abbr}${counter}`;
          counter++;
        }

        const record: InstalledBible = {
          id: `custom-${Date.now()}`,
          abbr: finalAbbr,
          name: rawName || file.name,
          language: "Custom",
          data,
          downloadedAt: new Date().toISOString(),
          filesize: file.size,
        };
        await saveInstalledTranslation(record);

        await refreshInstalled();
        onTranslationsChanged?.();

        setImportStatus({
          type: "success",
          message: `"${rawName}" imported as ${finalAbbr} — ${bookCount} books found`,
        });

        setTimeout(() => setImportStatus({ type: "idle" }), 5000);
      } catch (err: any) {
        setImportStatus({
          type: "error",
          message: err.message || "Failed to parse Bible XML",
        });
      }
    },
    [installed, refreshInstalled, onTranslationsChanged, hasReachedBibleLimit]
  );

  // ── Drag & drop handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImportDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImportDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setImportDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".xml") || file.type === "text/xml")) {
        handleImportFile(file);
      } else {
        setImportStatus({ type: "error", message: "Only .xml files are supported" });
      }
    },
    [handleImportFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImportFile(file);
      // Reset so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleImportFile]
  );

  // ── Installed abbrs set for quick lookup ──
  const installedAbbrs = useMemo(
    () => new Set(installed.map((i) => i.abbr)),
    [installed]
  );

  // ── Confirm-delete flow ──
  const handleDeleteRequest = useCallback((abbr: string, name: string) => {
    if (PROTECTED_ABBRS.has(abbr)) return; // should never happen — button is hidden
    setConfirmDelete({ abbr, name });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      await deleteInstalledTranslation(confirmDelete.abbr);
      evictTranslationCache(confirmDelete.abbr);
      await refreshInstalled();
      onTranslationsChanged?.();
    } catch (err) {
      console.error("Failed to delete translation:", err);
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete, refreshInstalled, onTranslationsChanged]);

  // ── Keyboard ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus search on open
  useEffect(() => {
    if (open && tab === "browse") {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open, tab]);

  if (!open) return null;

  const content = (
    <div
      className={`bible-library-modal${isPageMode ? " bible-library-modal--page" : ""}${isEmbeddedMode ? " bible-library-modal--embedded" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div className="bible-library-header">
        <h2>
          <Icon name="library_books" size={20} />
          Bible Library
          {showBibleUsage && (
            <span className="lib-song-usage-badge" style={{ marginLeft: 8, fontSize: 11, verticalAlign: "middle" }}>
              {installed.length} / {bibleVersionLimit} versions
            </span>
          )}
        </h2>
        {isPageMode ? (
          <button className="bible-library-page-back" onClick={onClose}>
            <Icon name="arrow_back" size={18} />
            Back to Settings
          </button>
        ) : isEmbeddedMode ? null : (
          <button className="bible-library-close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="bible-library-tabs">
        <button
          className={`bible-library-tab${tab === "browse" ? " active" : ""}`}
          onClick={() => setTab("browse")}
        >
          <Icon name="explore" size={20} />
          Browse &amp; Download
        </button>
        <button
          className={`bible-library-tab${tab === "installed" ? " active" : ""}`}
          onClick={() => setTab("installed")}
        >
          <Icon name="download_done" size={20} />
          Installed ({installed.length})
        </button>
        {/* <button
          className={`bible-library-tab${tab === "import" ? " active" : ""}`}
          onClick={() => setTab("import")}
        >
          <Icon name="upload_file" size={20} />
          Import
        </button> */}
      </div>

      {/* ── Auto-download banner ── */}
      {autoDownloadRunning && (
        <div className="bible-library-auto-banner">
          <Icon name="sync" size={20} className="spin" />
          Downloading essential translations for first-time setup…
        </div>
      )}

      {/* ── Browse Tab ── */}
      {tab === "browse" && (
        <div className="bible-library-body">
          <div className="bible-library-search-row">
            <div className="bible-library-search-input-wrap">
              <Icon name="search" size={20} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search bibles… (3+ letters to auto-search)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search Bible catalog"
                onKeyDown={(e) => {
                  if (e.key === "Enter") doSearch(1);
                }}
              />
              {query && (
                <button
                  type="button"
                  className="bible-library-search-clear"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear Bible catalog search"
                  title="Clear Bible catalog search"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>

            {/* Language select - side by side with Bible search */}
            <select
              className="bible-library-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Filter by language"
            >
              <option value="">All Languages</option>
              {allLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          {/* Language pills */}


          {catalogError && (
            <div className="bible-library-error">
              <Icon name="error_outline" size={20} />
              <span>{catalogError}</span>
              <button
                className="bible-library-retry-btn"
                onClick={() => doSearch(page)}
              >
                <Icon name="refresh" size={14} />
                Retry
              </button>
            </div>
          )}

          {catalogLoading && (
            <div className="bible-library-loading">
              <Icon name="sync" size={20} className="spin" />
              Searching…
            </div>
          )}

          {catalogResult && !catalogLoading && (
            <>
              <div className="bible-library-result-count">
                {catalogResult.total} Bible{catalogResult.total !== 1 ? "s" : ""} found
                {catalogResult.pages > 1 &&
                  ` — Page ${catalogResult.page} of ${catalogResult.pages}`}
              </div>

              <div className="bible-library-list">
                {catalogResult.items.map((bible) => {
                  const abbr = deriveAbbr(bible);
                  const isInst = installedAbbrs.has(abbr);
                  const dl = downloads.get(bible.id);

                  return (
                    <div
                      key={bible.id}
                      className={`bible-library-row${isInst ? " installed" : ""}`}
                    >
                      <div className="bible-library-row-left">
                        <span className="bible-library-row-abbr">{abbr}</span>
                        <span className="bible-library-row-name">{bible.name}</span>
                      </div>
                      <div className="bible-library-row-right">
                        <span className="bible-library-row-lang">{bible.language}</span>
                        <span className="bible-library-row-size">{formatFileSize(bible.filesize)}</span>

                        {/* Status / Action */}
                        {isInst ? (
                          <span className="bible-library-row-installed">
                            <Icon name="check_circle" size={20} />
                            Installed
                          </span>
                        ) : dl?.status === "downloading" ? (
                          <div className="bible-library-row-progress">
                            <div className="bible-library-progress-bar">
                              <div
                                className="bible-library-progress-fill"
                                style={{ width: `${Math.round(dl.progress * 100)}%` }}
                              />
                            </div>
                            <span className="bible-library-row-pct">{Math.round(dl.progress * 100)}%</span>
                          </div>
                        ) : dl?.status === "parsing" ? (
                          <span className="bible-library-row-parsing">
                            <Icon name="sync" size={20} className="spin" />
                          </span>
                        ) : dl?.status === "done" ? (
                          <span className="bible-library-row-installed">
                            <Icon name="check_circle" size={20} />
                            Installed
                          </span>
                        ) : dl?.status === "error" ? (
                          <button
                            className="bible-library-row-retry"
                            onClick={() =>
                              downloadBible(bible.id, abbr, bible.name, bible.language, bible.filesize)
                            }
                            title={dl.error || "Failed"}
                          >
                            <Icon name="refresh" size={20} />
                          </button>
                        ) : (
                          <button
                            className={`bible-library-row-dl${hasReachedBibleLimit ? " bible-library-row-dl--locked" : ""}`}
                            onClick={() => {
                              if (hasReachedBibleLimit) { setShowBibleLimitModal(true); return; }
                              downloadBible(bible.id, abbr, bible.name, bible.language, bible.filesize);
                            }}
                            title={hasReachedBibleLimit ? "Bible version limit reached — upgrade to add more" : "Download"}
                          >
                            <Icon name={hasReachedBibleLimit ? "lock" : "download"} size={20} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {catalogResult.pages > 1 && (
                <div className="bible-library-pagination">
                  <button
                    disabled={page <= 1}
                    onClick={() => doSearch(page - 1)}
                  >
                    <Icon name="chevron_left" size={20} />
                    Previous
                  </button>
                  <span>
                    Page {page} / {catalogResult.pages}
                  </span>
                  <button
                    disabled={page >= catalogResult.pages}
                    onClick={() => doSearch(page + 1)}
                  >
                    Next
                    <Icon name="chevron_right" size={20} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Installed Tab ── */}
      {tab === "installed" && (
        <div className="bible-library-body">
          <div className="bible-library-installed-note">
            <Icon name="info" size={18} />
            <span>Installed Bible versions will appear in the Bible selector when using the Dock UI in OBS.</span>
          </div>
          {installed.length === 0 ? (
            <div className="bible-library-empty">
              <Icon name="library_books" size={20} />
              <p>No translations installed yet.</p>
              <p>Switch to the Browse tab to download Bibles.</p>
            </div>
          ) : (
            <div className="bible-library-installed-list">
              {installed.map((b) => {
                const isProtected = PROTECTED_ABBRS.has(b.abbr);
                return (
                  <div key={b.abbr} className="bible-library-installed-row">
                    <div className="bible-library-installed-info">
                      <span className="bible-library-installed-abbr">{b.abbr}</span>
                      <span className="bible-library-installed-name">
                        {b.name}
                        {isProtected && (
                          <span className="bible-library-installed-default-badge">Default</span>
                        )}
                      </span>
                      <span className="bible-library-installed-meta">
                        {b.language} · {formatFileSize(b.filesize)} · Downloaded{" "}
                        {new Date(b.downloadedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="bible-library-installed-actions">
                      {!isProtected && (
                        <button
                          className="bible-library-delete-btn"
                          onClick={() => handleDeleteRequest(b.abbr, b.name)}
                          title={`Delete ${b.abbr}`}
                        >
                          <Icon name="delete_outline" size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Import Tab ── */}
      {tab === "import" && (
        <div className="bible-library-body">
          <div className="bible-library-import-info">
            <h3>Import Custom Bible</h3>
            <p>
              Upload a Bible in XML format. The file must follow the standard structure:
            </p>
            <pre className="bible-library-import-format">{`<bible translation="My Translation">
  <testament name="Old">
    <book number="1">
      <chapter number="1">
        <verse number="1">In the beginning...</verse>
      </chapter>
    </book>
  </testament>
</bible>`}</pre>
            <p className="bible-library-import-note">
              Book numbers 1–66 follow standard Protestant order (Genesis to Revelation).
            </p>
          </div>

          {/* Drop zone */}
          <div
            className={`bible-library-import-dropzone${importDragging ? " dragging" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name={importStatus.type === "parsing" ? "sync" : "upload_file"} size={20} />
            {importStatus.type === "idle" && (
              <>
                <span className="bible-library-import-dropzone-text">
                  Drag &amp; drop an XML file here
                </span>
                <span className="bible-library-import-dropzone-sub">
                  or click to browse
                </span>
              </>
            )}
            {importStatus.type === "parsing" && (
              <span className="bible-library-import-dropzone-text">
                {importStatus.message}
              </span>
            )}
            {importStatus.type === "success" && (
              <span className="bible-library-import-dropzone-text bible-library-import-success">
                <Icon name="check_circle" size={20} />
                {importStatus.message}
              </span>
            )}
            {importStatus.type === "error" && (
              <span className="bible-library-import-dropzone-text bible-library-import-error">
                <Icon name="error" size={20} />
                {importStatus.message}
              </span>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
        </div>
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && (
        <div className="bible-library-confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="bible-library-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bible-library-confirm-header">
              <Icon name="warning" size={20} style={{ color: "#ff5050" }} />
              <h3>Delete Translation</h3>
            </div>
            <p className="bible-library-confirm-text">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong> ({confirmDelete.abbr})?
              This cannot be undone.
            </p>
            <div className="bible-library-confirm-actions">
              <button
                className="bible-library-confirm-cancel"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="bible-library-confirm-delete"
                onClick={handleDeleteConfirm}
              >
                <Icon name="delete" size={20} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bible Version Limit Modal */}
      {showBibleLimitModal && (
        <div className="bible-library-backdrop" onClick={() => setShowBibleLimitModal(false)} style={{ zIndex: 9999 }}>
          <div className="lib-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Bible Version Limit Reached</h3>
            <p>
              Your {effectivePlan} plan allows {bibleVersionLimit} Bible versions.
              You currently have {installed.length} installed.
            </p>
            <p>Upgrade your plan to install more translations.</p>
            <div className="lib-confirm-actions">
              <button className="lib-confirm-cancel" onClick={() => setShowBibleLimitModal(false)}>Close</button>
              <a href="https://makechurcheasy.creatorstudioslabs.stream/pricing" target="_blank" rel="noopener noreferrer" className="lib-confirm-delete" style={{ textDecoration: "none" }}>
                Upgrade Plan
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isPageMode) {
    return <div className="bible-library-page-shell">{content}</div>;
  }

  if (isEmbeddedMode) {
    return <div className="bible-library-page-shell">{content}</div>;
  }

  return (
    <div className="bible-library-backdrop" onClick={onClose}>
      {content}
    </div>
  );
}
