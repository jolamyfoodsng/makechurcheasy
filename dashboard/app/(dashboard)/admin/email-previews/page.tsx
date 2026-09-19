"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  Inbox,
  Laptop,
  Loader2,
  Mail,
  Moon,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Sun,
  Tablet,
  X,
  XCircle,
} from "lucide-react";

type EmailPreview = {
  id: string;
  name: string;
  category: string;
  description: string;
  trigger: string;
  to: string;
  subject: string;
  html: string;
};

type PreviewResponse = {
  previews: EmailPreview[];
  count: number;
  generatedAt: string;
};

type ViewportMode = "desktop" | "tablet" | "mobile";
type ViewTab = "preview" | "inbox" | "text" | "html";
type CanvasTheme = "dark" | "gray" | "light";

function categoryConfig(category: string) {
  const norm = category.toLowerCase();
  if (norm === "billing") {
    return {
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
      dot: "bg-emerald-400",
    };
  }
  if (norm === "trial") {
    return {
      badge: "border-sky-500/30 bg-sky-500/10 text-sky-400",
      dot: "bg-sky-400",
    };
  }
  if (norm === "security") {
    return {
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",
      dot: "bg-amber-400",
    };
  }
  if (norm === "admin") {
    return {
      badge: "border-violet-500/30 bg-violet-500/10 text-violet-400",
      dot: "bg-violet-400",
    };
  }
  if (norm === "auth") {
    return {
      badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
      dot: "bg-indigo-400",
    };
  }
  return {
    badge: "border-slate-700 bg-slate-800/80 text-slate-300",
    dot: "bg-slate-400",
  };
}

function extractPlainText(html: string): string {
  if (typeof window === "undefined") return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Remove styles and scripts
    doc.querySelectorAll("style, script, meta, link").forEach((el) => el.remove());

    const text = doc.body.innerText || doc.body.textContent || "";
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
      .join("\n");
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

export default function AdminEmailPreviewsPage() {
  const [previews, setPreviews] = useState<EmailPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Viewer state
  const [viewTab, setViewTab] = useState<ViewTab>("preview");
  const [viewport, setViewport] = useState<ViewportMode>("desktop");
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>("dark");

  // Copy and download states
  const [copiedKind, setCopiedKind] = useState<"html" | "text" | "subject" | null>(null);

  // Send test email modal state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("admin@example.com");
  const [sendingTest, setSendingTest] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/email-previews", { credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as Partial<PreviewResponse> & { error?: string };
      if (!res.ok) throw new Error(body.error || "Failed to load email previews");
      const next = body.previews || [];
      setPreviews(next);
      setSelectedId((current) => (current && next.some((p) => p.id === current) ? current : next[0]?.id || null));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load email previews");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const categories = useMemo(() => {
    const list = Array.from(new Set(previews.map((preview) => preview.category))).sort();
    return ["All", ...list];
  }, [previews]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: previews.length };
    previews.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [previews]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return previews.filter((preview) => {
      const matchesCategory = category === "All" || preview.category === category;
      const matchesSearch =
        !query ||
        preview.name.toLowerCase().includes(query) ||
        preview.subject.toLowerCase().includes(query) ||
        preview.description.toLowerCase().includes(query) ||
        preview.trigger.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, previews, search]);

  const selected = previews.find((preview) => preview.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (selected && filtered.some((preview) => preview.id === selected.id)) return;
    if (filtered.length > 0) {
      setSelectedId(filtered[0]?.id || null);
    }
  }, [filtered, selected]);

  const plainTextContent = useMemo(() => {
    if (!selected) return "";
    return extractPlainText(selected.html);
  }, [selected]);

  const copyToClipboard = async (text: string, kind: "html" | "text" | "subject") => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopiedKind(kind);
    window.setTimeout(() => setCopiedKind(null), 1800);
  };

  const downloadHtmlFile = () => {
    if (!selected) return;
    const blob = new Blob([selected.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.id}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openInNewTab = () => {
    if (!selected) return;
    const blob = new Blob([selected.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !testEmailAddress) return;
    setSendingTest(true);
    try {
      const res = await fetch("/api/admin/email-previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          previewId: selected.id,
          toEmail: testEmailAddress.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send test email");

      setToast({
        type: "success",
        message: `Test email "${selected.name}" sent to ${testEmailAddress}`,
      });
      setShowTestModal(false);
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to send test email",
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSendingTest(false);
    }
  };

  const subjectLength = selected?.subject.length || 0;
  const subjectRating =
    subjectLength <= 40
      ? { label: "Short & Punchy", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" }
      : subjectLength <= 65
      ? { label: "Optimal for Mobile", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" }
      : { label: "May Truncate", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };

  return (
    <div className="mx-auto flex h-[calc(100vh-68px)] max-w-[1720px] flex-col gap-4 overflow-hidden p-4 sm:p-6 lg:p-8">
      {/* ── Top Header ── */}
      <div className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-950/20 shrink-0">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white">Email Preview Center</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
                <Sparkles className="h-3 w-3" /> Live Studio
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Interactive design studio for all platform lifecycle, security, billing, and auth emails.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0B101E] px-3.5 py-2">
            <div className="text-xs">
              <span className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Templates</span>
              <p className="font-bold text-white text-sm leading-tight">{previews.length}</p>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div className="text-xs">
              <span className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Categories</span>
              <p className="font-bold text-white text-sm leading-tight">{Math.max(categories.length - 1, 0)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/80 px-3.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
            title="Reload email templates"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          {selected && (
            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all"
            >
              <Send className="h-3.5 w-3.5" />
              Send Test Email
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="shrink-0 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ── Main Dual-Pane Workspace ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[410px_minmax(0,1fr)]">
        {/* ── Left Sidebar (Email Explorer) ── */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-[#0B101E] shadow-xl overflow-hidden">
          <div className="shrink-0 border-b border-slate-800/80 p-3.5 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchInputRef}
                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900/90 pl-9 pr-8 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates or subjects..."
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((item) => {
                const count = categoryCounts[item] || 0;
                const active = category === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-all ${
                      active
                        ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <span>{item}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        active ? "bg-indigo-700/60 text-indigo-100" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template List Items */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {loading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-800/40 border border-slate-800" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                <Inbox className="mb-3 h-8 w-8 text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">No emails match your filter</p>
                <p className="mt-1 text-xs text-slate-500">Try adjusting your search or category.</p>
              </div>
            ) : (
              filtered.map((preview) => {
                const active = preview.id === selected?.id;
                const config = categoryConfig(preview.category);
                return (
                  <button
                    key={preview.id}
                    type="button"
                    onClick={() => setSelectedId(preview.id)}
                    className={`group relative w-full rounded-xl border p-3.5 text-left transition-all ${
                      active
                        ? "border-indigo-500/80 bg-indigo-500/10 shadow-lg shadow-indigo-950/20"
                        : "border-slate-800/80 bg-slate-900/50 hover:bg-slate-800/50 hover:border-slate-700"
                    }`}
                  >
                    {active && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-indigo-500" />
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold ${config.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                        {preview.category}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]">
                        {preview.trigger}
                      </span>
                    </div>

                    <h3 className={`mt-2 text-xs font-bold leading-snug transition-colors ${active ? "text-white" : "text-slate-200 group-hover:text-white"}`}>
                      {preview.name}
                    </h3>

                    <p className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-400">
                      {preview.subject}
                    </p>

                    <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
                      {preview.description}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* ── Right Workspace (Preview, Inspector & Code) ── */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-[#0B101E] shadow-xl overflow-hidden">
          {selected ? (
            <>
              {/* ── Top Bar with Metadata & Switchers ── */}
              <div className="shrink-0 border-b border-slate-800 bg-slate-950/60 p-4 space-y-3.5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-bold ${categoryConfig(selected.category).badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${categoryConfig(selected.category).dot}`} />
                        {selected.category}
                      </span>
                      <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs font-medium text-slate-400">
                        Trigger: {selected.trigger}
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-lg font-bold text-white truncate">{selected.name}</h2>
                  </div>

                  {/* Mode & Device Controls */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Viewport device buttons (only in visual preview mode) */}
                    {viewTab === "preview" && (
                      <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900 p-1">
                        <button
                          type="button"
                          onClick={() => setViewport("desktop")}
                          className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
                            viewport === "desktop"
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                          title="Desktop view"
                        >
                          <Laptop className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Desktop</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewport("tablet")}
                          className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
                            viewport === "tablet"
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                          title="Tablet view (580px)"
                        >
                          <Tablet className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Tablet</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewport("mobile")}
                          className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
                            viewport === "mobile"
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                          title="Mobile view (375px)"
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Mobile</span>
                        </button>
                      </div>
                    )}

                    {/* Canvas theme switcher */}
                    {viewTab === "preview" && (
                      <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900 p-1">
                        <button
                          type="button"
                          onClick={() => setCanvasTheme("dark")}
                          className={`p-1.5 rounded-lg text-xs transition-colors ${
                            canvasTheme === "dark" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                          }`}
                          title="Dark canvas background"
                        >
                          <Moon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCanvasTheme("gray")}
                          className={`p-1.5 rounded-lg text-xs transition-colors ${
                            canvasTheme === "gray" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                          }`}
                          title="Neutral grey canvas background"
                        >
                          <Sun className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Primary Mode Tabs */}
                    <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900 p-1">
                      <button
                        type="button"
                        onClick={() => setViewTab("preview")}
                        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
                          viewTab === "preview"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewTab("inbox")}
                        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
                          viewTab === "inbox"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Inbox className="h-3.5 w-3.5" />
                        Inbox Row
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewTab("text")}
                        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
                          viewTab === "text"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Plaintext
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewTab("html")}
                        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
                          viewTab === "html"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        HTML
                      </button>
                    </div>
                  </div>
                </div>

                {/* Subject & Recipient Pill Bar */}
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[1fr_auto]">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-slate-900/90 px-3.5 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Subject:</span>
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.2 text-[10px] font-semibold ${subjectRating.color}`}>
                          {subjectLength} chars · {subjectRating.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-semibold text-white truncate">{selected.subject}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(selected.subject, "subject")}
                      className="shrink-0 p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                      title="Copy subject line"
                    >
                      {copiedKind === "subject" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(selected.html, "html")}
                      className="inline-flex h-full items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
                    >
                      {copiedKind === "html" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedKind === "html" ? "Copied" : "Copy HTML"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={downloadHtmlFile}
                      className="inline-flex h-full items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
                      title="Download .html file"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </button>

                    <button
                      type="button"
                      onClick={openInNewTab}
                      className="inline-flex h-full items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
                      title="Open full page in new tab"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Content Viewer ── */}
              <div
                className={`min-h-0 flex-1 overflow-auto p-4 md:p-6 transition-colors ${
                  canvasTheme === "dark"
                    ? "bg-[#070A12]"
                    : canvasTheme === "gray"
                    ? "bg-slate-200"
                    : "bg-slate-100"
                }`}
              >
                {viewTab === "preview" && (
                  <div className="flex h-full min-h-[680px] w-full items-start justify-center">
                    <div
                      className={`transition-all duration-300 ease-out shadow-2xl ${
                        viewport === "desktop"
                          ? "w-full max-w-[760px] rounded-2xl overflow-hidden border border-slate-700/50 bg-white"
                          : viewport === "tablet"
                          ? "w-[580px] rounded-2xl overflow-hidden border border-slate-700/50 bg-white shadow-2xl"
                          : "w-[375px] rounded-[36px] overflow-hidden border-8 border-slate-800 bg-black shadow-2xl"
                      }`}
                    >
                      {/* Simulated Mobile Device Notch / Chrome */}
                      {viewport === "mobile" && (
                        <div className="bg-slate-900 px-6 py-2.5 text-white flex items-center justify-between text-[11px] font-semibold border-b border-slate-800 select-none">
                          <span>9:41</span>
                          <div className="h-4 w-20 rounded-full bg-slate-800 flex items-center justify-center">
                            <div className="h-2.5 w-2.5 rounded-full bg-slate-950" />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px]">5G</span>
                            <div className="h-2 w-4 rounded-sm border border-white flex items-center p-0.2">
                              <div className="h-full w-full bg-white rounded-2xs" />
                            </div>
                          </div>
                        </div>
                      )}

                      <iframe
                        title={`${selected.name} preview`}
                        srcDoc={selected.html}
                        sandbox="allow-same-origin"
                        className={`w-full bg-white ${
                          viewport === "mobile"
                            ? "h-[660px] rounded-b-[28px]"
                            : viewport === "tablet"
                            ? "h-[740px] rounded-2xl"
                            : "min-h-[760px] h-full rounded-2xl"
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* ── Realistic Inbox Simulation Mode ── */}
                {viewTab === "inbox" && (
                  <div className="mx-auto max-w-3xl space-y-4">
                    <div className="rounded-2xl border border-slate-800 bg-[#0B101E] p-5 shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                        <div className="flex items-center gap-2">
                          <Inbox className="h-4 w-4 text-indigo-400" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Inbox Simulation (Gmail / Apple Mail)
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">Primary Tab</span>
                      </div>

                      {/* Mock Inbox Row */}
                      <div className="rounded-xl border border-slate-800/80 bg-slate-900/90 p-4 transition-all hover:border-slate-700">
                        <div className="flex items-start gap-3.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 font-bold text-white text-xs shadow-md">
                            MC
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-bold text-white">MakeChurchEasy</p>
                              <span className="text-[11px] text-slate-500 font-medium">10:42 AM</span>
                            </div>
                            <p className="mt-0.5 text-xs font-semibold text-slate-100 truncate">
                              {selected.subject}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-400 leading-relaxed">
                              {plainTextContent.slice(0, 180)}...
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 text-xs text-slate-400 leading-relaxed">
                        <p className="font-semibold text-indigo-300 mb-1">💡 Inbox Readability Tip</p>
                        Most mobile mail apps show the first 35–45 characters of your subject line followed by ~80 characters of preheader text. Your subject line is currently <strong className="text-white">{selected.subject.length} characters</strong>.
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Plaintext Extracted Mode ── */}
                {viewTab === "text" && (
                  <div className="mx-auto max-w-3xl space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0B101E] px-4 py-2.5">
                      <span className="text-xs font-semibold text-slate-400">
                        Plaintext Fallback ({plainTextContent.length} characters)
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(plainTextContent, "text")}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {copiedKind === "text" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedKind === "text" ? "Copied" : "Copy Plaintext"}
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-300 shadow-xl overflow-auto">
                      {plainTextContent}
                    </pre>
                  </div>
                )}

                {/* ── Raw HTML Source Mode ── */}
                {viewTab === "html" && (
                  <div className="mx-auto max-w-4xl space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0B101E] px-4 py-2.5">
                      <span className="text-xs font-semibold text-slate-400">
                        Raw HTML Source ({selected.html.length} bytes)
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(selected.html, "html")}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {copiedKind === "html" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedKind === "html" ? "Copied" : "Copy HTML"}
                      </button>
                    </div>
                    <pre className="max-h-[640px] whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-950 p-5 font-mono text-[11px] leading-relaxed text-slate-300 shadow-xl overflow-auto">
                      {selected.html}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
              {loading ? (
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-500" />
              ) : (
                <Mail className="mb-3 h-8 w-8 text-slate-600" />
              )}
              <p className="text-sm font-semibold text-slate-300">
                {loading ? "Loading email previews..." : "Select an email from the left sidebar"}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Send Test Email Modal ── */}
      {showTestModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0B101E] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Send Test Email</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendTestEmail} className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-400">Template</p>
                <p className="mt-0.5 text-sm font-semibold text-white">{selected.name}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Recipient Email Address
                </label>
                <input
                  type="email"
                  required
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-700 bg-slate-900 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  In development mode, this will deliver directly to your local MailDev inbox (<a href="http://localhost:1080" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">localhost:1080</a>).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingTest}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {sendingTest ? "Sending..." : "Send Test Now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-2xl border backdrop-blur-md ${
              toast.type === "success"
                ? "bg-slate-900/95 border-emerald-500/40 text-emerald-300 shadow-emerald-950/30"
                : "bg-slate-900/95 border-rose-500/40 text-rose-300 shadow-rose-950/30"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
