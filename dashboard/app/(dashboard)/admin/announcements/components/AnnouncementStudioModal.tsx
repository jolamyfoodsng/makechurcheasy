"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  AnnouncementAudience,
  AnnouncementButton,
  AnnouncementForm,
  AnnouncementLayout,
  AnnouncementSurface,
  ButtonStyle,
} from "../types";
import {
  AUDIENCES,
  CAMPAIGN_TEMPLATES,
  LAYOUTS,
  MAX_BUTTONS,
  MAX_HTML_LENGTH,
  MAX_MESSAGE_LENGTH,
  PROMO_TONES,
  STANDARD_TONES,
  STARTER_HTML,
  fromLocalInputValue,
  newButton,
} from "../types";
import { LiveAnnouncementPreview } from "./LiveAnnouncementPreview";

interface EditorProps {
  editingId: string | null;
  form: AnnouncementForm;
  submitting: boolean;
  imageUploading: boolean;
  onClose: () => void;
  onUpdateForm: (patch: Partial<AnnouncementForm>) => void;
  onSave: (status: "draft" | "active" | "scheduled") => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
}

const DESTINATIONS: Array<{ label: string; href: string }> = [
  { label: "Subscription plans", href: "/subscription/plans" },
  { label: "Subscription", href: "/subscription" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Downloads", href: "/downloads" },
  { label: "Credits", href: "/credits" },
  { label: "Referrals", href: "/referrals" },
  { label: "Support", href: "/support" },
  { label: "Tutorials", href: "/tutorials" },
  { label: "Settings", href: "/settings" },
  { label: "All features", href: "/features" },
  { label: "Bible", href: "/features/bible" },
  { label: "Worship", href: "/features/worship" },
  { label: "Lower thirds", href: "/features/lower-thirds" },
  { label: "Media", href: "/features/media" },
  { label: "Multi-view", href: "/features/multiview" },
  { label: "Pricing", href: "/pricing" },
  { label: "Documentation", href: "/docs" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

function validUrl(value: string): boolean {
  const url = value.trim();
  if (/^https?:\/\//i.test(url)) {
    try {
      return Boolean(new URL(url).hostname);
    } catch {
      return false;
    }
  }
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return true;
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="adm-card p-5">
      <h2 className="text-[14px] font-semibold text-[var(--mce-admin-text)]">{title}</h2>
      {hint ? <p className="mt-0.5 text-[12px] text-[var(--mce-admin-text-muted)]">{hint}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <span className={`text-[12px] tabular-nums ${value > max * 0.95 ? "text-[var(--mce-admin-warning)]" : "text-[var(--mce-admin-text-muted)]"}`}>
      {value.toLocaleString()} / {max.toLocaleString()}
    </span>
  );
}

export function AnnouncementStudioModal({
  editingId,
  form,
  submitting,
  imageUploading,
  onClose,
  onUpdateForm,
  onSave,
  onUploadImage,
}: EditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);
  const [when, setWhen] = useState<"now" | "later">(
    form.publishAt && new Date(form.publishAt).getTime() > Date.now() ? "later" : "now",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  useEffect(() => {
    if (!templateOpen) return;
    function onDown(event: MouseEvent) {
      if (templateRef.current && !templateRef.current.contains(event.target as Node)) setTemplateOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [templateOpen]);

  const layout = form.layout;
  const isPromo = layout === "promo";
  const tones = isPromo ? PROMO_TONES : STANDARD_TONES;

  function setLayout(next: AnnouncementLayout) {
    const patch: Partial<AnnouncementForm> = { layout: next };
    // Offer and upgrade tones only exist for the discount layout, because older apps
    // switch to the discount design whenever they see them.
    if (next === "promo" && !["offer", "upgrade"].includes(form.tone)) patch.tone = "offer";
    if (next !== "promo" && ["offer", "upgrade"].includes(form.tone)) patch.tone = "info";
    if (next === "custom" && !form.bodyHtml.trim()) patch.bodyHtml = STARTER_HTML;
    if (next === "image_only" && form.buttons.length === 0) patch.buttons = [newButton({ label: "Open", url: "" })];
    onUpdateForm(patch);
  }

  function updateButton(id: string, patch: Partial<AnnouncementButton>) {
    onUpdateForm({ buttons: form.buttons.map((button) => (button.id === id ? { ...button, ...patch } : button)) });
  }

  function moveButton(index: number, delta: number) {
    const next = [...form.buttons];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onUpdateForm({ buttons: next });
  }

  function toggleSurface(surface: AnnouncementSurface) {
    const has = form.surfaces.includes(surface);
    const next = has ? form.surfaces.filter((item) => item !== surface) : [...form.surfaces, surface];
    if (next.length > 0) onUpdateForm({ surfaces: next });
  }

  function validate(status: "draft" | "active" | "scheduled"): string | null {
    if (!form.title.trim()) return "Add a title.";
    if (status === "draft") return null;
    if (layout === "image_only") {
      if (!form.imageUrl) return "Upload the image people will see.";
      const link = form.buttons[0]?.url.trim();
      if (!link) return "Add the link that opens when the image is clicked.";
    } else if (layout === "custom") {
      if (!form.bodyHtml.trim()) return "Write the HTML to show.";
      if (form.bodyHtml.length > MAX_HTML_LENGTH) return "The HTML is too long.";
    } else if (!form.message.trim() && !form.imageUrl) {
      return "Add a message or an image.";
    }
    for (const [index, button] of form.buttons.entries()) {
      const empty = !button.label.trim() && !button.url.trim();
      if (empty) continue;
      if (layout !== "image_only" && !button.label.trim()) return `Button ${index + 1} needs a label.`;
      if (!validUrl(button.url)) {
        return `Button ${index + 1} needs a link that starts with https://, mailto: or /.`;
      }
    }
    if (isPromo) {
      if (!form.offerCode.trim()) return "Add a promo code for the discount.";
      if (!(form.offerDiscountPercent >= 1 && form.offerDiscountPercent <= 95)) return "Discount must be between 1% and 95%.";
    }
    if (status === "scheduled") {
      const iso = fromLocalInputValue(form.publishAt);
      if (!iso || new Date(iso).getTime() <= Date.now()) return "Pick a start time in the future.";
    }
    const end = fromLocalInputValue(form.expiresAt);
    if (end && new Date(end).getTime() <= Date.now()) return "The end time has already passed.";
    if (end && when === "later") {
      const start = fromLocalInputValue(form.publishAt);
      if (start && new Date(end).getTime() <= new Date(start).getTime()) return "The end time must be after the start time.";
    }
    return null;
  }

  async function submit(status: "draft" | "active" | "scheduled") {
    const problem = validate(status);
    setError(problem);
    if (problem) return;
    await onSave(status);
  }

  const publishStatus = when === "later" ? "scheduled" : "active";
  const audience = AUDIENCES.find((item) => item.value === form.audience);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--mce-admin-bg)]" role="dialog" aria-modal="true" aria-label="Announcement editor">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--mce-admin-border)] bg-[var(--mce-admin-surface)] px-4">
        <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close editor" disabled={submitting}>
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-[var(--mce-admin-text)]">
            {editingId ? "Edit announcement" : "New announcement"}
          </div>
        </div>

        <div className="relative" ref={templateRef}>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => setTemplateOpen((open) => !open)} aria-haspopup="menu" aria-expanded={templateOpen}>
            Start from a template
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {templateOpen && (
            <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-[var(--mce-admin-border-strong)] bg-[var(--mce-admin-surface-raised)] py-1 shadow-xl">
              {CAMPAIGN_TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--mce-admin-surface-hover)]"
                  onClick={() => {
                    if (
                      (form.title.trim() || form.message.trim()) &&
                      !window.confirm("Replace what you have written with this template?")
                    ) {
                      return;
                    }
                    onUpdateForm({ ...template.patch, buttons: (template.patch.buttons ?? []).map((b) => ({ ...b })) });
                    setTemplateOpen(false);
                    setError(null);
                  }}
                >
                  <template.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mce-admin-text-muted)]" />
                  <span>
                    <span className="block text-[13px] font-medium text-[var(--mce-admin-text)]">{template.name}</span>
                    <span className="block text-[12px] text-[var(--mce-admin-text-muted)]">{template.tagline}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="adm-btn adm-btn--sm" disabled={submitting} onClick={() => void submit("draft")}>
          Save draft
        </button>
        <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" disabled={submitting} onClick={() => void submit(publishStatus)}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {when === "later" ? "Schedule" : editingId ? "Save and publish" : "Publish"}
        </button>
      </header>

      {error && (
        <div role="alert" className="border-b border-[var(--mce-admin-border)] bg-[rgba(240,113,111,0.1)] px-4 py-2 text-[13px] text-[var(--mce-admin-danger)]">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-[680px] space-y-4 px-5 py-6">
            <Section title="Format">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LAYOUTS.map((item) => {
                  const active = layout === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setLayout(item.value)}
                      aria-pressed={active}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? "border-[var(--mce-admin-accent)] bg-[var(--mce-admin-accent-soft)]"
                          : "border-[var(--mce-admin-border-strong)] hover:bg-[var(--mce-admin-surface-raised)]"
                      }`}
                    >
                      <item.icon className={`h-4 w-4 ${active ? "text-[var(--mce-admin-accent-bright)]" : "text-[var(--mce-admin-text-muted)]"}`} />
                      <div className="mt-2 text-[13px] font-medium text-[var(--mce-admin-text)]">{item.label}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-[var(--mce-admin-text-muted)]">{item.description}</div>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Content">
              <div>
                <div className="flex items-center justify-between">
                  <label className="adm-label" htmlFor="ann-title">Title</label>
                  <Counter value={form.title.length} max={120} />
                </div>
                <input id="ann-title" className="adm-input" maxLength={120} value={form.title} onChange={(e) => onUpdateForm({ title: e.target.value })} placeholder="What is this about?" />
                {layout === "image_only" && <p className="adm-hint">Only you see this. It names the announcement in your list.</p>}
              </div>

              {layout !== "image_only" && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="adm-label" htmlFor="ann-message">
                      {layout === "custom" ? "Fallback text" : "Message"}
                    </label>
                    <Counter value={form.message.length} max={MAX_MESSAGE_LENGTH} />
                  </div>
                  <textarea
                    id="ann-message"
                    className="adm-input"
                    rows={layout === "custom" ? 2 : 6}
                    maxLength={MAX_MESSAGE_LENGTH}
                    value={form.message}
                    onChange={(e) => onUpdateForm({ message: e.target.value })}
                    placeholder={layout === "custom" ? "Shown by older app versions that cannot display custom HTML." : "Write your message. Line breaks are kept."}
                  />
                </div>
              )}

              {layout === "custom" && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="adm-label" htmlFor="ann-html">HTML and CSS</label>
                    <Counter value={form.bodyHtml.length} max={MAX_HTML_LENGTH} />
                  </div>
                  <textarea
                    id="ann-html"
                    className="adm-input adm-code"
                    rows={14}
                    spellCheck={false}
                    value={form.bodyHtml}
                    onChange={(e) => onUpdateForm({ bodyHtml: e.target.value })}
                    placeholder="<div>Your HTML here</div>"
                  />
                  <p className="adm-hint">
                    Use inline styles or a style tag. Scripts are removed. Links open in the app or browser and each click is counted.
                    The preview on the right updates as you type.
                  </p>
                  <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm mt-2" onClick={() => onUpdateForm({ bodyHtml: STARTER_HTML })}>
                    Reset to starter HTML
                  </button>
                </div>
              )}

              {layout !== "custom" && (
                <div>
                  <label className="adm-label">
                    {layout === "image_only" ? "Image" : "Image (optional)"}
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      e.currentTarget.value = "";
                      if (file) void onUploadImage(file);
                    }}
                  />
                  {form.imageUrl ? (
                    <div className="flex items-center gap-3 rounded-lg border border-[var(--mce-admin-border-strong)] p-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.imageUrl} alt="" className="h-14 w-24 rounded-md object-cover" />
                      <div className="flex-1 text-[12px] text-[var(--mce-admin-text-muted)]">Image added</div>
                      <button type="button" className="adm-btn adm-btn--sm" onClick={() => fileRef.current?.click()} disabled={imageUploading}>
                        Replace
                      </button>
                      <button type="button" className="adm-icon-btn" aria-label="Remove image" onClick={() => onUpdateForm({ imageUrl: "" })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={imageUploading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--mce-admin-border-strong)] py-5 text-[13px] text-[var(--mce-admin-text-secondary)] hover:bg-[var(--mce-admin-surface-raised)]"
                    >
                      {imageUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                      Upload an image
                    </button>
                  )}
                  <p className="adm-hint">PNG, JPG, WebP or GIF, up to 5 MB.{layout === "image_only" ? " 16:9 works best." : ""}</p>
                </div>
              )}

              {layout !== "image_only" && layout !== "custom" && (
                <div>
                  <label className="adm-label">Style</label>
                  <div className="adm-seg" role="group" aria-label="Style">
                    {tones.map((tone) => (
                      <button
                        key={tone.value}
                        type="button"
                        className={`adm-seg__item ${form.tone === tone.value ? "adm-seg__item--active" : ""}`}
                        onClick={() => onUpdateForm({ tone: tone.value })}
                      >
                        {tone.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {layout !== "custom" && (
              <Section
                title={layout === "image_only" ? "Link" : "Buttons"}
                hint={
                  layout === "image_only"
                    ? "Where people go when they click the image."
                    : `Add up to ${MAX_BUTTONS}. The first one is the main action.`
                }
              >
                <datalist id="ann-destinations">
                  {DESTINATIONS.map((item) => (
                    <option key={item.href} value={item.href}>
                      {item.label}
                    </option>
                  ))}
                </datalist>

                {(layout === "image_only" ? form.buttons.slice(0, 1) : form.buttons).map((button, index) => (
                  <div key={button.id} className="rounded-lg border border-[var(--mce-admin-border-strong)] p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
                      {layout !== "image_only" && (
                        <div>
                          <label className="adm-label" htmlFor={`btn-label-${button.id}`}>Label</label>
                          <input id={`btn-label-${button.id}`} className="adm-input" maxLength={40} value={button.label} onChange={(e) => updateButton(button.id, { label: e.target.value })} placeholder="e.g. Learn more" />
                        </div>
                      )}
                      <div className={layout === "image_only" ? "sm:col-span-2" : ""}>
                        <label className="adm-label" htmlFor={`btn-url-${button.id}`}>Opens</label>
                        <input
                          id={`btn-url-${button.id}`}
                          className="adm-input"
                          list="ann-destinations"
                          value={button.url}
                          onChange={(e) => updateButton(button.id, { url: e.target.value })}
                          placeholder="https://example.com or /subscription/plans"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    {layout !== "image_only" && (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="adm-seg" role="group" aria-label="Button style">
                          {(["primary", "secondary", "link"] as ButtonStyle[]).map((style) => (
                            <button
                              key={style}
                              type="button"
                              className={`adm-seg__item capitalize ${button.style === style ? "adm-seg__item--active" : ""}`}
                              onClick={() => updateButton(button.id, { style })}
                            >
                              {style === "link" ? "Text link" : style}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center">
                          <button type="button" className="adm-icon-btn" aria-label="Move up" disabled={index === 0} onClick={() => moveButton(index, -1)}>
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button type="button" className="adm-icon-btn" aria-label="Move down" disabled={index === form.buttons.length - 1} onClick={() => moveButton(index, 1)}>
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button type="button" className="adm-icon-btn" aria-label="Remove button" onClick={() => onUpdateForm({ buttons: form.buttons.filter((item) => item.id !== button.id) })}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {layout === "image_only" && form.buttons.length === 0 && (
                  <button type="button" className="adm-btn" onClick={() => onUpdateForm({ buttons: [newButton({ label: "Open", url: "" })] })}>
                    <Plus className="h-4 w-4" />
                    Add link
                  </button>
                )}
                {layout !== "image_only" && (
                  <button
                    type="button"
                    className="adm-btn"
                    disabled={form.buttons.length >= MAX_BUTTONS}
                    onClick={() => onUpdateForm({ buttons: [...form.buttons, newButton({ style: form.buttons.length === 0 ? "primary" : "secondary" })] })}
                  >
                    <Plus className="h-4 w-4" />
                    Add button
                  </button>
                )}
              </Section>
            )}

            {isPromo && (
              <Section title="Discount" hint="The code is applied when people reach checkout from this announcement.">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="adm-label" htmlFor="ann-code">Promo code</label>
                    <input id="ann-code" className="adm-input" value={form.offerCode} onChange={(e) => onUpdateForm({ offerCode: e.target.value.toUpperCase() })} placeholder="SAVE25" />
                  </div>
                  <div>
                    <label className="adm-label" htmlFor="ann-percent">Discount (%)</label>
                    <input id="ann-percent" type="number" min={1} max={95} className="adm-input" value={form.offerDiscountPercent || ""} onChange={(e) => onUpdateForm({ offerDiscountPercent: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="adm-label" htmlFor="ann-months">Lasts (months)</label>
                    <input id="ann-months" type="number" min={1} max={60} className="adm-input" value={form.offerDurationMonths || ""} onChange={(e) => onUpdateForm({ offerDurationMonths: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="adm-label" htmlFor="ann-max">Redemption limit</label>
                    <input id="ann-max" type="number" min={0} className="adm-input" value={form.offerMaxRedemptions || ""} onChange={(e) => onUpdateForm({ offerMaxRedemptions: Number(e.target.value) })} placeholder="No limit" />
                  </div>
                  <fieldset>
                    <legend className="adm-label">Plans</legend>
                    <div className="flex gap-3 pt-1.5 text-[13px] text-[var(--mce-admin-text)]">
                      {(["basic", "growth"] as const).map((plan) => (
                        <label key={plan} className="flex items-center gap-1.5 capitalize">
                          <input
                            type="checkbox"
                            checked={form.offerApplicablePlans.includes(plan)}
                            onChange={(e) => {
                              const next = e.target.checked ? [...form.offerApplicablePlans, plan] : form.offerApplicablePlans.filter((p) => p !== plan);
                              if (next.length) onUpdateForm({ offerApplicablePlans: next });
                            }}
                          />
                          {plan}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="adm-label">Billing</legend>
                    <div className="flex gap-3 pt-1.5 text-[13px] text-[var(--mce-admin-text)]">
                      {(["monthly", "yearly"] as const).map((cycle) => (
                        <label key={cycle} className="flex items-center gap-1.5 capitalize">
                          <input
                            type="checkbox"
                            checked={form.offerApplicableBillingCycles.includes(cycle)}
                            onChange={(e) => {
                              const next = e.target.checked ? [...form.offerApplicableBillingCycles, cycle] : form.offerApplicableBillingCycles.filter((c) => c !== cycle);
                              if (next.length) onUpdateForm({ offerApplicableBillingCycles: next });
                            }}
                          />
                          {cycle}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </Section>
            )}

            <Section title="Who sees it">
              <div>
                <label className="adm-label" htmlFor="ann-audience">Audience</label>
                <select id="ann-audience" className="adm-input" value={form.audience} onChange={(e) => onUpdateForm({ audience: e.target.value as AnnouncementAudience })}>
                  {AUDIENCES.filter((item) => item.value !== "personal_offer_users" || form.audience === "personal_offer_users").map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {audience ? <p className="adm-hint">{audience.hint}</p> : null}
              </div>
              <fieldset>
                <legend className="adm-label">Show it in</legend>
                <div className="flex gap-5 text-[13px] text-[var(--mce-admin-text)]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.surfaces.includes("desktop")} onChange={() => toggleSurface("desktop")} />
                    Desktop app
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.surfaces.includes("dashboard")} onChange={() => toggleSurface("dashboard")} />
                    Web dashboard
                  </label>
                </div>
              </fieldset>
            </Section>

            <Section title="When">
              <div className="adm-seg" role="group" aria-label="When to publish">
                <button type="button" className={`adm-seg__item ${when === "now" ? "adm-seg__item--active" : ""}`} onClick={() => { setWhen("now"); onUpdateForm({ publishAt: "" }); }}>
                  Right away
                </button>
                <button type="button" className={`adm-seg__item ${when === "later" ? "adm-seg__item--active" : ""}`} onClick={() => setWhen("later")}>
                  Schedule
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {when === "later" && (
                  <div>
                    <label className="adm-label" htmlFor="ann-start">Starts</label>
                    <input id="ann-start" type="datetime-local" className="adm-input" value={form.publishAt} onChange={(e) => onUpdateForm({ publishAt: e.target.value })} />
                  </div>
                )}
                <div>
                  <label className="adm-label" htmlFor="ann-end">Ends (optional)</label>
                  <input id="ann-end" type="datetime-local" className="adm-input" value={form.expiresAt} onChange={(e) => onUpdateForm({ expiresAt: e.target.value })} />
                  <p className="adm-hint">Times use your local time zone.</p>
                </div>
              </div>
            </Section>

            <section className="adm-card">
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 text-left"
                onClick={() => setShowAdvanced((open) => !open)}
                aria-expanded={showAdvanced}
              >
                <span className="text-[14px] font-semibold text-[var(--mce-admin-text)]">Advanced</span>
                <ChevronDown className={`h-4 w-4 text-[var(--mce-admin-text-muted)] transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              </button>
              {showAdvanced && (
                <div className="space-y-4 border-t border-[var(--mce-admin-border)] p-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="adm-label" htmlFor="ann-priority">Priority</label>
                      <input id="ann-priority" type="number" min={-100} max={100} className="adm-input" value={form.priority} onChange={(e) => onUpdateForm({ priority: Number(e.target.value) })} />
                      <p className="adm-hint">Higher shows first.</p>
                    </div>
                    <div>
                      <label className="adm-label" htmlFor="ann-times">Times per person</label>
                      <input id="ann-times" type="number" min={1} max={5} className="adm-input" value={form.maxShowsPerUser} onChange={(e) => onUpdateForm({ maxShowsPerUser: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
                    </div>
                    <div>
                      <label className="adm-label" htmlFor="ann-gap">Minutes between repeats</label>
                      <input id="ann-gap" type="number" min={0} max={1440} className="adm-input" value={form.deliverySpacingMinutes} onChange={(e) => onUpdateForm({ deliverySpacingMinutes: Math.max(0, Number(e.target.value) || 0) })} />
                    </div>
                  </div>
                  <div>
                    <label className="adm-label" htmlFor="ann-emails">Only these people (optional)</label>
                    <textarea id="ann-emails" className="adm-input" rows={2} value={form.targetEmails} onChange={(e) => onUpdateForm({ targetEmails: e.target.value })} placeholder="name@church.org, other@church.org" />
                    <p className="adm-hint">Separate emails with commas. Leave empty to use the audience above.</p>
                  </div>
                  <div>
                    <label className="adm-label" htmlFor="ann-tags">Tags</label>
                    <input id="ann-tags" className="adm-input" value={form.tags} onChange={(e) => onUpdateForm({ tags: e.target.value })} placeholder="update, maintenance" />
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-[var(--mce-admin-border)] bg-[var(--mce-admin-surface)] p-5 lg:block">
          <div className="mb-3 text-[13px] font-semibold text-[var(--mce-admin-text)]">Preview</div>
          <LiveAnnouncementPreview
            data={{
              title: form.title,
              message: form.message,
              layout: form.layout,
              tone: form.tone,
              buttons: form.layout === "custom" ? [] : form.buttons,
              imageUrl: form.imageUrl,
              bodyHtml: form.bodyHtml,
              offerCode: form.offerCode,
              offerDiscountPercent: form.offerDiscountPercent,
              offerDurationMonths: form.offerDurationMonths,
            }}
          />
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--mce-admin-text-muted)]">
            A close approximation of the window people see. Fonts and spacing follow each app.
          </p>
        </aside>
      </div>
    </div>
  );
}
