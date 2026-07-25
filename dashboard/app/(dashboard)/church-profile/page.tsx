"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Landmark,
  Loader2,
  Plus,
  Trash2,
  Globe,
  Star,
  Check,
  ChevronDown,
  Upload,
  Mail,
  Phone,
  MapPin,
  Pencil,
  X,
} from "lucide-react";
import {
  getChurchProfile,
  updateChurchProfile,
  getCountries,
  type ChurchProfile as ChurchProfileType,
  type ChurchSpeaker,
  type ChurchSocialMedia,
  type Country,
} from "@/lib/api";
import { getUserId } from "@/lib/userId";
import { useAuth } from "@/contexts/AuthContext";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { getCountryDisplayName } from "@/lib/countryDisplay";
import imageCompression from "browser-image-compression";
import { Card, Button, Badge, EmptyState } from "@/components/ui";

// ─── Constants ──────────────────────────────────────────────────────────────

const EMPTY_PROFILE: Partial<ChurchProfileType> = {
  churchName: "",
  tagline: "",
  website: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  timezone: "",
  churchSize: "",
  branding: {
    logoUrl: "",
    primaryColor: "#4F46E5",
    secondaryColor: "#0F172A",
    accentColor: "#F59E0B",
    fontFamily: "Inter",
    faviconUrl: "",
  },
  presentationDefaults: {
    defaultTranslation: "King James Version (KJV)",
    lowerThirdStyle: "Modern - Blue",
    theme: "Default",
    language: "English",
  },
  speakers: [],
  socialMedia: {
    facebook: "",
    instagram: "",
    youtube: "",
    twitter: "",
    tiktok: "",
  },
};

const SOCIAL_FIELDS: {
  key: keyof ChurchSocialMedia;
  label: string;
  placeholder: string;
}[] = [
    { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourchurch" },
    { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourchurch" },
    { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourchurch" },
    { key: "twitter", label: "X (Twitter)", placeholder: "https://x.com/yourchurch" },
    { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourchurch" },
  ];

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidUrl(raw: string): boolean {
  if (!raw) return true;
  try {
    new URL(normalizeUrl(raw));
    return true;
  } catch {
    return false;
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FieldHelper({ text }: { text: string }) {
  return <p className="text-sm text-slate-500 mt-1">{text}</p>;
}

function SectionSaveButton({
  saving,
  saved,
  hasChanges,
  onSave,
}: {
  saving: boolean;
  saved: boolean;
  hasChanges: boolean;
  onSave: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-3">
      {saved && (
        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
          <Check className="w-4 h-4" /> {t("churchProfile.changesSaved")}
        </span>
      )}
      <Button
        onClick={onSave}
        disabled={saving || !hasChanges}
        size="sm"
        icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      >
        {saving ? t("churchProfile.saving") : t("churchProfile.save")}
      </Button>
    </div>
  );
}

function ProfileCompletionCard({
  profile,
  speakers,
}: {
  profile: Partial<ChurchProfileType>;
  speakers: ChurchSpeaker[];
}) {
  const t = useTranslations();
  const checks = useMemo(() => {
    const items: { label: string; done: boolean }[] = [
      { label: t("churchProfile.checkChurchName"), done: !!profile.churchName?.trim() },
      { label: t("churchProfile.checkLogo"), done: !!profile.branding?.logoUrl },
      { label: t("churchProfile.checkMainSpeaker"), done: speakers.some((s) => s.isMain && s.name.trim()) },
      { label: t("churchProfile.checkWebsite"), done: !!profile.website?.trim() },
      { label: t("churchProfile.checkEmail"), done: !!profile.email?.trim() },
      { label: t("churchProfile.checkPhone"), done: !!profile.phone?.trim() },
      { label: t("churchProfile.checkAddress"), done: !!profile.address?.trim() },
    ];
    return items;
  }, [profile, speakers, t]);

  const completed = checks.filter((c) => c.done).length;
  const pct = Math.round((completed / checks.length) * 100);

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900">{t("churchProfile.completionTitle")}</h2>
        <span className="text-2xl font-bold text-blue-700">{pct}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4">
        <div
          className="bg-blue-700 h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-sm">
            {c.done ? (
              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
            )}
            <span className={c.done ? "text-slate-700" : "text-slate-500"}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BrandingPreview({ branding }: { branding: ChurchProfileType["branding"] }) {
  const t = useTranslations();
  const primary = branding?.primaryColor || "#4F46E5";
  const secondary = branding?.secondaryColor || "#0F172A";
  const accent = branding?.accentColor || "#F59E0B";

  return (
    <div className="mt-6 pt-6 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        {t("churchProfile.livePreview")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Scripture Lower Third */}
        <div
          className="rounded-xl overflow-hidden border border-slate-200"
          style={{ background: secondary }}
        >
          <div className="h-16 flex items-end p-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-8 rounded-full" style={{ background: accent }} />
              <div>
                <p className="text-white text-xs font-bold leading-tight">
                  For God so loved the world
                </p>
                <p className="text-white/60 text-[10px]">John 3:16</p>
              </div>
            </div>
          </div>
          <div className="px-3 py-1.5 text-[10px] font-semibold" style={{ background: primary, color: "white" }}>
            {branding?.logoUrl ? (
              <span className="flex items-center gap-1">
                <img src={branding.logoUrl} alt="" className="w-4 h-4 rounded object-cover" />
                Church Name
              </span>
            ) : (
              "Church Name"
            )}
          </div>
        </div>

        {/* Speaker Overlay */}
        <div
          className="rounded-xl overflow-hidden border border-slate-200"
          style={{ background: secondary }}
        >
          <div className="p-3 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: primary }}
            >
              TA
            </div>
            <div>
              <p className="text-white text-xs font-bold">Tayo Akosile</p>
              <p className="text-white/60 text-[10px]">Lead Pastor</p>
            </div>
          </div>
          <div className="h-1" style={{ background: accent }} />
        </div>

        {/* Announcement Slide */}
        <div
          className="rounded-xl overflow-hidden border border-slate-200 p-3"
          style={{ background: primary }}
        >
          <p className="text-white/70 text-[10px] uppercase tracking-wider mb-1">Announcement</p>
          <p className="text-white text-xs font-bold mb-2">Sunday Service</p>
          <p className="text-white/60 text-[10px]">Join us every Sunday at 10 AM</p>
          <div className="mt-2 inline-block px-2 py-0.5 rounded text-xs font-bold" style={{ background: accent, color: secondary }}>
            Learn More
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeakerCard({
  speaker,
  index,
  onUpdate,
  onUploadImage,
  onClearImage,
  onRemove,
  onSetMain,
  uploading,
}: {
  speaker: ChurchSpeaker;
  index: number;
  onUpdate: (index: number, field: "name" | "role" | "imageUrl", value: string) => void;
  onUploadImage: (index: number, file: File) => void;
  onClearImage: (index: number) => void;
  onRemove: (index: number) => void;
  onSetMain: (index: number) => void;
  uploading: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`border rounded-xl p-4 transition-colors ${speaker.isMain ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${speaker.isMain ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
              }`}
          >
            {speaker.imageUrl ? (
              <img src={speaker.imageUrl} alt={speaker.name || "Speaker"} className="w-full h-full object-cover" />
            ) : (
              speaker.name ? speaker.name.charAt(0).toUpperCase() : "?"
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {speaker.name || "Unnamed Speaker"}
              </p>
              {speaker.isMain && (
                <Badge variant="warning" size="sm">
                  <Star className="w-4 h-4 fill-amber-500 inline mr-0.5" /> Main Pastor
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">
              {speaker.role || "No role assigned"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!speaker.isMain && (
            <button
              onClick={() => onSetMain(index)}
              className="px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
              title="Set as Main Pastor"
            >
              Set Main
            </button>
          )}
          <button
            onClick={() => setEditing(!editing)}
            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(index)}
            className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              value={speaker.name}
              onChange={(e) => onUpdate(index, "name", e.target.value)}
              placeholder="Full Name"
              className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Position</label>
            <input
              type="text"
              value={speaker.role}
              onChange={(e) => onUpdate(index, "role", e.target.value)}
              placeholder="e.g. Lead Pastor, Worship Leader"
              className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Profile Image</label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-500 text-sm font-semibold">
                {speaker.imageUrl ? (
                  <img src={speaker.imageUrl} alt={speaker.name || "Speaker"} className="w-full h-full object-cover" />
                ) : (
                  speaker.name ? speaker.name.charAt(0).toUpperCase() : "?"
                )}
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(index, file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
                className="h-[38px] px-3 rounded-lg border border-slate-200 text-sm font-medium text-blue-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                {uploading ? "Uploading..." : speaker.imageUrl ? "Change Image" : "Upload Image"}
              </button>
              {speaker.imageUrl && (
                <button
                  type="button"
                  onClick={() => onClearImage(index)}
                  className="h-[38px] px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ChurchProfile() {
  const rawUserId = getUserId();
  const { mongoUser } = useAuth();
  const userId = rawUserId || mongoUser?._id || null;

  const [profile, setProfile] = useState<Partial<ChurchProfileType>>(EMPTY_PROFILE);
  const [speakers, setSpeakers] = useState<ChurchSpeaker[]>([]);
  const [socialMedia, setSocialMedia] = useState<ChurchSocialMedia>({
    facebook: "", instagram: "", youtube: "", twitter: "", tiktok: "",
  });
  const [loading, setLoading] = useState(true);

  const [originalProfile, setOriginalProfile] = useState<Partial<ChurchProfileType> | null>(null);
  const [originalSpeakers, setOriginalSpeakers] = useState<ChurchSpeaker[]>([]);
  const [originalSocialMedia, setOriginalSocialMedia] = useState<ChurchSocialMedia>({
    facebook: "", instagram: "", youtube: "", twitter: "", tiktok: "",
  });

  const [sectionSaving, setSectionSaving] = useState<Record<string, boolean>>({});
  const [sectionSaved, setSectionSaved] = useState<Record<string, boolean>>({});

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingSpeakerIndex, setUploadingSpeakerIndex] = useState<number | null>(null);
  const [logoDragOver, setLogoDragOver] = useState(false);

  const [countries, setCountries] = useState<Country[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  const faviconInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [dirty, setDirty] = useState(false);
  const { Modal } = useUnsavedChanges(dirty);

  const [websiteError, setWebsiteError] = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    getChurchProfile(userId)
      .then((p) => {
        if (p) {
          setProfile((prev) => ({ ...prev, ...p }));
          setSpeakers(p.speakers || []);
          setSocialMedia(p.socialMedia || { facebook: "", instagram: "", youtube: "", twitter: "", tiktok: "" });
          setOriginalProfile(p);
          setOriginalSpeakers(p.speakers || []);
          setOriginalSocialMedia(p.socialMedia || { facebook: "", instagram: "", youtube: "", twitter: "", tiktok: "" });
        } else if (mongoUser) {
          setProfile((prev) => ({ ...prev, churchName: mongoUser.churchName || prev.churchName || "" }));
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [userId, mongoUser]);

  useEffect(() => {
    getCountries().then(setCountries).catch(() => { });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setShowCountryDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!originalProfile) return;
    const profileChanged = JSON.stringify(profile) !== JSON.stringify({ ...EMPTY_PROFILE, ...originalProfile });
    const speakersChanged = JSON.stringify(speakers) !== JSON.stringify(originalSpeakers);
    const socialMediaChanged = JSON.stringify(socialMedia) !== JSON.stringify(originalSocialMedia);
    setDirty(profileChanged || speakersChanged || socialMediaChanged);
  }, [profile, speakers, socialMedia, originalProfile, originalSpeakers, originalSocialMedia]);

  const sectionDirty = useMemo(() => {
    if (!originalProfile) return { info: false, branding: false, speakers: false, social: false };
    const mergedOriginal = { ...EMPTY_PROFILE, ...originalProfile };
    return {
      info: JSON.stringify({
        churchName: profile.churchName, tagline: profile.tagline, website: profile.website,
        email: profile.email, phone: profile.phone, address: profile.address,
        city: profile.city, state: profile.state, postalCode: profile.postalCode,
        country: profile.country, timezone: profile.timezone, churchSize: profile.churchSize,
      }) !== JSON.stringify({
        churchName: mergedOriginal.churchName, tagline: mergedOriginal.tagline, website: mergedOriginal.website,
        email: mergedOriginal.email, phone: mergedOriginal.phone, address: mergedOriginal.address,
        city: mergedOriginal.city, state: mergedOriginal.state, postalCode: mergedOriginal.postalCode,
        country: mergedOriginal.country, timezone: mergedOriginal.timezone, churchSize: mergedOriginal.churchSize,
      }),
      branding: JSON.stringify(profile.branding) !== JSON.stringify(mergedOriginal.branding),
      speakers: JSON.stringify(speakers) !== JSON.stringify(originalSpeakers),
      social: JSON.stringify(socialMedia) !== JSON.stringify(originalSocialMedia),
    };
  }, [profile, speakers, socialMedia, originalProfile, originalSpeakers, originalSocialMedia]);

  const update = useCallback((field: string, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateBranding = useCallback((field: string, value: string) => {
    setProfile((prev) => ({
      ...prev,
      branding: { ...prev.branding!, [field]: value },
    }));
  }, []);

  const updateSocialMedia = useCallback((field: keyof ChurchSocialMedia, value: string) => {
    setSocialMedia((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleWebsiteBlur = useCallback(() => {
    const raw = profile.website || "";
    if (raw && !isValidUrl(raw)) {
      setWebsiteError(true);
    } else {
      setWebsiteError(false);
      if (raw) {
        update("website", normalizeUrl(raw));
      }
    }
  }, [profile.website, update]);

  const addSpeaker = useCallback(() => {
    setSpeakers((prev) => [...prev, { name: "", role: "", isMain: false }]);
  }, []);

  const updateSpeaker = useCallback((index: number, field: "name" | "role" | "imageUrl", value: string) => {
    setSpeakers((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }, []);

  const removeSpeaker = useCallback((index: number) => {
    setSpeakers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleMainSpeaker = useCallback((index: number) => {
    setSpeakers((prev) => prev.map((s, i) => ({ ...s, isMain: i === index ? !s.isMain : false })));
  }, []);

  const uploadFile = async (file: File, type: "logo" | "favicon" | "avatar"): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    const res = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Upload failed");
    }
    const data = await res.json();
    return data.url;
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 512, useWebWorker: true });
      const url = await uploadFile(compressed, "logo");
      if (url) updateBranding("logoUrl", url);
    } catch (err: any) {
      alert(err.message || "Failed to upload logo");
    }
    setUploadingLogo(false);
  };

  const handleLogoInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleLogoUpload(file);
    e.target.value = "";
  };

  const handleLogoDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setLogoDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) await handleLogoUpload(file);
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFavicon(true);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.3, maxWidthOrHeight: 256, useWebWorker: true });
      const url = await uploadFile(compressed, "favicon");
      if (url) updateBranding("faviconUrl", url);
    } catch (err: any) {
      alert(err.message || "Failed to upload favicon");
    }
    setUploadingFavicon(false);
    e.target.value = "";
  };

  const handleSpeakerImageUpload = useCallback(async (index: number, file: File) => {
    setUploadingSpeakerIndex(index);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 512, useWebWorker: true });
      const url = await uploadFile(compressed, "avatar");
      if (url) updateSpeaker(index, "imageUrl", url);
    } catch (err: any) {
      alert(err.message || "Failed to upload speaker image");
    }
    setUploadingSpeakerIndex(null);
  }, [updateSpeaker]);

  const clearSpeakerImage = useCallback((index: number) => {
    updateSpeaker(index, "imageUrl", "");
  }, [updateSpeaker]);

  const showSaved = useCallback((section: string) => {
    setSectionSaved((prev) => ({ ...prev, [section]: true }));
    setTimeout(() => setSectionSaved((prev) => ({ ...prev, [section]: false })), 4000);
  }, []);

  const handleSaveInfo = useCallback(async () => {
    if (!userId) { alert("Please log in again to save changes."); return; }
    setSectionSaving((prev) => ({ ...prev, info: true }));
    try {
      const updates = {
        churchName: profile.churchName, tagline: profile.tagline,
        website: profile.website ? normalizeUrl(profile.website) : "",
        email: profile.email, phone: profile.phone, address: profile.address,
        city: profile.city, state: profile.state, postalCode: profile.postalCode,
        country: profile.country, timezone: profile.timezone, churchSize: profile.churchSize,
        branding: profile.branding,
      };
      const updated = await updateChurchProfile(userId, updates);
      const merged = { ...EMPTY_PROFILE, ...profile, ...updated };
      setProfile(merged);
      setOriginalProfile(merged);
      setDirty(false);
      showSaved("info");
    } catch (err: any) {
      alert(err?.message || "Failed to save church information");
    }
    setSectionSaving((prev) => ({ ...prev, info: false }));
  }, [userId, profile, showSaved]);

  const handleSaveBranding = useCallback(async () => {
    if (!userId) { alert("Please log in again to save changes."); return; }
    setSectionSaving((prev) => ({ ...prev, branding: true }));
    try {
      const updated = await updateChurchProfile(userId, { branding: profile.branding });
      const merged = { ...EMPTY_PROFILE, ...profile, ...updated };
      setProfile(merged);
      setOriginalProfile(merged);
      setDirty(false);
      showSaved("branding");
    } catch (err: any) {
      alert(err?.message || "Failed to save branding");
    }
    setSectionSaving((prev) => ({ ...prev, branding: false }));
  }, [userId, profile.branding, showSaved]);

  const handleSaveSpeakers = useCallback(async () => {
    if (!userId) { alert("Please log in again to save changes."); return; }
    const unnamed = speakers.filter((s) => !s.name.trim());
    if (unnamed.length > 0) {
      const ok = window.confirm(
        `${unnamed.length} speaker${unnamed.length > 1 ? "s" : ""} ${unnamed.length > 1 ? "have" : "has"} no name and will be removed. Continue?`
      );
      if (!ok) return;
    }
    setSectionSaving((prev) => ({ ...prev, speakers: true }));
    try {
      const filtered = speakers.filter((s) => s.name.trim());
      const updated = await updateChurchProfile(userId, { speakers: filtered });
      setSpeakers(updated.speakers || []);
      setOriginalSpeakers(updated.speakers || []);
      const merged = { ...EMPTY_PROFILE, ...profile, ...updated, speakers: updated.speakers || [] };
      setProfile(merged);
      setOriginalProfile(merged);
      setDirty(false);
      showSaved("speakers");
    } catch (err: any) {
      alert(err?.message || "Failed to save speakers");
    }
    setSectionSaving((prev) => ({ ...prev, speakers: false }));
  }, [userId, speakers, profile, showSaved]);

  const handleSaveSocial = useCallback(async () => {
    if (!userId) { alert("Please log in again to save changes."); return; }
    setSectionSaving((prev) => ({ ...prev, social: true }));
    try {
      const updated = await updateChurchProfile(userId, { socialMedia });
      setSocialMedia(updated.socialMedia || { facebook: "", instagram: "", youtube: "", twitter: "", tiktok: "" });
      setOriginalSocialMedia(updated.socialMedia || { facebook: "", instagram: "", youtube: "", twitter: "", tiktok: "" });
      const merged = { ...EMPTY_PROFILE, ...profile, ...updated, socialMedia: updated.socialMedia };
      setProfile(merged);
      setOriginalProfile(merged);
      setDirty(false);
      showSaved("social");
    } catch (err: any) {
      alert(err?.message || "Failed to save social media");
    }
    setSectionSaving((prev) => ({ ...prev, social: false }));
  }, [userId, socialMedia, profile, showSaved]);

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full pb-16">
      <Modal />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Church Profile</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Manage your church information, branding and team.
          </p>
        </div>
      </div>

      {/* ── Profile Completion ── */}
      <div className="mb-6">
        <ProfileCompletionCard profile={profile} speakers={speakers} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ═══ Left Column ═══ */}
        <div className="lg:col-span-7 space-y-6">

          {/* ── Church Information ── */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Church Information</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Basic details used in reports, exports and generated graphics.
                </p>
              </div>
              <SectionSaveButton
                saving={sectionSaving.info}
                saved={sectionSaved.info}
                hasChanges={sectionDirty.info}
                onSave={handleSaveInfo}
              />
            </div>

            <div className="space-y-5">
              {/* Logo + Name */}
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div
                  className={`shrink-0 flex flex-col items-center gap-2 ${logoDragOver ? "opacity-70" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setLogoDragOver(true); }}
                  onDragLeave={() => setLogoDragOver(false)}
                  onDrop={handleLogoDrop}
                >
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className={`w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden border-2 transition-colors cursor-pointer ${logoDragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-100 hover:border-blue-300"
                      }`}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                    ) : profile.branding?.logoUrl ? (
                      <img src={profile.branding.logoUrl} alt="Church Logo" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-slate-500">
                        <Upload className="w-5 h-5" />
                        <span className="text-xs font-medium">Upload</span>
                      </div>
                    )}
                  </button>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoInput} />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-700 transition-colors"
                  >
                    {uploadingLogo ? "Uploading..." : "Change Logo"}
                  </button>
                  <p className="text-[10px] text-slate-500 text-center">
                    PNG, JPG • 512×512+
                  </p>
                </div>

                <div className="flex-1 w-full pt-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Church Name</label>
                    <input
                      type="text"
                      value={profile.churchName ?? ""}
                      onChange={(e) => update("churchName", e.target.value)}
                      className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                    />
                    <FieldHelper text="Used in reports, exports and generated graphics." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Tagline (Optional)</label>
                    <textarea
                      value={profile.tagline ?? ""}
                      onChange={(e) => update("tagline", e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-slate-200 text-sm px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25 resize-none"
                      placeholder="e.g. A place of hope and transformation"
                    />
                  </div>
                </div>
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
                <input
                  type="url"
                  value={profile.website ?? ""}
                  onChange={(e) => { update("website", e.target.value); setWebsiteError(false); }}
                  onBlur={handleWebsiteBlur}
                  placeholder="savioursassembly.org"
                  className={`w-full h-[44px] rounded-lg text-sm px-3 outline-none border ${websiteError ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20" : "border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                    }`}
                />
                {websiteError && (
                  <p className="text-xs text-red-500 mt-1">Please enter a valid URL (e.g. https://example.com)</p>
                )}
                <FieldHelper text="Displayed on lower-thirds, presentations and church profile exports." />
              </div>

              {/* Contact Information */}
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Contact Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      <span className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-slate-500" /> Church Email</span>
                    </label>
                    <input
                      type="email"
                      value={profile.email ?? ""}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="info@yourchurch.com"
                      className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                    />
                    <FieldHelper text="Used in contact pages and church profile exports." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-slate-500" /> Church Phone</span>
                    </label>
                    <input
                      type="tel"
                      value={profile.phone ?? ""}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder="+234 800 000 0000"
                      className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                    />
                    <FieldHelper text="Displayed on announcements and information graphics." />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-500" /> Church Address</span>
                  </label>
                  <input
                    type="text"
                    value={profile.address ?? ""}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="123 Church Street"
                    className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">City</label>
                    <input
                      type="text"
                      value={profile.city ?? ""}
                      onChange={(e) => update("city", e.target.value)}
                      placeholder="Lagos"
                      className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">State / Province</label>
                    <input
                      type="text"
                      value={profile.state ?? ""}
                      onChange={(e) => update("state", e.target.value)}
                      placeholder="Lagos State"
                      className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Postal Code</label>
                    <input
                      type="text"
                      value={profile.postalCode ?? ""}
                      onChange={(e) => update("postalCode", e.target.value)}
                      placeholder="100001"
                      className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                    />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="pt-4 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Country</label>
                    <div ref={countryDropdownRef} className="relative">
                      <button
                        type="button"
                        onClick={() => { setShowCountryDropdown(!showCountryDropdown); setCountrySearch(""); }}
                        className="w-full h-[44px] rounded-2xl border border-slate-200 text-sm px-3 outline-none bg-white text-left flex items-center justify-between focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                      >
                        <span className={profile.country ? "text-slate-900" : "text-slate-500"}>
                          {getCountryDisplayName(profile.country, "Select country")}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                      </button>
                      {showCountryDropdown && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-lg max-h-60 overflow-hidden flex flex-col">
                          <div className="p-2 border-b border-slate-100">
                            <input
                              type="text"
                              value={countrySearch}
                              onChange={(e) => setCountrySearch(e.target.value)}
                              placeholder="Search countries..."
                              className="w-full h-[44px] px-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                              autoFocus
                            />
                          </div>
                          <div className="overflow-y-auto max-h-48">
                            {countries
                              .filter((c) => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase()))
                              .map((c) => (
                                <button
                                  key={c.iso2}
                                  type="button"
                                  onClick={() => { update("country", c.iso2); setShowCountryDropdown(false); setCountrySearch(""); }}
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 ${profile.country === c.iso2 ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
                                >
                                  <span className="text-base leading-none">{c.flag || "🏳️"}</span>
                                  <span>{c.name}</span>
                                </button>
                              ))}
                            {countries.filter((c) => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase())).length === 0 && (
                              <p className="px-3 py-2 text-sm text-slate-500">No countries found</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Timezone</label>
                    <select
                      value={profile.timezone ?? "(GMT+1) West Africa Time"}
                      onChange={(e) => update("timezone", e.target.value)}
                      className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                    >
                      <option>(GMT+1) West Africa Time</option>
                      <option>(GMT+0) Greenwich Mean Time</option>
                      <option>(GMT-5) Eastern Time</option>
                      <option>(GMT+8) Singapore Time</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Church Size */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Church Size</label>
                <select
                  value={profile.churchSize ?? "201-500"}
                  onChange={(e) => update("churchSize", e.target.value)}
                  className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                >
                  <option value="1-50">1 - 50 Members</option>
                  <option value="51-200">51 - 200 Members</option>
                  <option value="201-500">201 - 500 Members</option>
                  <option value="501-1000">501 - 1000 Members</option>
                  <option value="1000+">1000+ Members</option>
                </select>
                <FieldHelper text="Used for recommendations, onboarding and future analytics." />
              </div>
            </div>
          </Card>

          {/* ── Speakers ── */}
          <Card padding="lg">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Speakers</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Available in speaker overlays, sermon graphics and lower-thirds.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <SectionSaveButton
                  saving={sectionSaving.speakers}
                  saved={sectionSaved.speakers}
                  hasChanges={sectionDirty.speakers}
                  onSave={handleSaveSpeakers}
                />
                <Button onClick={addSpeaker} size="sm" icon={<Plus className="w-4 h-4" />}>
                  Add Speaker
                </Button>
              </div>
            </div>

            {speakers.length === 0 ? (
              <EmptyState
                icon={<Plus className="w-5 h-5" />}
                title="No speakers added yet"
                description="Add your first speaker to get started."
              />
            ) : (
              <div className="space-y-3">
                {speakers.map((speaker, index) => (
                  <SpeakerCard
                    key={index}
                    speaker={speaker}
                    index={index}
                    onUpdate={updateSpeaker}
                    onUploadImage={handleSpeakerImageUpload}
                    onClearImage={clearSpeakerImage}
                    onRemove={removeSpeaker}
                    onSetMain={toggleMainSpeaker}
                    uploading={uploadingSpeakerIndex === index}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ═══ Right Column ═══ */}
        <div className="lg:col-span-5 space-y-6">

          {/* ── Branding ── */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Branding</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Applied to generated themes and overlays.
                </p>
              </div>
              <SectionSaveButton
                saving={sectionSaving.branding}
                saved={sectionSaved.branding}
                hasChanges={sectionDirty.branding}
                onSave={handleSaveBranding}
              />
            </div>

            <div className="space-y-5">
              {/* Colors */}
              {[
                { field: "primaryColor", label: "Primary Color", default: "#4F46E5" },
                { field: "secondaryColor", label: "Secondary Color", default: "#0F172A" },
                { field: "accentColor", label: "Accent Color", default: "#F59E0B" },
              ].map(({ field, label, default: def }) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
                  <div className="flex items-center gap-3 h-[44px] px-3 border border-slate-200 rounded-xl bg-white">
                    <label className="relative cursor-pointer">
                      <div
                        className="w-6 h-6 rounded border border-black/10 ring-1 ring-black/5"
                        style={{ backgroundColor: (profile.branding as any)?.[field] ?? def }}
                      />
                      <input
                        type="color"
                        value={(profile.branding as any)?.[field] ?? def}
                        onChange={(e) => updateBranding(field, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </label>
                    <input
                      type="text"
                      value={(profile.branding as any)?.[field] ?? ""}
                      onChange={(e) => updateBranding(field, e.target.value)}
                      className="text-sm font-mono text-slate-600 flex-1 outline-none w-full bg-transparent"
                    />
                  </div>
                </div>
              ))}

              {/* Font */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Font Family</label>
                <select
                  value={profile.branding?.fontFamily ?? "Inter"}
                  onChange={(e) => updateBranding("fontFamily", e.target.value)}
                  className="w-full h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                >
                  <option>Inter</option>
                  <option>Roboto</option>
                  <option>Open Sans</option>
                  <option>Lato</option>
                </select>
              </div>

              {/* Favicon */}
              {/* <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Browser Tab Icon (Favicon)</label>
                <FieldHelper text="Displayed in browser tabs and bookmarks." />
                <div className="flex items-center gap-3 mt-2">
                  {profile.branding?.faviconUrl ? (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 border border-slate-200 overflow-hidden">
                      <img src={profile.branding.faviconUrl} alt="Favicon" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 border border-slate-200">
                      <Landmark className="text-slate-500 w-5 h-5" />
                    </div>
                  )}
                  <button
                    onClick={() => faviconInputRef.current?.click()}
                    disabled={uploadingFavicon}
                    className="flex-1 h-[44px] border border-slate-200 rounded-xl text-sm text-blue-700 font-semibold hover:bg-slate-50 transition-colors bg-white flex items-center justify-center gap-2"
                  >
                    {uploadingFavicon ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {uploadingFavicon ? "Uploading..." : "Change Favicon"}
                  </button>
                  <input ref={faviconInputRef} type="file" accept="image/*" className="hidden" onChange={handleFaviconUpload} />
                </div>
              </div> */}

              {/* Branding Preview */}
              {/* <BrandingPreview branding={profile.branding!} /> */}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Social Media ── */}
      <div className="mt-6">
        <Card padding="lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Social Media</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Used in announcements and church information graphics.
              </p>
            </div>
            <SectionSaveButton
              saving={sectionSaving.social}
              saved={sectionSaved.social}
              hasChanges={sectionDirty.social}
              onSave={handleSaveSocial}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SOCIAL_FIELDS.map((item) => (
              <div key={item.key}>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{item.label}</label>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-500 shrink-0" />
                  <input
                    type="url"
                    value={socialMedia[item.key] ?? ""}
                    onChange={(e) => updateSocialMedia(item.key, e.target.value)}
                    placeholder={item.placeholder}
                    className="flex-1 h-[44px] rounded-lg border border-slate-200 text-sm px-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
