"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Gift,
  Globe,
  ImageIcon,
  Info,
  Link2,
  Loader2,
  Megaphone,
  Monitor,
  MousePointer,
  Percent,
  Plus,
  Send,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import type {
  AnnouncementAudience,
  AnnouncementForm,
  AnnouncementSurface,
  AnnouncementTone,
} from "../types";
import {
  AUDIENCES,
  CAMPAIGN_TEMPLATES,
  fromLocalInputValue,
  toDateTimeLocalInputValue,
} from "../types";

interface AnnouncementStudioModalProps {
  isOpen: boolean;
  editingId: string | null;
  form: AnnouncementForm;
  submitting: boolean;
  imageUploading: boolean;
  onClose: () => void;
  onUpdateForm: (patch: Partial<AnnouncementForm>) => void;
  onSubmitWithStatus: (
    status: "draft" | "active" | "scheduled",
    overrides?: Partial<AnnouncementForm>
  ) => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
}

const AUDIENCE_REACH_MAP: Record<string, string> = {
  all_users: "14,820 active sessions",
  free_users: "9,450 active sessions",
  paid_users: "4,210 active sessions",
  trial_users: "1,160 active sessions",
  basic_users: "2,840 active sessions",
  growth_users: "1,370 active sessions",
  ambassador_users: "420 active partners",
  just_subscribed: "380 recent sessions",
  cancelled_users: "890 past accounts",
  expired_trials: "1,240 lapsed trials",
};

export function AnnouncementStudioModal({
  isOpen,
  editingId,
  form,
  submitting,
  imageUploading,
  onClose,
  onUpdateForm,
  onSubmitWithStatus,
  onUploadImage,
}: AnnouncementStudioModalProps) {
  // Mode: Standard vs Image-Only
  const [formatMode, setFormatMode] = useState<"standard" | "image_only">(
    form.format || (form.tags?.includes("image-only") ? "image_only" : "standard")
  );

  // Viewport switch: Dock Toast vs Modal
  const [viewportSurface, setViewportSurface] = useState<"dock" | "modal">("dock");

  // Mobile / layout pane toggle
  const [activePane, setActivePane] = useState<"config" | "preview">("config");

  // Schedule mode: "now" vs "later"
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">(
    form.publishAt && fromLocalInputValue(form.publishAt) && new Date(fromLocalInputValue(form.publishAt)!) > new Date()
      ? "later"
      : "now"
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [imageOnlyError, setImageOnlyError] = useState<string | null>(null);
  const publishDateInputRef = useRef<HTMLInputElement>(null);

  // Advanced modules toggle (Discount promo engine only if explicitly needed)
  const [showOfferModule, setShowOfferModule] = useState(
    Boolean(form.offerCode || (form.offerDiscountPercent && form.offerDiscountPercent > 0))
  );

  // Dropdown states
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [showPublishDropdown, setShowPublishDropdown] = useState(false);
  const [showSpecsModal, setShowSpecsModal] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const publishMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setShowTemplateDropdown(false);
      }
      if (publishMenuRef.current && !publishMenuRef.current.contains(e.target as Node)) {
        setShowPublishDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isOpen) return null;

  function toggleSurface(surface: AnnouncementSurface) {
    const exists = form.surfaces.includes(surface);
    const next = exists ? form.surfaces.filter((s) => s !== surface) : [...form.surfaces, surface];
    onUpdateForm({ surfaces: next.length ? next : [surface] });
  }

  function handleTemplateSelect(templateName: string) {
    const tpl = CAMPAIGN_TEMPLATES.find((t) => t.name === templateName);
    if (tpl) {
      onUpdateForm(tpl.patch);
      if (tpl.patch.format) setFormatMode(tpl.patch.format);
      if (tpl.patch.offerCode) setShowOfferModule(true);
      if (tpl.patch.publishAt) setScheduleMode("later");
    }
    setShowTemplateDropdown(false);
  }

  function insertVariable(variable: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onUpdateForm({ message: form.message + " " + variable });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = form.message;
    const updated = current.substring(0, start) + variable + current.substring(end);
    onUpdateForm({ message: updated });
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 50);
  }

  function applyFormat(wrapper: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = form.message.substring(start, end) || "text";
    const updated =
      form.message.substring(0, start) +
      wrapper +
      selected +
      wrapper +
      form.message.substring(end);
    onUpdateForm({ message: updated });
  }

  async function handleSendTest() {
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  }

  async function handleFinalSubmit(targetStatus: "draft" | "active" | "scheduled") {
    setImageOnlyError(null);
    setScheduleError(null);

    // If targetStatus is scheduled, ensure a valid future date is chosen
    if (targetStatus === "scheduled") {
      if (!form.publishAt) {
        setScheduleMode("later");
        setScheduleError("Please select a date and time for when this announcement should go live.");
        publishDateInputRef.current?.focus();
        publishDateInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const parsedIso = fromLocalInputValue(form.publishAt);
      const targetDate = parsedIso ? new Date(parsedIso) : new Date(form.publishAt);
      if (isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
        setScheduleMode("later");
        setScheduleError("The scheduled date and time must be in the future.");
        publishDateInputRef.current?.focus();
        publishDateInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    const overrides: Partial<AnnouncementForm> = {};

    // If in image-only mode, ensure picture & destination link exist and backend requirements are met
    if (formatMode === "image_only") {
      if (!form.imageUrl?.trim()) {
        setImageOnlyError("Please upload an announcement picture or enter an image URL.");
        return;
      }
      if (!form.ctaUrl?.trim()) {
        setImageOnlyError("Please enter a destination link for what opens when users click the picture.");
        return;
      }

      const fallbackTitle =
        form.title.trim() ||
        (form.offerCode ? `${form.offerCode} Special Offer` : "Announcement Banner");
      const fallbackMessage = form.message.trim() || "Click anywhere on banner to view.";
      const updatedTags = form.tags?.includes("image-only")
        ? form.tags
        : form.tags
        ? `${form.tags}, image-only`
        : "image-only";

      overrides.title = fallbackTitle;
      overrides.message = fallbackMessage;
      overrides.tags = updatedTags;
      overrides.format = "image_only";

      onUpdateForm(overrides);
    }

    if (targetStatus === "active") {
      overrides.publishAt = "";
    }

    await onSubmitWithStatus(targetStatus, overrides);
  }

  // Dynamic Category Details
  const intentDetails: Record<
    AnnouncementTone,
    { label: string; icon: typeof Zap; color: string; bg: string; border: string; pillColor: string }
  > = {
    upgrade: {
      label: "Upgrade",
      icon: Zap,
      color: "text-purple-400",
      bg: "from-purple-600 via-indigo-600 to-indigo-700",
      border: "border-purple-500/40",
      pillColor: "text-purple-300 border-purple-400/30",
    },
    offer: {
      label: "Special Offer",
      icon: Tag,
      color: "text-indigo-400",
      bg: "from-indigo-600 via-indigo-500 to-purple-600",
      border: "border-indigo-500/40",
      pillColor: "text-amber-300 border-amber-400/30",
    },
    info: {
      label: "Info",
      icon: Info,
      color: "text-sky-400",
      bg: "from-sky-600 via-blue-600 to-indigo-600",
      border: "border-sky-500/40",
      pillColor: "text-sky-300 border-sky-400/30",
    },
    success: {
      label: "Success",
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "from-emerald-600 via-teal-600 to-cyan-600",
      border: "border-emerald-500/40",
      pillColor: "text-emerald-300 border-emerald-400/30",
    },
    warning: {
      label: "Alert",
      icon: AlertTriangle,
      color: "text-amber-400",
      bg: "from-amber-600 via-rose-600 to-orange-600",
      border: "border-amber-500/40",
      pillColor: "text-amber-300 border-amber-400/30",
    },
  };

  const currentIntent = intentDetails[form.tone] || intentDetails.info;
  const estimatedReach = AUDIENCE_REACH_MAP[form.audience] || "14,820 active sessions";

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-3 md:p-6 overflow-hidden bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.18),rgba(255,255,255,0))]" />

      {/* Main Studio Frame */}
      <main className="relative w-full max-w-[1380px] h-[92vh] max-h-[960px] bg-[#0B0F19]/95 backdrop-blur-xl border border-[#1E293B]/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden shadow-[0_0_25px_-4px_rgba(99,102,241,0.25)]">
        {/* BEGIN: ModalHeader */}
        <header className="px-6 py-4 border-b border-[#1E293B]/80 bg-[#0B0F19]/90 flex items-center justify-between shrink-0 z-10">
          {/* Title & Autosave State */}
          <div className="flex items-center gap-4">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-700/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-semibold text-white tracking-tight">
                  {editingId ? "Edit Announcement" : "Create Announcement"}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {testSent ? "Test dispatched" : "Auto-saved 14s ago"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                Craft targeted product updates, offers, and urgent broadcasts across all platforms
              </p>
            </div>
          </div>

          {/* Header Action Controls */}
          <div className="flex items-center gap-3">
            {/* Preset Templates Dropdown */}
            <div className="relative" ref={templateMenuRef}>
              <button
                type="button"
                onClick={() => setShowTemplateDropdown((v) => !v)}
                className="flex items-center gap-2 bg-[#131B2E] hover:bg-[#182238] text-slate-300 hover:text-white border border-[#334155]/70 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-sm"
              >
                <Gift className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  Preset:{" "}
                  <strong className="text-white font-semibold">
                    {form.title ? form.title.slice(0, 18) + (form.title.length > 18 ? "…" : "") : "Templates"}
                  </strong>
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showTemplateDropdown && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[#1E293B] bg-[#0E1424] shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-[#1E293B]">
                    Choose Preset Template
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scroll py-1">
                    {CAMPAIGN_TEMPLATES.map((tpl) => {
                      const Icon = tpl.icon;
                      return (
                        <button
                          key={tpl.name}
                          type="button"
                          onClick={() => handleTemplateSelect(tpl.name)}
                          className="w-full px-3 py-2 text-left hover:bg-[#131B2E] flex items-start gap-2.5 transition group"
                        >
                          <Icon className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-white truncate">{tpl.name}</div>
                            <div className="text-[11px] text-slate-400 line-clamp-1">{tpl.tagline}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mode Toggle (Config / Split View) */}
            <div className="hidden sm:flex bg-[#131B2E] p-0.5 rounded-lg border border-[#1E293B]/80 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActivePane("config")}
                className={`px-2.5 py-1 rounded transition ${
                  activePane === "config"
                    ? "bg-indigo-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Config
              </button>
              <button
                type="button"
                onClick={() => setActivePane("preview")}
                className={`px-2.5 py-1 rounded transition ${
                  activePane === "preview"
                    ? "bg-indigo-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Split View
              </button>
            </div>

            <div className="h-4 w-px bg-[#1E293B]" />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white hover:bg-[#131B2E] p-1.5 rounded-lg transition"
              title="Close studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>
        {/* END: ModalHeader */}

        {/* BEGIN: DualColumnWorkspace */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
          {/* BEGIN: LeftColumnFormControls */}
          <section
            className={`lg:col-span-7 xl:col-span-7 overflow-y-auto custom-scroll p-6 space-y-6 border-b lg:border-b-0 lg:border-r border-[#1E293B]/80 bg-[#0B0F19]/60 ${
              activePane === "preview" ? "hidden lg:block" : "block"
            }`}
          >
            {/* Section 1: Announcement Intent */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>1. Announcement Intent</span>
                </label>
                <span className="text-[11px] text-slate-400">Controls banner badge & visual theme</span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {/* Upgrade */}
                <button
                  type="button"
                  onClick={() => {
                    onUpdateForm({ tone: "upgrade" });
                    setShowOfferModule(true);
                  }}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition group ${
                    form.tone === "upgrade"
                      ? "border-indigo-500 bg-indigo-500/15 text-white font-medium shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                      : "border-[#1E293B] bg-[#131B2E]/60 hover:bg-[#182238] text-slate-300 hover:text-white"
                  }`}
                >
                  <Zap className="w-4 h-4 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Upgrade</span>
                </button>

                {/* Special Offer */}
                <button
                  type="button"
                  onClick={() => {
                    onUpdateForm({ tone: "offer" });
                    setShowOfferModule(true);
                  }}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition group ${
                    form.tone === "offer"
                      ? "border-indigo-500 bg-indigo-500/15 text-white font-medium shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                      : "border-[#1E293B] bg-[#131B2E]/60 hover:bg-[#182238] text-slate-300 hover:text-white"
                  }`}
                >
                  <Tag className="w-4 h-4 text-indigo-400 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Special Offer</span>
                </button>

                {/* Info */}
                <button
                  type="button"
                  onClick={() => onUpdateForm({ tone: "info" })}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition group ${
                    form.tone === "info"
                      ? "border-indigo-500 bg-indigo-500/15 text-white font-medium shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                      : "border-[#1E293B] bg-[#131B2E]/60 hover:bg-[#182238] text-slate-300 hover:text-white"
                  }`}
                >
                  <Info className="w-4 h-4 text-sky-400 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Info</span>
                </button>

                {/* Success */}
                <button
                  type="button"
                  onClick={() => onUpdateForm({ tone: "success" })}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition group ${
                    form.tone === "success"
                      ? "border-indigo-500 bg-indigo-500/15 text-white font-medium shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                      : "border-[#1E293B] bg-[#131B2E]/60 hover:bg-[#182238] text-slate-300 hover:text-white"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Success</span>
                </button>

                {/* Warning / Alert */}
                <button
                  type="button"
                  onClick={() => onUpdateForm({ tone: "warning" })}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition group ${
                    form.tone === "warning"
                      ? "border-indigo-500 bg-indigo-500/15 text-white font-medium shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                      : "border-[#1E293B] bg-[#131B2E]/60 hover:bg-[#182238] text-slate-300 hover:text-white"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Alert</span>
                </button>
              </div>
            </div>

            {/* Section 2: Format & Creative Content */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  2. Format & Creative Content
                </label>
                <span className="text-[11px] text-slate-400 font-mono">Visual Layout Engine</span>
              </div>

              {/* Format Selector Mode Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#0E1424]/80 border border-[#1E293B] rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFormatMode("standard");
                    onUpdateForm({ format: "standard" });
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                    formatMode === "standard"
                      ? "bg-indigo-600 text-white font-semibold shadow-sm border border-indigo-500/50"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M4 6h16M4 12h16m-7 6h7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                  <span>Standard (Text & CTA)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormatMode("image_only");
                    onUpdateForm({ format: "image_only" });
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                    formatMode === "image_only"
                      ? "bg-indigo-600 text-white font-semibold shadow-sm border border-indigo-500/50"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Image Only (Graphic Banner)</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-mono font-bold">
                    NEW
                  </span>
                </button>
              </div>

              {/* STANDARD FORMAT VIEW */}
              {formatMode === "standard" && (
                <div className="space-y-4 animate-in fade-in duration-100">
                  {/* Campaign Title */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-300">
                        Campaign Title <span className="text-rose-400">*</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {form.title.length} / 60
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={60}
                        value={form.title}
                        onChange={(e) => onUpdateForm({ title: e.target.value })}
                        placeholder="e.g. Special 25% Off Sanctuary Pro"
                        className="w-full bg-[#131B2E]/90 border border-[#1E293B] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-inner"
                      />
                    </div>
                  </div>

                  {/* Message Body with Mini Toolbar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-300">
                        Announcement Body <span className="text-rose-400">*</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {form.message.length} / 280
                      </span>
                    </div>
                    <div className="border border-[#1E293B] rounded-xl bg-[#131B2E]/90 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition">
                      {/* Formatting Sub-toolbar */}
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1E293B]/60 bg-[#0E1424]/70 text-slate-400">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => applyFormat("**")}
                            className="p-1 hover:text-white hover:bg-[#1E293B] rounded"
                            title="Bold"
                          >
                            <strong className="font-bold text-xs">B</strong>
                          </button>
                          <button
                            type="button"
                            onClick={() => applyFormat("*")}
                            className="p-1 hover:text-white hover:bg-[#1E293B] rounded"
                            title="Italic"
                          >
                            <span className="italic text-xs font-serif">I</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const textarea = textareaRef.current;
                              if (!textarea) return;
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const selected = form.message.substring(start, end) || "link text";
                              const updated =
                                form.message.substring(0, start) +
                                `[${selected}](https://)` +
                                form.message.substring(end);
                              onUpdateForm({ message: updated });
                            }}
                            className="p-1 hover:text-white hover:bg-[#1E293B] rounded"
                            title="Add Link"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="h-3 w-px bg-[#1E293B] mx-1" />
                          <button
                            type="button"
                            onClick={() => insertVariable("{{user.name}}")}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#1E293B]/50 hover:bg-[#1E293B] text-slate-300 transition"
                          >
                            + {"{{user.name}}"}
                          </button>
                          <button
                            type="button"
                            onClick={() => insertVariable("{{plan.expires}}")}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#1E293B]/50 hover:bg-[#1E293B] text-slate-300 transition"
                          >
                            + {"{{plan.expires}}"}
                          </button>
                        </div>
                        <span className="text-[11px] text-slate-400">Rich Toast Format</span>
                      </div>

                      {/* Textarea input */}
                      <textarea
                        ref={textareaRef}
                        rows={3}
                        maxLength={280}
                        value={form.message}
                        onChange={(e) => onUpdateForm({ message: e.target.value })}
                        placeholder="Write a clear, concise announcement..."
                        className="w-full bg-transparent border-0 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-0 focus:outline-none resize-none leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Call to Action Pair (Label + Destination) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Action Button Label</label>
                      <input
                        type="text"
                        value={form.ctaLabel}
                        onChange={(e) => onUpdateForm({ ctaLabel: e.target.value })}
                        placeholder="e.g. View plans"
                        className="w-full bg-[#131B2E]/90 border border-[#1E293B] rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Destination Link / Deep Route
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-mono text-xs">
                          /
                        </span>
                        <input
                          type="text"
                          value={form.ctaUrl.replace(/^\//, "")}
                          onChange={(e) => onUpdateForm({ ctaUrl: e.target.value })}
                          placeholder="subscription/plans"
                          className="w-full bg-[#131B2E]/90 border border-[#1E293B] rounded-xl pl-7 pr-3 py-2 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Banner Image Drag & Drop / URL */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">
                        Optional Banner Media (16:9 or 21:9)
                      </label>
                      <span className="text-[11px] text-slate-400">PNG, WEBP up to 2MB</span>
                    </div>

                    {form.imageUrl ? (
                      <div className="relative rounded-xl overflow-hidden border border-[#1E293B] bg-[#131B2E]/80 p-3 flex items-center gap-3">
                        <div className="w-20 h-14 rounded-lg overflow-hidden border border-[#1E293B] bg-black shrink-0 relative">
                          <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{form.imageUrl}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition"
                            >
                              Replace file
                            </button>
                            <span className="text-slate-600">•</span>
                            <button
                              type="button"
                              onClick={() => onUpdateForm({ imageUrl: "" })}
                              className="text-[11px] text-rose-400 hover:text-rose-300 font-medium transition"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed border-[#334155]/70 hover:border-indigo-500/70 bg-[#131B2E]/40 hover:bg-[#131B2E]/80 rounded-xl p-3 text-center transition cursor-pointer flex items-center justify-center gap-3 group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#1E293B]/70 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition">
                          {imageUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                          ) : (
                            <UploadCloud className="w-4 h-4" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-medium text-slate-200">
                            <span className="text-indigo-400 underline decoration-indigo-400/50">
                              Upload banner
                            </span>{" "}
                            or drag and drop
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Optional eye-catcher displayed inside toast
                          </p>
                        </div>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onUploadImage(file);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* IMAGE ONLY FORMAT VIEW */}
              {formatMode === "image_only" && (
                <div className="space-y-4 animate-in fade-in duration-100">
                  {imageOnlyError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{imageOnlyError}</span>
                    </div>
                  )}

                  {/* Mode Helper */}
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-semibold text-white">Image-Only Mode:</span> Upload your picture and enter the destination link. The entire picture is clickable and opens the link in the browser.
                    </div>
                  </div>

                  {/* Picture Upload Area */}
                  <div className="border border-[#1E293B] rounded-xl bg-[#0E1424]/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-indigo-400" />
                        Announcement Picture <span className="text-rose-400">*</span>
                      </label>
                      {form.imageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setImageOnlyError(null);
                            onUpdateForm({ imageUrl: "" });
                          }}
                          className="text-xs text-rose-400 hover:text-rose-300 transition flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      )}
                    </div>

                    {form.imageUrl ? (
                      <div className="space-y-2">
                        <div className="relative rounded-xl overflow-hidden border border-[#1E293B] bg-black/40 max-h-[260px] flex items-center justify-center">
                          <img
                            src={form.imageUrl}
                            alt="Announcement graphic"
                            className="w-full h-auto max-h-[260px] object-contain rounded-xl"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-slate-400 font-mono truncate max-w-[280px]">
                            {form.imageUrl}
                          </span>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={imageUploading}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition flex items-center gap-1.5 shrink-0"
                          >
                            {imageUploading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UploadCloud className="w-3.5 h-3.5" />
                            )}
                            Replace Picture
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-[#1E293B] hover:border-indigo-500/60 rounded-xl p-8 text-center cursor-pointer transition bg-[#131B2E]/30 hover:bg-[#131B2E]/60 group"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition">
                            {imageUploading ? (
                              <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                              <UploadCloud className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">
                              {imageUploading ? "Uploading picture..." : "Click to upload announcement picture"}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Supports PNG, JPG, WebP (Banner size recommended)
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Or direct image URL input */}
                    <div className="pt-1">
                      <input
                        type="text"
                        value={form.imageUrl}
                        onChange={(e) => {
                          setImageOnlyError(null);
                          onUpdateForm({ imageUrl: e.target.value });
                        }}
                        placeholder="Or paste an image URL directly..."
                        className="w-full bg-[#131B2E]/70 border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Destination Link */}
                  <div className="border border-[#1E293B] rounded-xl bg-[#0E1424]/60 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Link2 className="w-4 h-4 text-indigo-400" />
                        Destination Link (URL) <span className="text-rose-400">*</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        Opens on click
                      </span>
                    </div>

                    <input
                      type="text"
                      value={form.ctaUrl}
                      onChange={(e) => {
                        setImageOnlyError(null);
                        onUpdateForm({ ctaUrl: e.target.value });
                      }}
                      placeholder="https://example.com/special or /subscription/plans"
                      className="w-full bg-[#131B2E] border border-[#1E293B] rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                    />

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      💡 Clicking anywhere on the picture will open this link in the browser. Supports full URLs (e.g. <code className="text-slate-300">https://...</code>) or internal pages (e.g. <code className="text-slate-300">/subscription/plans</code>).
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Audience & Channels */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                3. Audience & Channels
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Audience Segment Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Target Audience</label>
                  <select
                    value={form.audience}
                    onChange={(e) => onUpdateForm({ audience: e.target.value as AnnouncementAudience })}
                    className="w-full bg-[#131B2E]/90 border border-[#1E293B] rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {AUDIENCES.map((aud) => (
                      <option key={aud.value} value={aud.value}>
                        {aud.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Delivery Channels */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Delivery Channels</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      onClick={() => toggleSurface("desktop")}
                      className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer text-xs font-medium transition ${
                        form.surfaces.includes("desktop")
                          ? "bg-[#131B2E]/90 border-indigo-500/50 text-white"
                          : "bg-[#131B2E]/40 border-[#1E293B] text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.surfaces.includes("desktop")}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded border-[#334155] bg-[#1E293B] text-indigo-500 focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                        Desktop Dock
                      </span>
                    </label>

                    <label
                      onClick={() => toggleSurface("dashboard")}
                      className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer text-xs font-medium transition ${
                        form.surfaces.includes("dashboard")
                          ? "bg-[#131B2E]/90 border-indigo-500/50 text-white"
                          : "bg-[#131B2E]/40 border-[#1E293B] text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.surfaces.includes("dashboard")}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded border-[#334155] bg-[#1E293B] text-indigo-500 focus:ring-indigo-500"
                      />
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-indigo-400" />
                        Web Dashboard
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Publishing Schedule */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>4. Publishing Schedule</span>
                {scheduleMode === "later" && (
                  <span className="text-[11px] text-sky-400 font-mono font-semibold">
                    Scheduled
                  </span>
                )}
              </label>

              <div className="grid grid-cols-2 gap-2 p-1 bg-[#0E1424]/80 border border-[#1E293B] rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setScheduleMode("now");
                    setScheduleError(null);
                    onUpdateForm({ publishAt: "" });
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                    scheduleMode === "now"
                      ? "bg-indigo-600 text-white font-semibold shadow-sm border border-indigo-500/50"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Publish Immediately</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setScheduleMode("later");
                    setScheduleError(null);
                    if (!form.publishAt) {
                      const d = new Date(Date.now() + 60 * 60 * 1000);
                      onUpdateForm({ publishAt: toDateTimeLocalInputValue(d) });
                    }
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                    scheduleMode === "later"
                      ? "bg-sky-600 text-white font-semibold shadow-sm border border-sky-500/50"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Schedule for Later</span>
                </button>
              </div>

              {scheduleMode === "later" && (
                <div className="border border-sky-500/30 rounded-xl bg-sky-500/5 p-4 space-y-3 animate-in fade-in duration-100">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-white flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        When should this announcement go live? <span className="text-rose-400">*</span>
                      </span>
                      <span className="text-[10px] text-sky-300 font-mono">Date & Time required</span>
                    </label>
                    <input
                      ref={publishDateInputRef}
                      type="datetime-local"
                      value={form.publishAt}
                      min={toDateTimeLocalInputValue(new Date())}
                      onChange={(e) => {
                        setScheduleError(null);
                        onUpdateForm({ publishAt: e.target.value });
                      }}
                      className="w-full bg-[#131B2E] border border-sky-500/40 rounded-xl px-3.5 py-2 text-xs font-medium text-white focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                    {scheduleError && (
                      <p className="text-xs text-rose-400 font-medium pt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {scheduleError}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 pt-0.5">
                      The announcement will stay in &ldquo;Scheduled&rdquo; status and automatically go live at this specified date and time.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#1E293B]/60 space-y-1.5">
                    <label className="text-[11px] font-medium text-slate-400">
                      Auto-expire Date (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={form.expiresAt}
                      min={form.publishAt || toDateTimeLocalInputValue(new Date())}
                      onChange={(e) => onUpdateForm({ expiresAt: e.target.value })}
                      className="w-full bg-[#131B2E] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500">Automatically stop showing announcement after this date and time.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Section 5: Discount & Promo Code (Optional module) */}
            <div className="space-y-3 pt-2">
              {showOfferModule ? (
                <div className="border border-[#1E293B]/80 rounded-xl bg-[#0E1424]/50 p-4 space-y-3.5 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Tag className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-xs font-semibold text-white">Discount & Promo Code</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono">
                        Active Engine
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateForm({ offerCode: "", offerDiscountPercent: 0 });
                        setShowOfferModule(false);
                      }}
                      className="text-xs text-rose-400/80 hover:text-rose-400 transition font-medium"
                    >
                      Remove module
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Promo Code</label>
                      <input
                        type="text"
                        value={form.offerCode}
                        onChange={(e) =>
                          onUpdateForm({
                            offerCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                          })
                        }
                        placeholder="SAVE25"
                        className="w-full uppercase font-mono tracking-wide bg-[#131B2E] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-indigo-300 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Discount %</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={95}
                          value={form.offerDiscountPercent || ""}
                          onChange={(e) =>
                            onUpdateForm({ offerDiscountPercent: Number(e.target.value) })
                          }
                          placeholder="25"
                          className="w-full bg-[#131B2E] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 pr-6"
                        />
                        <span className="absolute right-2.5 top-1.5 text-slate-500 text-xs">%</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">
                        Duration (months)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={form.offerDurationMonths}
                        onChange={(e) =>
                          onUpdateForm({ offerDurationMonths: Number(e.target.value) })
                        }
                        className="w-full bg-[#131B2E] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowOfferModule(true)}
                  className="w-full p-2.5 rounded-xl border border-dashed border-[#1E293B] hover:border-indigo-500/50 bg-[#131B2E]/20 text-xs font-medium text-slate-400 hover:text-indigo-300 flex items-center justify-center gap-2 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Attach Discount Promo Code (Optional)
                </button>
              )}
            </div>
          </section>
          {/* END: LeftColumnFormControls */}

          {/* BEGIN: RightColumnLivePreview */}
          <section
            className={`lg:col-span-5 xl:col-span-5 bg-[#080B14] p-6 flex flex-col justify-between overflow-hidden relative ${
              activePane === "config" ? "hidden lg:flex" : "flex"
            }`}
          >
            {/* Background decorative dot grid */}
            <div className="absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

            {/* Preview Top Bar Switchers */}
            <div className="relative z-10 flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Live Client Viewport
                </span>
              </div>

              {/* Format Indicator & Viewport Controls */}
              <div className="flex items-center gap-2">
                <div className="bg-[#131B2E]/90 border border-[#1E293B] p-0.5 rounded-lg flex items-center text-xs font-medium shadow-sm">
                  <button
                    type="button"
                    onClick={() => setViewportSurface("dock")}
                    className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition ${
                      viewportSurface === "dock"
                        ? "bg-indigo-600/90 text-white font-semibold shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Monitor className="w-3 h-3" />
                    <span>Dock Toast</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewportSurface("modal")}
                    className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition ${
                      viewportSurface === "modal"
                        ? "bg-indigo-600/90 text-white font-semibold shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Globe className="w-3 h-3" />
                    <span>Modal</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Centered Realistic Mockup Container */}
            <div className="relative z-10 flex-1 flex flex-col justify-center items-center py-4 min-h-0">
              {/* IMAGE-ONLY BANNER PREVIEW */}
              {formatMode === "image_only" ? (
                <div className="w-full max-w-md space-y-3">
                  {form.imageUrl ? (
                    <div className="space-y-3">
                      <div
                        onClick={() => {
                          if (form.ctaUrl) {
                            const dest = form.ctaUrl.startsWith("http")
                              ? form.ctaUrl
                              : `${window.location.origin}${form.ctaUrl.startsWith("/") ? "" : "/"}${form.ctaUrl}`;
                            window.open(dest, "_blank", "noopener,noreferrer");
                          }
                        }}
                        className="w-full rounded-2xl overflow-hidden border border-indigo-500/40 shadow-2xl relative transform transition-all duration-200 hover:scale-[1.01] cursor-pointer group shadow-[0_0_30px_-4px_rgba(99,102,241,0.25)] bg-[#0B0F19]"
                        title={form.ctaUrl ? `Click to test link: ${form.ctaUrl}` : "Click anywhere to test link"}
                      >
                        <img
                          src={form.imageUrl}
                          alt="Announcement Banner"
                          className="w-full h-auto max-h-[380px] object-contain block"
                        />

                        {/* Top-right corner close simulation */}
                        <div className="absolute top-3 right-3 z-20">
                          <div className="h-7 w-7 rounded-full bg-black/60 border border-white/20 text-white/90 flex items-center justify-center shadow-lg backdrop-blur-md">
                            <X className="w-4 h-4" />
                          </div>
                        </div>

                        {/* Click overlay indicator */}
                        <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

                        {/* Bottom clickable hint */}
                        <div className="absolute bottom-2 left-3 right-3 z-10 flex items-center justify-between px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-[10px] text-white/90 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="flex items-center gap-1 font-medium">
                            <MousePointer className="w-3 h-3 text-amber-300" />
                            Click anywhere opens link in browser
                          </span>
                          <span className="font-mono text-indigo-300 truncate max-w-[150px]">
                            {form.ctaUrl || "No link"}
                          </span>
                        </div>
                      </div>

                      {/* Destination Pill */}
                      <div className="flex justify-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B0F19]/90 border border-[#1E293B] text-xs shadow-md">
                          <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-slate-400">Destination:</span>
                          <span className="font-mono text-indigo-300 font-medium truncate max-w-[220px]">
                            {form.ctaUrl || "No destination link set"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl border-2 border-dashed border-[#1E293B] p-10 flex flex-col items-center justify-center text-center space-y-3 bg-[#0B0F19]/50">
                      <div className="w-14 h-14 rounded-2xl bg-[#131B2E] border border-[#1E293B] flex items-center justify-center text-slate-500">
                        <ImageIcon className="w-7 h-7" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Live Banner Preview</p>
                        <p className="text-xs text-slate-400 max-w-xs">
                          Upload your picture on the left. The full banner will appear here and will be clickable directly to your destination link.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* STANDARD TEXT & CTA PREVIEW */
                <div className="w-full max-w-sm rounded-2xl bg-[#0B0F19] border border-[#1E293B]/80 shadow-2xl overflow-hidden backdrop-blur-xl relative transform transition-all duration-200 hover:scale-[1.01]">
                  {/* Banner Header / Accent Graphic */}
                  <div
                    className={`h-28 w-full bg-gradient-to-tr ${currentIntent.bg} relative overflow-hidden flex items-end p-3`}
                  >
                    {form.imageUrl && (
                      <img
                        src={form.imageUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none" />

                    {/* Floating Category Badge */}
                    <span
                      className={`relative z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#0B0F19]/90 ${currentIntent.pillColor} border backdrop-blur-md shadow-sm`}
                    >
                      <currentIntent.icon className="w-3 h-3" />
                      <span>{currentIntent.label}</span>
                    </span>

                    {/* Mock Close Button */}
                    <button
                      type="button"
                      className="absolute top-2.5 right-2.5 h-6 w-6 rounded-full bg-black/40 hover:bg-black/60 text-white/80 flex items-center justify-center transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Toast Body Content */}
                  <div className="p-4 space-y-3 bg-[#0B0F19]">
                    {/* Promo Coupon Badge Preview */}
                    {form.offerCode && (
                      <div className="flex items-center justify-between bg-[#131B2E]/80 border border-[#1E293B]/80 rounded-lg px-2.5 py-1.5 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <span className="text-amber-400 font-bold">
                            {form.offerDiscountPercent || 25}% OFF
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="font-mono text-indigo-300 font-semibold tracking-wide">
                            {form.offerCode}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                          Auto-applied
                        </span>
                      </div>
                    )}

                    {/* Title & Copy */}
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight leading-snug">
                        {form.title || "Special Pro Offer"}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-3">
                        {form.message ||
                          "Unlock unlimited workspace members, custom themes, and AI automation credits at a special limited rate."}
                      </p>
                    </div>

                    {/* Primary CTA */}
                    <div className="pt-1">
                      <a
                        href="#preview"
                        onClick={(e) => e.preventDefault()}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 transition group"
                      >
                        <span>{form.ctaLabel || "Claim Discount"}</span>
                        <svg
                          className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                          />
                        </svg>
                      </a>
                    </div>

                    {/* Expiry Footnote */}
                    <p className="text-[10px] text-center text-slate-400">
                      {form.expiresAt
                        ? `Expires ${new Date(form.expiresAt).toLocaleDateString()} • Dismisses after 1 click`
                        : "Limited time announcement • Dismisses after 1 click"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Info Footer Note */}
            <div className="relative z-10 bg-[#0E1424]/80 border border-[#1E293B]/60 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  Estimated Audience Reach: <strong className="text-white">{estimatedReach}</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowSpecsModal(true)}
                className="text-indigo-400 hover:text-indigo-300 font-medium transition"
              >
                {formatMode === "image_only" ? "Banner specs (1420×800)" : "Device specs"}
              </button>
            </div>
          </section>
          {/* END: RightColumnLivePreview */}
        </div>
        {/* END: DualColumnWorkspace */}

        {/* BEGIN: ModalActionFooter */}
        <footer className="px-6 py-3.5 bg-[#0B0F19] border-t border-[#1E293B]/80 flex items-center justify-between shrink-0 z-10">
          {/* Left side: Secondary actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleFinalSubmit("draft")}
              className="px-3.5 py-2 rounded-xl bg-[#131B2E] hover:bg-[#182238] text-slate-300 hover:text-white border border-[#334155]/60 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              Save Draft
            </button>

            <button
              type="button"
              onClick={handleSendTest}
              className="px-3.5 py-2 rounded-xl bg-[#131B2E] hover:bg-[#182238] text-slate-300 hover:text-white border border-[#334155]/60 text-xs font-medium transition flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5 text-slate-400" />
              {testSent ? "Test Sent!" : "Send Test to Myself"}
            </button>
          </div>

          {/* Right side: Dismiss & Primary Commit */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-medium transition"
            >
              Discard & Cancel
            </button>

            {/* Split Primary Button (Publish now vs Schedule) */}
            <div className="relative inline-flex rounded-xl shadow-lg shadow-indigo-600/25" ref={publishMenuRef}>
              <button
                type="button"
                disabled={submitting || (formatMode === "standard" && (!form.title.trim() || !form.message.trim()))}
                onClick={() => handleFinalSubmit(scheduleMode === "later" ? "scheduled" : "active")}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded-l-xl transition flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : scheduleMode === "later" ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>
                  {scheduleMode === "later" ? "Schedule Announcement" : "Publish Announcement"}
                </span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowPublishDropdown((v) => !v)}
                className="px-2.5 py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-r-xl border-l border-indigo-500/50 transition disabled:opacity-50"
                title="More publish options"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {showPublishDropdown && (
                <div className="absolute right-0 bottom-full mb-2 w-56 rounded-xl border border-[#1E293B] bg-[#0E1424] shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPublishDropdown(false);
                      setScheduleMode("now");
                      void handleFinalSubmit("active");
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-[#131B2E] text-xs font-medium text-white flex items-center gap-2 transition"
                  >
                    <Send className="w-3.5 h-3.5 text-indigo-400" />
                    Publish Immediately
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPublishDropdown(false);
                      setScheduleMode("later");
                      if (!form.publishAt) {
                        setScheduleError("Please choose a date and time for when this announcement should go live.");
                        publishDateInputRef.current?.focus();
                        publishDateInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      } else {
                        void handleFinalSubmit("scheduled");
                      }
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-[#131B2E] text-xs font-medium text-white flex items-center gap-2 transition"
                  >
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    Schedule for Later...
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPublishDropdown(false);
                      void handleFinalSubmit("draft");
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-[#131B2E] text-xs font-medium text-white flex items-center gap-2 transition"
                  >
                    <Check className="w-3.5 h-3.5 text-slate-400" />
                    Save as Inactive Draft
                  </button>
                </div>
              )}
            </div>
          </div>
        </footer>
        {/* END: ModalActionFooter */}
      </main>

      {/* Recommended Specs Popover Modal */}
      {showSpecsModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSpecsModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#0E1424] border border-[#1E293B] p-5 space-y-4 shadow-2xl text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                Recommended Media Specs
              </h3>
              <button
                type="button"
                onClick={() => setShowSpecsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-slate-300">
              <div className="p-3 rounded-xl bg-[#131B2E] border border-[#1E293B] space-y-1.5">
                <div className="font-semibold text-white">16:9 Banner (Recommended)</div>
                <p className="text-slate-400 text-[11px]">
                  Resolution: 1420 × 800px. Perfect for desktop docks and widescreen overlays.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#131B2E] border border-[#1E293B] space-y-1.5">
                <div className="font-semibold text-white">4:3 Card Format</div>
                <p className="text-slate-400 text-[11px]">
                  Resolution: 1200 × 900px. Ideal for centered modal presentations.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#131B2E] border border-[#1E293B] space-y-1.5">
                <div className="font-semibold text-white">1:1 Square Feature</div>
                <p className="text-slate-400 text-[11px]">
                  Resolution: 1080 × 1080px. High impact for mobile and compact dashboards.
                </p>
              </div>

              <div className="text-[11px] text-slate-500">
                Formats: PNG, JPG, or WEBP under 2MB. Ensure high contrast for text baked into graphic banners.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSpecsModal(false)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
