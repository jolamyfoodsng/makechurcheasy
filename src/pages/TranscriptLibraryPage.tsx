// ────────────────────────────────────────────────────────────────────────────
// Transcript Library Page
//
// A completely separate module from Live Speech-to-Scripture.
// Manages completed transcripts: import, search, filter, export, translate.
// ────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, Mic, FileText, Clock, BookOpen, Timer,
  Globe, Calendar, Tag, LayoutGrid, List, Download, MoreVertical,
  Wand2, ChevronDown, CheckCircle2, Trash2, X,
} from "lucide-react";
import "./TranscriptLibraryPage.css";

import type {
  Transcript,
  TranscriptLibraryStats,
  TranscriptFilters,
} from "../transcripts/transcriptTypes";
import {
  loadTranscripts,
  deleteTranscript,
  getTranscriptStats,
  formatDuration,
} from "../transcripts/transcriptService";

// ── Stat card config ─────────────────────────────────────────────────────────

interface StatDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  getValue: (s: TranscriptLibraryStats) => string;
}

const STAT_DEFS: StatDef[] = [
  { key: "total", label: "TOTAL SESSIONS", icon: <FileText size={22} />, color: "indigo", getValue: (s) => String(s.totalSessions) },
  { key: "used", label: "USED THIS MONTH", icon: <Clock size={22} />, color: "blue", getValue: (s) => s.usedThisMonth },
  { key: "scriptures", label: "SCRIPTURES DETECTED", icon: <BookOpen size={22} />, color: "green", getValue: (s) => String(s.totalScriptures) },
  { key: "duration", label: "TOTAL DURATION", icon: <Timer size={22} />, color: "purple", getValue: (s) => s.totalDurationFormatted },
];

// ── Source type labels ───────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  "imported-audio": "Audio Import",
  "imported-video": "Video Import",
  uploaded: "Uploaded",
  transcription: "Live Session",
};

// ── Component ────────────────────────────────────────────────────────────────

interface TranscriptLibraryPageProps {
  onOpenTranscript?: (id: string) => void;
  onNewSession?: () => void;
}

export default function TranscriptLibraryPage({
  onOpenTranscript,
  onNewSession,
}: TranscriptLibraryPageProps) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [stats, setStats] = useState<TranscriptLibraryStats>({
    totalSessions: 0,
    totalDurationFormatted: "0m",
    totalScriptures: 0,
    usedThisMonth: "0m",
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TranscriptFilters>({
    search: "",
    language: "",
    sourceType: "",
    sortBy: "createdAt",
    sortDir: "desc",
  });
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("list");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const perPage = 8;

  // ── Load data ────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setLoading(true);
    const [data, statsData] = await Promise.all([loadTranscripts(), getTranscriptStats()]);
    setTranscripts(data);
    setStats(statsData);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Filtering & sorting ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...transcripts];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.church.toLowerCase().includes(q) ||
          t.transcriptText.toLowerCase().includes(q),
      );
    }
    if (filters.language) {
      list = list.filter((t) => t.language === filters.language);
    }
    if (filters.sourceType) {
      list = list.filter((t) => t.sourceType === filters.sourceType);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (filters.sortBy === "title") cmp = a.title.localeCompare(b.title);
      else if (filters.sortBy === "church") cmp = a.church.localeCompare(b.church);
      else if (filters.sortBy === "durationSeconds") cmp = a.durationSeconds - b.durationSeconds;
      else cmp = a.createdAt.localeCompare(b.createdAt);
      return filters.sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [transcripts, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => { setPage(1); }, [filters.search, filters.language, filters.sourceType]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async (e: React.MouseEvent, t: Transcript) => {
    e.stopPropagation();
    setDownloadingId(t.id);

    try {
      const blob = new Blob([t.transcriptText || ""], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t.title.replace(/[^a-zA-Z0-9 ]/g, "_").replace(/\s+/g, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* noop */ }

    setTimeout(() => {
      setDownloadingId(null);
      setDoneId(t.id);
      setTimeout(() => setDoneId(null), 2000);
    }, 800);
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setMenuOpenId(null);
    setDeletingId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deletingId) return;
    await deleteTranscript(deletingId);
    setDeletingId(null);
    refresh();
  }, [deletingId, refresh]);

  const cancelDelete = useCallback(() => {
    setDeletingId(null);
  }, []);

  const toggleSort = useCallback((field: TranscriptFilters["sortBy"]) => {
    setFilters((f) => ({
      ...f,
      sortBy: field,
      sortDir: f.sortBy === field && f.sortDir === "desc" ? "asc" : "desc",
    }));
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="tl-scroll-content">
      <div className="tl-container">

        {/* ── Header ── */}
        <header className="tl-header">
          <div>
            <h1 className="tl-title">My Transcripts</h1>
            <p className="tl-subtitle">Manage your sermon transcripts, export, and translate.</p>
          </div>
          <div className="tl-header-actions">
            <div className="tl-search-wrapper">
              {/* <Search className="tl-search-icon" size={16} /> */}
              <input
                type="text"
                className="tl-search-input"
                placeholder="Search transcripts..."
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
              {filters.search && (
                <button className="tl-search-clear" onClick={() => setFilters((f) => ({ ...f, search: "" }))}>
                  <X size={14} />
                </button>
              )}
            </div>
            <button className="tl-btn tl-btn-primary" onClick={onNewSession}>
              <Mic size={16} /> New Session
            </button>
          </div>
        </header>

        {/* ── Stats Grid ── */}
        <section className="tl-stats-grid">
          {STAT_DEFS.map((def) => (
            <div key={def.key} className={`tl-stat-card tl-stat--${def.color}`}>
              <div className="tl-accent-bar" />
              <div className="tl-stat-icon">
                {def.icon}
              </div>
              <div>
                <div className="tl-stat-value">{def.getValue(stats)}</div>
                <div className="tl-stat-label">{def.label}</div>
              </div>
            </div>
          ))}
        </section>

        {/* ── Data Table ── */}
        <section className="tl-table-section">

          {/* Filters */}
          <div className="tl-table-filters">
            <button className="tl-filter-btn">
              <Globe size={14} /> All Languages <ChevronDown size={12} />
            </button>
            <button className="tl-filter-btn">
              <Calendar size={14} /> All Time <ChevronDown size={12} />
            </button>
            <button className="tl-filter-btn">
              <Tag size={14} /> All Services <ChevronDown size={12} />
            </button>
            <div className="tl-view-toggles">
              <button
                className={`tl-view-btn${view === "list" ? " active" : ""}`}
                onClick={() => setView("list")}
              >
                <List size={16} />
              </button>
              <button
                className={`tl-view-btn${view === "grid" ? " active" : ""}`}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>

          {/* Table Header */}
          <div className="tl-table-header">
            <div className="tl-th-name">SESSION NAME</div>
            <div className="tl-th-date" onClick={() => toggleSort("createdAt")}>
              DATE <ChevronDown size={10} />
            </div>
            <div className="tl-th-duration">DURATION</div>
            <div className="tl-th-scriptures">SCRIPTURES</div>
            <div className="tl-th-language">LANGUAGE</div>
            <div className="tl-th-actions">ACTIONS</div>
          </div>

          {/* Table Body */}
          <div className="tl-table-body">
            {loading ? (
              <div className="tl-empty-state">
                <Timer size={32} className="tl-empty-icon" />
                <span>Loading transcripts…</span>
              </div>
            ) : paged.length === 0 ? (
              <div className="tl-empty-state">
                <FileText size={32} className="tl-empty-icon" />
                <span>{filters.search ? "No transcripts match your search." : "No transcripts yet. Start a new session to begin."}</span>
              </div>
            ) : (
              paged.map((t) => (
                <div
                  key={t.id}
                  className="tl-table-row"
                  onClick={() => onOpenTranscript?.(t.id)}
                >
                  {/* Name */}
                  <div className="tl-cell-name">
                    <div className="tl-icon-circle">
                      <Mic size={16} />
                    </div>
                    <div className="tl-name-block">
                      <div className="tl-name-text">{t.title}</div>
                      <div className="tl-sub-text">{t.church || SOURCE_LABELS[t.sourceType] || t.sourceType}</div>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="tl-cell-date">
                    <div>{new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                    <div className="tl-sub-text">{new Date(t.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                  </div>

                  {/* Duration */}
                  <div className="tl-cell-duration">
                    {formatDuration(t.durationSeconds)}
                  </div>

                  {/* Scriptures */}
                  <div className="tl-cell-scriptures">
                    <div className="tl-matches-count">{t.scriptures.length}</div>
                    <div className="tl-matches-label">matches</div>
                  </div>

                  {/* Language */}
                  <div className="tl-cell-language">
                    <div className="tl-dot" />
                    {t.language || "English"}
                  </div>

                  {/* Actions */}
                  <div className="tl-cell-actions" onClick={(e) => e.stopPropagation()}>

                    <button
                      className="tl-action-icon"
                      title="Download"
                      onClick={(e) => handleDownload(e, t)}
                      style={{ color: doneId === t.id ? "var(--success)" : undefined }}
                      disabled={downloadingId !== null || doneId === t.id}
                    >
                      {downloadingId === t.id ? (
                        <div className="tl-spinner" />
                      ) : doneId === t.id ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>

                    <div className="tl-menu-wrapper">
                      <button
                        className="tl-action-icon"
                        title="More"
                        onClick={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpenId === t.id && (
                        <div className="tl-dropdown">
                          <button className="tl-dropdown-item" onClick={(e) => handleDelete(e, t.id)}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Table Footer */}
          {filtered.length > 0 && (
            <div className="tl-table-footer">
              <div className="tl-pagination-info">
                SHOWING {Math.min((page - 1) * perPage + 1, filtered.length)} TO {Math.min(page * perPage, filtered.length)} OF {filtered.length}
              </div>
              <div className="tl-pagination-controls">
                <button
                  className="tl-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronDown size={16} style={{ transform: "rotate(90deg)" }} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={`tl-page-btn${n === page ? " active" : ""}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  className="tl-page-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronDown size={16} style={{ transform: "rotate(-90deg)" }} />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Promo Card ── */}
        <div className="tl-promo-card">
          <div className="tl-promo-glow" />
          <div className="tl-promo-content">
            <div className="tl-promo-icon-box">
              <Wand2 size={22} />
            </div>
            <div>
              <h3 className="tl-promo-title">Start a new transcription session</h3>
              <p className="tl-promo-desc">Record a new sermon or talk and let AI detect Bible references in real time.</p>
            </div>
          </div>
          <button className="tl-btn tl-btn-primary" onClick={onNewSession}>
            <Mic size={16} /> New Session
          </button>
        </div>

        {/* ── Delete Confirmation ── */}
        {deletingId && (
          <div className="tl-confirm-overlay" onClick={cancelDelete}>
            <div className="tl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="tl-confirm-title">Delete transcript?</div>
              <div className="tl-confirm-message">
                This will permanently remove the transcript and cannot be undone.
              </div>
              <div className="tl-confirm-actions">
                <button className="tl-btn-cancel" onClick={cancelDelete}>Cancel</button>
                <button className="tl-btn-danger" onClick={confirmDelete}>Delete</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
