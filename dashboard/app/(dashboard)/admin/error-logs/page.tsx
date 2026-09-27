"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  ExternalLink,
  Copy,
  Check,
  X,
  Clock,
  Users,
  Activity,
  Layers,
  Monitor,
  MousePointerClick,
  Footprints,
  FileCode,
} from "lucide-react";

interface BreadcrumbItem {
  type: string;
  target?: string;
  text?: string;
  url?: string;
  timestamp: string;
}

interface ErrorLogItem {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  churchName?: string | null;
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  url: string;
  pathname?: string;
  action?: string;
  breadcrumbs?: BreadcrumbItem[];
  userAgent?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(dateString?: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AdminErrorLogsPage() {
  const [logs, setLogs] = useState<ErrorLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [uniqueUsersCount, setUniqueUsersCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedError, setSelectedError] = useState<ErrorLogItem | null>(null);
  const [copied, setCopied] = useState(false);

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
      });
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }

      const res = await fetch(`/api/admin/error-logs?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load error logs");
      const data = await res.json();

      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTodayCount(data.todayCount || 0);
      setUniqueUsersCount(data.uniqueUsersCount || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleCopyStack = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Error Logs
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/60">
                  {total} recorded
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Real-time user crashes, unhandled errors, click breadcrumbs, and Telegram alerts
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchLogs()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-700/80 bg-gray-900/90 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Errors
            </span>
            <Activity className="w-4 h-4 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-100 font-mono">{total}</p>
          <p className="text-[11px] text-slate-400 mt-1">Across all users and visitors</p>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-gray-900/90 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Errors Today
            </span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-300 font-mono">{todayCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Recorded since midnight</p>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-gray-900/90 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Affected Users
            </span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-indigo-300 font-mono">{uniqueUsersCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Unique registered user accounts</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by error message, email, user name, URL, or action..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-gray-900 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error Logs List / Table */}
      <div className="rounded-2xl border border-slate-700 bg-gray-900 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
            <p className="text-xs">Loading error logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <AlertTriangle className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-200">No error logs found</p>
            <p className="text-xs text-slate-400 mt-1">
              {debouncedSearch ? "Try adjusting your search criteria" : "All systems running smoothly!"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-slate-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  {/* Top line: time + user info + route */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatRelativeTime(log.createdAt)}
                    </span>

                    {log.userEmail ? (
                      <Link
                        href={log.userId ? `/admin/users/${log.userId}` : "#"}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded-md"
                      >
                        <User className="w-3 h-3 text-indigo-400" />
                        {log.userName || log.userEmail}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                        Guest / Anonymous
                      </span>
                    )}

                    {log.pathname && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-300 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-md truncate max-w-[200px]">
                        {log.pathname}
                      </span>
                    )}

                    {log.action && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded-md max-w-[280px] truncate">
                        <MousePointerClick className="w-3 h-3 text-amber-400 shrink-0" />
                        {log.action}
                      </span>
                    )}
                  </div>

                  {/* Error Message */}
                  <div className="text-sm font-semibold text-rose-300 break-words flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 w-2 h-2 rounded-full bg-rose-500" />
                    <span>{log.message}</span>
                  </div>

                  {/* Second line: Stack preview snippet */}
                  {log.stack && (
                    <div className="text-[11px] font-mono text-slate-500 truncate max-w-3xl">
                      {log.stack.split("\n")[0]}
                    </div>
                  )}
                </div>

                {/* Inspect Button */}
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedError(log)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
                  >
                    <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                    Inspect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Page {page} of {totalPages} ({total} errors)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Inspection Modal */}
      {selectedError && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-100 truncate">
                    Error Inspection: {selectedError.name || "Runtime Error"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Recorded {formatDateTime(selectedError.createdAt)} ({formatRelativeTime(selectedError.createdAt)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedError(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Error Message */}
              <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">Error Message</p>
                <p className="mt-1 text-sm font-semibold text-rose-200 break-words">{selectedError.message}</p>
              </div>

              {/* User Context */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">User</span>
                  <div className="text-slate-200 font-medium">
                    {selectedError.userName || "Unknown"}
                  </div>
                  <div className="text-slate-400 text-[11px]">{selectedError.userEmail || "Unauthenticated"}</div>
                  {selectedError.userId && (
                    <Link
                      href={`/admin/users/${selectedError.userId}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:underline pt-1"
                    >
                      View user profile <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Location</span>
                  <div className="text-slate-200 font-mono text-[11px] truncate">
                    {selectedError.pathname || "/"}
                  </div>
                  <div className="text-slate-400 text-[11px] truncate">{selectedError.url}</div>
                  {selectedError.churchName && (
                    <div className="text-slate-300 text-[11px] pt-1">Church: {selectedError.churchName}</div>
                  )}
                </div>
              </div>

              {/* Immediate Action */}
              {selectedError.action && (
                <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 p-3.5">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
                    <MousePointerClick className="w-3.5 h-3.5" />
                    Immediate User Action
                  </div>
                  <p className="text-xs text-amber-200 font-mono">{selectedError.action}</p>
                </div>
              )}

              {/* Action Breadcrumbs Trail */}
              {selectedError.breadcrumbs && selectedError.breadcrumbs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Footprints className="w-3.5 h-3.5 text-indigo-400" />
                    User Action Breadcrumb History
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2 max-h-44 overflow-y-auto">
                    {selectedError.breadcrumbs.map((b, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-[11px]">
                        <span className="text-slate-500 font-mono text-[10px] pt-0.5">
                          #{idx + 1}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-300">
                          {b.type}
                        </span>
                        <span className="text-slate-300 font-mono truncate flex-1">
                          {b.target || b.url || "Action"}
                          {b.text ? ` — "${b.text}"` : ""}
                        </span>
                        <span className="text-slate-500 text-[10px] shrink-0">
                          {formatRelativeTime(b.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stack Trace */}
              {selectedError.stack && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Stack Trace
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyStack(selectedError.stack)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy Stack"}
                    </button>
                  </div>
                  <pre className="p-4 rounded-xl border border-slate-800 bg-slate-950 text-rose-300/90 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed max-h-60">
                    {selectedError.stack}
                  </pre>
                </div>
              )}

              {/* Device & Client Details */}
              {selectedError.userAgent && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-[11px] space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-500 flex items-center gap-1.5">
                    <Monitor className="w-3 h-3" /> Client User Agent
                  </span>
                  <p className="text-slate-400 break-words font-mono text-[10px]">{selectedError.userAgent}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedError(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
