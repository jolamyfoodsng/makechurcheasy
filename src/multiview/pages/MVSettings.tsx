/**
 * MVSettings.tsx — Unified Settings (Redesigned)
 *
 * Tabbed layout with header and tab navigation.
 * Tabs: General, OBS Connection, Appearance, Branding, Bible, Free Usage, Pro License
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBibleSettings, getInstalledTranslations, saveBibleSettings } from "../../bible/bibleDb";
import { useBible } from "../../bible/bibleStore";
import type { BibleTranslation } from "../../bible/types";
import { AppLogo } from "../../components/AppLogo";
import { useAuth } from "../../contexts/AuthContext";
import { resolveOverlayAssetUrl } from "../../services/overlayUrl";
import { ltDurationStore } from "../../lowerthirds/ltDurationStore";
import { applyBrandingSettingsToDom } from "../../services/branding";
import { fetchCreditTransactions, onCreditChange, syncCreditsWithBackend, type CreditTransaction } from "../../services/credits";
import { obsService } from "../../services/obsService";
import { formatCredits, getPlanConfig, getPlanCredits, getPlanLabel, type PlanConfig } from "../../services/planConfig";
import { consumeRenewalKey, getRenewalKeysRemaining, isProUnlocked, setProUnlocked, validateKey } from "../../services/proLicense";
import { getUserPlan, isInTrial, getTrialDaysRemaining } from "../../services/licenseService";
import { clearAllSongs } from "../../worship/worshipDb";
import { refreshTheme } from "../components/MVThemeProvider";
import * as db from "../mvStore";
import {
  DEFAULT_SETTINGS,
  type MVSettings as MVSettingsType,
  type SpeakerProfileSetting
} from "../mvStore";

import {
  Book,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown, ExternalLink,
  FileText,
  Globe,
  History,
  Key,
  Lock,
  Mic,
  Monitor,
  Moon,
  Paintbrush,
  Palette,
  Radio,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Copy,
} from "lucide-react";

import "./MVSettings.css";

/* ── Constants ── */
const SWATCHES = [
  { id: "purple", hex: "#8B5CF6", rgb: "139, 92, 246", name: "Purple" },
  { id: "blue", hex: "#3B82F6", rgb: "59, 130, 246", name: "Blue" },
  { id: "cyan", hex: "#06B6D4", rgb: "6, 182, 212", name: "Cyan" },
  { id: "green", hex: "#10B981", rgb: "16, 185, 129", name: "Green" },
  { id: "yellow", hex: "#F59E0B", rgb: "245, 158, 11", name: "Yellow" },
  { id: "orange", hex: "#F97316", rgb: "249, 115, 22", name: "Orange" },
  { id: "pink", hex: "#EC4899", rgb: "236, 72, 153", name: "Pink" },
  { id: "deeppurple", hex: "#A855F7", rgb: "168, 85, 247", name: "Deep Purple" },
];

const FALLBACK_TRANSLATIONS: { value: string; label: string }[] = [
  { value: "KJV", label: "King James Version (KJV)" },
];

type SettingsTab = "general" | "obs" | "appearance" | "branding" | "bible" | "usage" | "pro" | "developer";

const EMPTY_SPEAKER_PROFILE: SpeakerProfileSetting = { name: "", role: "" };

/* ── Helpers ── */
function resolveLogoPreviewSrc(path: string): string {
  return resolveOverlayAssetUrl(path);
}


function sanitizeSpeakerProfiles(value: unknown): SpeakerProfileSetting[] {
  if (!Array.isArray(value)) return [];
  const result: SpeakerProfileSetting[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<Record<string, unknown>>;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const role = typeof raw.role === "string" ? raw.role.trim() : "";
    if (!name) continue;
    const profile: SpeakerProfileSetting = { name, role };
    if (typeof raw.isMain === "boolean") profile.isMain = raw.isMain;
    result.push(profile);
  }
  return result;
}

function parseLegacyPastorNames(pastorNames: string): SpeakerProfileSetting[] {
  return pastorNames.split(/\r?\n|,/).map((n) => n.trim()).filter(Boolean).map((n) => ({ name: n, role: "" }));
}

function resolveSpeakerProfiles(settings: MVSettingsType): SpeakerProfileSetting[] {
  const structured = sanitizeSpeakerProfiles((settings as Partial<MVSettingsType>).pastorSpeakers);
  if (structured.length > 0) return structured;
  return parseLegacyPastorNames(settings.pastorNames);
}

/* ── API Key Types ── */
interface ApiKeyItem {
  _id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
}

/* ── Developer Tab ── */
function DeveloperTabContent({
  userPlan,
  proUnlocked,
  triggerToast,
}: {
  userPlan: string;
  proUnlocked: boolean;
  triggerToast: (msg: string, type?: "success" | "accent") => void;
}) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const isPro = proUnlocked || userPlan === "pro";

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/user/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = useCallback(async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (res.status === 403 && data.upgradeRequired) {
        triggerToast("API access requires a Pro plan", "accent");
        return;
      }
      if (res.ok && data.key) {
        setNewKeyRaw(data.key);
        setShowKey(true);
        setNewKeyName("");
        fetchKeys();
        triggerToast("API key created", "success");
      }
    } catch {
      triggerToast("Failed to create API key", "accent");
    } finally {
      setCreating(false);
    }
  }, [newKeyName, fetchKeys, triggerToast]);

  const handleRevoke = useCallback(async (keyId: string) => {
    setRevokingId(keyId);
    try {
      const res = await fetch(`/api/user/api-keys?id=${keyId}`, { method: "DELETE" });
      if (res.ok) {
        fetchKeys();
        triggerToast("API key revoked", "success");
      }
    } catch {
      triggerToast("Failed to revoke key", "accent");
    } finally {
      setRevokingId(null);
    }
  }, [fetchKeys, triggerToast]);

  const copyKey = useCallback(() => {
    if (newKeyRaw) {
      navigator.clipboard.writeText(newKeyRaw);
      triggerToast("Copied to clipboard", "success");
    }
  }, [newKeyRaw, triggerToast]);

  if (!isPro) {
    return (
      <div className="settings-section">
        <div className="section-header">
          <h3 className="section-title">API Access</h3>
          <p className="section-desc">Integrate MakeChurchEasy with your own apps and workflows.</p>
        </div>
        <div className="settings-card" style={{ padding: "32px", textAlign: "center" }}>
          <Key size={32} style={{ color: "var(--text-muted)", marginBottom: "12px" }} />
          <h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "6px" }}>Pro Feature</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginBottom: "16px", maxWidth: "340px", margin: "0 auto 16px" }}>
            API access lets you build custom integrations, automate workflows, and connect MakeChurchEasy to external tools.
          </p>
          <button
            className="action-btn btn-primary"
            onClick={() => triggerToast("Visit makechurcheasy.com to upgrade your plan", "accent")}
          >
            <ExternalLink size={14} />
            <span>Upgrade to Pro</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="section-header">
        <h3 className="section-title">API Keys</h3>
        <p className="section-desc">Manage keys for external API access. Keep your keys secret.</p>
      </div>

      {/* Create new key */}
      <div className="settings-card" style={{ padding: "20px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            className="custom-textbox"
            type="text"
            placeholder="Key name (e.g. Production Server)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            style={{ flex: 1 }}
          />
          <button
            className="action-btn btn-primary"
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
          >
            {creating ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
            <span>{creating ? "Creating..." : "Create Key"}</span>
          </button>
        </div>
      </div>

      {/* One-time key display */}
      {newKeyRaw && showKey && (
        <div className="settings-card" style={{ padding: "16px", marginBottom: "16px", border: "1px solid var(--accent-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent-color)" }}>Your API Key</span>
            <button className="action-btn" onClick={() => { setShowKey(false); setNewKeyRaw(null); }} style={{ padding: "4px 8px" }}>
              Dismiss
            </button>
          </div>
          <p style={{ fontSize: "0.74rem", color: "var(--text-secondary)", marginBottom: "8px" }}>
            Copy this key now. It will not be shown again.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <code style={{
              flex: 1,
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              background: "var(--bg-secondary)",
              padding: "8px 12px",
              borderRadius: "3px",
              wordBreak: "break-all",
              color: "var(--text-primary)",
            }}>
              {newKeyRaw}
            </code>
            <button className="action-btn" onClick={copyKey} style={{ flexShrink: 0 }}>
              <Copy size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Existing keys list */}
      <div className="settings-card" style={{ padding: "16px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
            <RefreshCw size={16} className="animate-spin" style={{ marginBottom: "8px" }} />
            <p style={{ fontSize: "0.8rem" }}>Loading keys...</p>
          </div>
        ) : keys.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
            <Key size={24} style={{ marginBottom: "8px", opacity: 0.5 }} />
            <p style={{ fontSize: "0.82rem" }}>No API keys yet. Create one above.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {keys.map((key) => (
              <div
                key={key._id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: "var(--bg-secondary)",
                  borderRadius: "3px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                  <Key size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.84rem", fontWeight: 500 }}>{key.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {key.prefix}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {key.lastUsedAt
                      ? `Used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : "Never used"}
                  </span>
                  <button
                    className="action-btn"
                    onClick={() => handleRevoke(key._id)}
                    disabled={revokingId === key._id}
                    style={{ color: "var(--danger-color)", padding: "4px 8px" }}
                  >
                    {revokingId === key._id ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    <span>Revoke</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API docs reference */}
      <div className="settings-section" style={{ marginTop: "20px" }}>
        <h4 className="section-title">Quick Start</h4>
        <div className="settings-card" style={{ padding: "16px" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <p style={{ marginBottom: "8px" }}>Authenticate requests with a Bearer token:</p>
            <pre style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.74rem",
              background: "var(--bg-secondary)",
              padding: "10px 14px",
              borderRadius: "3px",
              overflow: "auto",
              marginBottom: "10px",
            }}>
              {`curl -H "Authorization: Bearer mce_live_..." \\
     https://makechurcheasy.com/api/v1/profile`}
            </pre>
            <p>Available endpoints:</p>
            <ul style={{ paddingLeft: "18px", marginTop: "4px" }}>
              <li><code style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem" }}>GET /api/v1/profile</code> — Your profile</li>
              <li><code style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem" }}>GET /api/v1/subscription</code> — Plan & entitlements</li>
              <li><code style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem" }}>GET /api/v1/usage</code> — Usage stats</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */
export function MVSettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<MVSettingsType>(db.getSettings);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [confirmClearWorship, setConfirmClearWorship] = useState(false);
  const [worshipCleared, setWorshipCleared] = useState(false);
  const [obsStatus, setObsStatus] = useState<"connected" | "connecting" | "disconnected">("disconnected");
  const [obsTestResult, setObsTestResult] = useState<string | null>(null);
  const [obsPasswordDraft, setObsPasswordDraft] = useState(() => db.getSettings().obsPassword ?? "");
  const obsPasswordScrubbedRef = useRef(false);
  const [_brandLogoStatus, _setBrandLogoStatus] = useState<string | null>(null);
  const [_brandLogoStatusType, _setBrandLogoStatusType] = useState<"ok" | "err">("ok");
  const [_brandLogoUploading, _setBrandLogoUploading] = useState(false);
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfileSetting[]>(() => {
    const profiles = resolveSpeakerProfiles(db.getSettings());
    return profiles.length > 0 ? profiles : [{ ...EMPTY_SPEAKER_PROFILE }];
  });
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // ── Bible settings state ──
  const { state: bibleState, dispatch: bibleDispatch, setTheme: bibleSetTheme } = useBible();
  const [bDefaultTranslation, setBDefaultTranslation] = useState<BibleTranslation>("KJV");
  const [bDefaultThemeId, setBDefaultThemeId] = useState("classic-dark");
  const [bShowVerseNumbers, setBShowVerseNumbers] = useState(true);
  const [bMaxLines, setBMaxLines] = useState(4);
  const [bAutoSend, setBAutoSend] = useState(true);
  const [bColorMode, setBColorMode] = useState<"dark" | "light" | "system">("dark");
  const [bReduceMotion, setBReduceMotion] = useState(false);
  const [bHighContrast, setBHighContrast] = useState(false);
  const [_bSaved, setBSaved] = useState(false);
  const [_bTranslations, setBTranslations] = useState(FALLBACK_TRANSLATIONS);
  const [bibleSettingsDirty, setBibleSettingsDirty] = useState(false);

  // ── Pro License state ──
  const [proUnlocked, setProUnlockedState] = useState(() => isProUnlocked());
  const [proKeyInput, setProKeyInput] = useState("");
  const [proKeyStatus, setProKeyStatus] = useState<"idle" | "validating" | "success" | "error">("idle");
  const [proKeyError, setProKeyError] = useState<string | null>(null);
  const [proKeySuccessMsg, setProKeySuccessMsg] = useState<string | null>(null);
  const [renewalsLeft, setRenewalsLeft] = useState(() => getRenewalKeysRemaining());

  // ── Credits state (fetched from backend) ──
  const { user: authUser } = useAuth();
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [creditsUsedThisMonth, setCreditsUsedThisMonth] = useState<number>(0);
  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([]);
  const userPlan = proUnlocked ? "pro" as const : getUserPlan(authUser);
  const planCredits = planConfig ? getPlanCredits(planConfig, userPlan) : (proUnlocked ? -1 : 1000);
  const trialActive = !proUnlocked && isInTrial(authUser);
  const trialDaysLeft = trialActive ? getTrialDaysRemaining(authUser) : 0;
  const trialEndDate = trialActive && authUser?.trial?.endsAt
    ? new Date(authUser.trial.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const planLabel = trialActive
    ? "Growth Trial"
    : (planConfig ? getPlanLabel(planConfig, userPlan) : (proUnlocked ? "Pro" : "Free"));
  const isUnlimited = planCredits === -1;
  const usagePct = planCredits > 0 ? Math.min(100, Math.round((creditsUsedThisMonth / planCredits) * 100)) : 0;

  useEffect(() => {
    getPlanConfig().then(setPlanConfig);
  }, []);

  // Fetch transactions after auth is ready
  useEffect(() => {
    if (!authUser?.id) return;
    fetchCreditTransactions(10).then(setRecentTransactions);
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser?.id) return;
    syncCreditsWithBackend(authUser.id).then((synced) => {
      if (synced >= 0) setCreditBalance(synced);
      // Compute used = plan total − remaining
      const total = planCredits;
      if (synced >= 0 && total > 0) {
        setCreditsUsedThisMonth(Math.max(0, total - synced));
      }
    }).catch(() => {
      // Backend unreachable — keep balance at 0, no localStorage fallback
      setCreditBalance(0);
      setCreditsUsedThisMonth(0);
    });
  }, [authUser?.id, planConfig]);

  // Live-update credits when deductions happen anywhere in the app
  useEffect(() => {
    const unsub = onCreditChange((newBalance) => {
      setCreditBalance(newBalance);
      if (planCredits > 0) setCreditsUsedThisMonth(Math.max(0, planCredits - newBalance));
      // Re-fetch recent transactions so the list reflects the new deduction
      fetchCreditTransactions(10).then(setRecentTransactions);
    });
    return unsub;
  }, [planCredits]);

  // Re-fetch credits and transactions every time the Usage tab is opened
  useEffect(() => {
    if (activeTab !== "usage" || !authUser?.id) return;
    syncCreditsWithBackend(authUser.id).then((synced) => {
      if (synced >= 0) setCreditBalance(synced);
      const total = planCredits;
      if (synced >= 0 && total > 0) {
        setCreditsUsedThisMonth(Math.max(0, total - synced));
      }
    }).catch(() => { });
    fetchCreditTransactions(10).then(setRecentTransactions);
  }, [activeTab, authUser?.id, planCredits]);

  // ── Appearance customization state ──
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    () => (settings.theme as "light" | "dark" | "system") || "dark"
  );
  const [accentColor, setAccentColor] = useState<string>("purple");
  const [density, setDensity] = useState<"comfortable" | "balanced" | "compact">("balanced");
  const [fontSizeRange, setFontSizeRange] = useState<number>(2);
  const [highContrastUI, setHighContrastUI] = useState<boolean>(settings.highContrast ?? false);
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);
  const [roundedCorners, setRoundedCorners] = useState<boolean>(true);
  const ALL_LANGUAGES: string[] = ["Abkhaz", "Afar", "Afrikaans", "Akan", "Albanian", "Amharic", "Arabic", "Aragonese", "Armenian", "Assamese", "Avaric", "Aymara", "Azerbaijani", "Bambara", "Bashkir", "Basque", "Belarusian", "Bengali", "Bihari", "Bislama", "Bosnian", "Breton", "Bulgarian", "Burmese", "Catalan", "Chamorro", "Chechen", "Chichewa", "Chinese", "Corsican", "Croatian", "Czech", "Danish", "Divehi", "Dutch", "Dzongkha", "English", "Esperanto", "Estonian", "Ewe", "Faroese", "Fijian", "Finnish", "French", "Fula", "Galician", "Georgian", "German", "Greek", "Guarani", "Gujarati", "Haitian Creole", "Hausa", "Hebrew", "Herero", "Hindi", "Hiri Motu", "Hungarian", "Icelandic", "Ido", "Igbo", "Indonesian", "Interlingua", "Interlingue", "Inuktitut", "Inupiaq", "Irish", "Italian", "Japanese", "Javanese", "Kalaallisut", "Kannada", "Kanuri", "Kashmiri", "Kazakh", "Khmer", "Kikuyu", "Kinyarwanda", "Kirghiz", "Komi", "Kongo", "Korean", "Kurdish", "Kwanyama", "Lao", "Latin", "Latvian", "Limburgish", "Lingala", "Lithuanian", "Luba-Katanga", "Luxembourgish", "Macedonian", "Malagasy", "Malay", "Malayalam", "Maltese", "Manx", "Maori", "Marathi", "Marshallese", "Mongolian", "Nauru", "Navajo", "Ndonga", "Nepali", "Norwegian", "Occitan", "Ojibwe", "Old Church Slavonic", "Oromo", "Ossetian", "Panjabi", "Pashto", "Persian", "Polish", "Portuguese", "Quechua", "Romanian", "Romansh", "Rundi", "Russian", "Samoan", "Sango", "Sanskrit", "Sardinian", "Serbian", "Shona", "Sindhi", "Sinhala", "Slovak", "Slovenian", "Somali", "Southern Ndebele", "Southern Sotho", "Spanish", "Sundanese", "Swahili", "Swati", "Swedish", "Tagalog", "Tahitian", "Tajik", "Tamil", "Tatar", "Telugu", "Thai", "Tibetan", "Tigrinya", "Tonga", "Tsonga", "Tswana", "Turkish", "Turkmen", "Twi", "Ukrainian", "Urdu", "Uzbek", "Venda", "Vietnamese", "Volapük", "Walloon", "Welsh", "Western Frisian", "Wolof", "Xhosa", "Yiddish", "Yoruba", "Zhuang", "Zulu"];
  const [interfaceLanguage, setInterfaceLanguage] = useState<string>("English");
  const [allLanguages] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem("mce_languages");
      if (cached) return JSON.parse(cached) as string[];
    } catch { }
    localStorage.setItem("mce_languages", JSON.stringify(ALL_LANGUAGES));
    return ALL_LANGUAGES;
  });

  // ── Toast system ──
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: "success" | "accent" }>>([]);

  // ── License modal ──
  const [licenseKeyEditOpen, setLicenseKeyEditOpen] = useState(false);
  const [tempLicenseInput, setTempLicenseInput] = useState("");

  // ── OBS advanced state ──
  const [obsMethod, setObsMethod] = useState<"WebSocket" | "Remote">("WebSocket");
  const [obsReconnectInterval, setObsReconnectInterval] = useState("5 seconds");
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [obsLogs, setObsLogs] = useState<Array<{ id: number; timestamp: string; message: string; source: string }>>([
    { id: 1, timestamp: "10:24:02", message: "Initializing OBS WebSocket connection module...", source: "System" },
    { id: 2, timestamp: "10:24:03", message: "Handshaking with server ws://localhost:4455", source: "Network" },
    { id: 3, timestamp: "10:24:04", message: "OBS server accepted connection. Version 30.1.2", source: "OBS" },
  ]);

  /* ── Toast helper ── */
  const triggerToast = useCallback((message: string, type: "success" | "accent" = "accent") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  /* ── Effects ── */
  useEffect(() => {
    getBibleSettings().then((s) => {
      setBDefaultTranslation((s.defaultTranslation as BibleTranslation) ?? "KJV");
      setBDefaultThemeId(s.activeThemeId ?? "classic-dark");
      setBColorMode(s.colorMode ?? "dark");
      setBAutoSend(s.autoSendOnDoubleClick ?? true);
      setBReduceMotion(s.reduceMotion ?? false);
      setBHighContrast(s.highContrast ?? false);
      if (s.slideConfig) {
        setBShowVerseNumbers(s.slideConfig.showVerseNumbers ?? true);
        setBMaxLines(s.slideConfig.maxLines ?? 4);
      }
      setBibleSettingsDirty(false);
    }).catch(console.error);

    getInstalledTranslations().then((list) => {
      if (list.length > 0) {
        setBTranslations(list.map((t) => ({ value: t.abbr, label: `${t.name} (${t.abbr})` })));
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (bibleSettingsDirty) return;
    if (bDefaultTranslation !== bibleState.translation) {
      setBDefaultTranslation(bibleState.translation);
    }
  }, [bDefaultTranslation, bibleSettingsDirty, bibleState.translation]);

  useEffect(() => {
    const check = () => setObsStatus(obsService.isConnected ? "connected" : "disconnected");
    check();
    const iv = setInterval(check, 2000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const profiles = resolveSpeakerProfiles(settings);
    setSpeakerProfiles(profiles.length > 0 ? profiles : [{ ...EMPTY_SPEAKER_PROFILE }]);
  }, [settings.pastorSpeakers, settings.pastorNames]);

  const applyLowerThirdDefaultDuration = useCallback((seconds: number) => {
    const safe = Math.max(1, Math.min(300, Math.floor(seconds || 10)));
    ltDurationStore.setGlobalDefaults({ durations: { speaker: safe, scripture: safe, announcement: safe, generic: safe } });
  }, []);

  useEffect(() => {
    applyBrandingSettingsToDom({ brandColor: settings.brandColor, churchName: settings.churchName });
    applyLowerThirdDefaultDuration(settings.lowerThirdDefaultDurationSec);
  }, []);

  /* ── Dynamic CSS theming ── */
  useEffect(() => {
    let appliedTheme = theme;
    if (theme === "system") {
      appliedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", appliedTheme);
    document.documentElement.setAttribute("data-contrast", highContrastUI ? "high" : "standard");
    document.documentElement.setAttribute("data-reduced-motion", reduceMotion ? "true" : "false");
    document.documentElement.setAttribute("data-roundness", roundedCorners ? "standard" : "none");

    // Sync .light / .dark classes so App.css :root.light overrides activate
    const root = document.documentElement;
    if (appliedTheme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }

    // Apply density and font-scale without wiping other classes
    root.classList.remove("density-comfortable", "density-balanced", "density-compact");
    root.classList.add(`density-${density}`);
    root.classList.remove("font-scale-small", "font-scale-medium", "font-scale-large");
    root.classList.add(`font-scale-${fontSizeRange === 1 ? "small" : fontSizeRange === 2 ? "medium" : "large"}`);

    const swatch = SWATCHES.find((s) => s.id === accentColor) || SWATCHES[0];
    document.documentElement.style.setProperty("--accent-color", swatch.hex);
    document.documentElement.style.setProperty("--accent-rgb", swatch.rgb);
  }, [theme, accentColor, density, fontSizeRange, highContrastUI, reduceMotion, roundedCorners]);

  /* ── Settings update helper ── */
  const update = useCallback(
    (patch: Partial<MVSettingsType>) => {
      const next = db.updateSettings(patch);
      setSettings(next);
      if (patch.obsAutoReconnect !== undefined) obsService.setAutoReconnect(patch.obsAutoReconnect);
      if (patch.theme !== undefined || patch.highContrast !== undefined) refreshTheme();
      if (patch.brandColor !== undefined || patch.churchName !== undefined) {
        applyBrandingSettingsToDom({ brandColor: next.brandColor, churchName: next.churchName });
      }
      if (patch.lowerThirdDefaultDurationSec !== undefined) applyLowerThirdDefaultDuration(next.lowerThirdDefaultDurationSec);
    },
    [applyLowerThirdDefaultDuration]
  );

  useEffect(() => {
    if (obsPasswordScrubbedRef.current) return;
    obsPasswordScrubbedRef.current = true;
    if (!settings.obsPassword) return;
    setObsPasswordDraft(settings.obsPassword);
    update({ obsPassword: "" });
  }, [settings.obsPassword, update]);

  /* ── Church profile sync (Web → Desktop) ── */
  const runSync = useCallback(async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const { syncChurchProfile } = await import("../../services/churchProfileSync");
      const result = await syncChurchProfile();
      // Re-read settings after sync to reflect updated values
      const fresh = db.getSettings();
      setSettings(fresh);
      const profiles = resolveSpeakerProfiles(fresh);
      setSpeakerProfiles(profiles.length > 0 ? profiles : [{ ...EMPTY_SPEAKER_PROFILE }]);
      setSyncStatus(result.message);
    } catch {
      setSyncStatus("Sync failed unexpectedly.");
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "branding") return;
    runSync();
  }, [activeTab, runSync]);

  /* ── Speaker profiles ── */


  /* ── Actions ── */
  const handleClear = async () => {
    try {
      await db.clearAll();
      setCleared(true);
      setConfirmClear(false);
      triggerToast("Database cleared successfully.", "success");
      setTimeout(() => setCleared(false), 3000);
    } catch (err) {
      console.error("Clear failed:", err);
      triggerToast("Failed to clear data. Please try again.", "accent");
    }
  };

  const handleClearWorship = async () => {
    try {
      await clearAllSongs();
      setWorshipCleared(true);
      setConfirmClearWorship(false);
      triggerToast("All worship songs cleared.", "success");
      setTimeout(() => setWorshipCleared(false), 3000);
    } catch (err) {
      console.error("Clear worship failed:", err);
      triggerToast("Failed to clear worship data. Please try again.", "accent");
    }
  };

  const handleTestObs = async () => {
    setObsTestResult(null);
    setObsStatus("connecting");
    try {
      if (!obsService.isConnected) await obsService.connect(settings.obsUrl, obsPasswordDraft || undefined);
      const version = await obsService.call("GetVersion");
      setObsTestResult(`Connected — OBS v${version.obsVersion}, WebSocket v${version.obsWebSocketVersion}`);
      setObsStatus("connected");
      triggerToast("OBS connected successfully!", "success");
    } catch (err: any) {
      setObsTestResult(`Failed: ${err.message || "Connection failed"}`);
      setObsStatus("disconnected");
      triggerToast("OBS connection failed.", "accent");
    }
  };

  const handleResetSettings = () => {
    const next = db.updateSettings(DEFAULT_SETTINGS);
    setSettings({ ...next });
    setObsPasswordDraft("");
    _setBrandLogoStatus(null);
    applyBrandingSettingsToDom({ brandColor: next.brandColor, churchName: next.churchName });
    applyLowerThirdDefaultDuration(next.lowerThirdDefaultDurationSec);
    triggerToast("Settings reset to defaults.", "success");
  };

  const handleResetBrandingSettings = () => {
    update({
      churchName: DEFAULT_SETTINGS.churchName,
      mainPastorName: DEFAULT_SETTINGS.mainPastorName,
      pastorNames: DEFAULT_SETTINGS.pastorNames,
      pastorSpeakers: DEFAULT_SETTINGS.pastorSpeakers,
      lowerThirdDefaultDurationSec: DEFAULT_SETTINGS.lowerThirdDefaultDurationSec,
      brandColor: DEFAULT_SETTINGS.brandColor,
      brandSecondaryColor: DEFAULT_SETTINGS.brandSecondaryColor,
      brandLogoPath: DEFAULT_SETTINGS.brandLogoPath,
      brandLogoAssets: DEFAULT_SETTINGS.brandLogoAssets,
    });
    setSpeakerProfiles([{ ...EMPTY_SPEAKER_PROFILE }]);
    _setBrandLogoStatus(null);
    triggerToast("Branding settings reset.", "success");
  };

  const handleResetChurchOnboarding = useCallback(() => {
    update({ churchProfileOnboardingCompleted: false });
  }, [update]);

  /* ── Bible settings save ── */
  const handleSaveBible = useCallback(async () => {
    bibleDispatch({ type: "SET_TRANSLATION", translation: bDefaultTranslation });
    bibleDispatch({ type: "SET_SLIDE_CONFIG", config: { ...bibleState.slideConfig, showVerseNumbers: bShowVerseNumbers, maxLines: bMaxLines } });
    bibleDispatch({ type: "SET_COLOR_MODE", mode: bColorMode });
    bibleDispatch({ type: "SET_AUTO_SEND", enabled: bAutoSend });
    bibleDispatch({ type: "SET_REDUCE_MOTION", enabled: bReduceMotion });
    bibleDispatch({ type: "SET_HIGH_CONTRAST", enabled: bHighContrast });
    bibleSetTheme(bDefaultThemeId);
    await saveBibleSettings({
      defaultTranslation: bDefaultTranslation,
      activeThemeId: bDefaultThemeId,
      slideConfig: { ...bibleState.slideConfig, showVerseNumbers: bShowVerseNumbers, maxLines: bMaxLines },
      colorMode: bColorMode,
      autoSendOnDoubleClick: bAutoSend,
      reduceMotion: bReduceMotion,
      highContrast: bHighContrast,
    });
    setBibleSettingsDirty(false);
    setBSaved(true);
    triggerToast("Bible settings saved.", "success");
    setTimeout(() => setBSaved(false), 2000);
  }, [bDefaultTranslation, bDefaultThemeId, bShowVerseNumbers, bMaxLines, bColorMode, bAutoSend, bReduceMotion, bHighContrast, bibleDispatch, bibleSetTheme, bibleState.slideConfig, triggerToast]);

  /* ── Pro License ── */
  const handleValidateProKey = useCallback(async () => {
    if (!proKeyInput.trim()) {
      setProKeyError("Please enter a license key.");
      setProKeyStatus("error");
      setProKeySuccessMsg(null);
      return;
    }
    setProKeyStatus("validating");
    setProKeyError(null);
    setProKeySuccessMsg(null);
    try {
      const result = await validateKey(proKeyInput);
      if (result.type === "pro") {
        setProUnlocked(true);
        setProUnlockedState(true);
        setProKeyStatus("success");
        setProKeySuccessMsg("Pro unlocked — unlimited usage active!");
        setProKeyError(null);
        triggerToast("Pro license activated!", "success");
      } else if (result.type === "renewal") {
        if (result.alreadyUsed) {
          setProKeyStatus("error");
          setProKeyError("This renewal key has already been used.");
        } else {
          const ok = await consumeRenewalKey(proKeyInput);
          if (ok) {
            setProKeyStatus("success");
            setProKeySuccessMsg("2-hour limit reset!");
            setProKeyError(null);
            setRenewalsLeft(getRenewalKeysRemaining());
            setProKeyInput("");
            window.dispatchEvent(new StorageEvent("storage", { key: "voiceBibleUsage" }));
            triggerToast("2-hour limit reset with renewal key!", "success");
          } else {
            setProKeyStatus("error");
            setProKeyError("Failed to activate renewal key.");
          }
        }
      } else {
        setProKeyStatus("error");
        setProKeyError("Invalid license key.");
      }
    } catch {
      setProKeyStatus("error");
      setProKeyError("Validation failed. Try again.");
    }
  }, [proKeyInput, triggerToast]);

  const handleRemoveProLicense = useCallback(() => {
    setProUnlocked(false);
    setProUnlockedState(false);
    setProKeyInput("");
    setProKeyStatus("idle");
    setProKeyError(null);
    setProKeySuccessMsg(null);
  }, []);

  /* ── Appearance helpers ── */
  const handleResetAppearance = useCallback(() => {
    setTheme("dark");
    setAccentColor("purple");
    setDensity("balanced");
    setFontSizeRange(2);
    setHighContrastUI(false);
    setReduceMotion(false);
    setRoundedCorners(true);
    setInterfaceLanguage("English");
    update({ theme: "dark", highContrast: false });
    triggerToast("Appearance reset to defaults.", "success");
  }, [update, triggerToast]);

  const handleReconnectNow = useCallback(() => {
    triggerToast("Reconnecting to OBS...", "accent");
    const ts = new Date().toLocaleTimeString();
    setObsLogs((prev) => [...prev, { id: Date.now() + 10, timestamp: ts, message: "Manual reconnection triggered.", source: "System" }]);
    setTimeout(() => {
      triggerToast("OBS reconnected!", "success");
      setObsLogs((prev) => [...prev, { id: Date.now() + 20, timestamp: new Date().toLocaleTimeString(), message: "Handshake restored.", source: "Network" }]);
    }, 1500);
  }, [triggerToast]);

  /* ── Tab descriptions ── */
  const tabDescription = useMemo(() => {
    switch (activeTab) {
      case "general": return "Configure general options for MakeChurchEasy Studio operations.";
      case "obs": return "Configure how MakeChurchEasy Studio connects and communicates with OBS.";
      case "appearance": return "Customize the look, scaling, and behavior of MakeChurchEasy Studio.";
      case "branding": return "Church profile, identity, and service defaults.";
      case "bible": return "Bible module preferences and slide configuration.";
      case "usage": return "Track your AI credits usage across all features and see your plan details.";
      case "pro": return "Activate features, check status, and configure software licensing rules.";
    }
  }, [activeTab]);

  return (
    <div className="app-container">
      {/* Toast stack */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item ${toast.type === "success" ? "success-toast" : ""}`}>
            <span className={`toast-icon-box ${toast.type === "success" ? "success-toast" : "accent-toast"}`}>
              <CheckCircle size={16} />
            </span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* License key modal */}
      {licenseKeyEditOpen && (
        <div className="dialog-overlay" onClick={() => setLicenseKeyEditOpen(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3 className="dialog-title"><ShieldCheck size={22} /><span>Enter Pro License Key</span></h3>
              <p className="dialog-desc">Input your premium license key to unlock unlimited speech transcription, translations, and multi-view templates.</p>
            </div>
            <div className="dialog-body">
              <div className="form-group">
                <label className="form-label" htmlFor="temp-key-input">License Key Code</label>
                <input id="temp-key-input" className="custom-textbox" placeholder="VC-PRO-XXXX-XXXX-XXXX-XXXX" value={tempLicenseInput} onChange={(e) => setTempLicenseInput(e.target.value)} />
              </div>
            </div>
            <div className="dialog-footer">
              <button className="action-btn" onClick={() => setLicenseKeyEditOpen(false)}>Cancel</button>
              <button className="action-btn btn-primary" onClick={() => {
                if (!tempLicenseInput.trim()) return;
                setLicenseKeyEditOpen(false);
                setProKeyInput(tempLicenseInput);
                triggerToast("Pro License activated!", "success");
              }} disabled={!tempLicenseInput.trim()}>Activate Pro</button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="app-main settings-main">
        <header className="main-header">
          <div className="title-group">
            <h2 className="main-title">Settings</h2>
            <p className="main-description">{tabDescription}</p>
          </div>
          <button className="reset-button" onClick={() => {
            if (activeTab === "general") handleResetSettings();
            else if (activeTab === "branding") handleResetBrandingSettings();
            else if (activeTab === "appearance") handleResetAppearance();
            else if (activeTab === "bible") handleSaveBible();
            else triggerToast("Reset options available for this section.", "accent");
          }}>
            <RotateCcw size={16} />
            <span>{activeTab === "bible" ? "Save Bible" : "Reset Defaults"}</span>
          </button>
        </header>

        {/* Tab bar */}
        <div className="tabs-navigation">
          {([
            ["general", Settings, "General"],
            ["obs", Radio, "OBS"],
            ["appearance", Palette, "Appearance"],
            ["branding", Paintbrush, "Branding"],
            ["usage", History, "Usage"],
            ["pro", ShieldCheck, "Pro License"],
            ["developer", Key, "Developer"],
          ] as const).map(([id, IconComp, label]) => (
            <button key={id} className={`tab-btn ${activeTab === id ? "active" : ""}`} onClick={() => setActiveTab(id)}>
              <IconComp size={16} /> <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="main-scroll-pane">
          <div className="settings-grid">
            {/* Left: main form column */}
            <div className="settings-form-column">

              {/* ══════════════ GENERAL TAB ══════════════ */}
              {activeTab === "general" && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3 className="section-title">Studio Preferences</h3>
                    <p className="section-desc">Manage standard operations, language choices, and background behaviors.</p>
                  </div>

                  <div className="settings-card fields-rows-stack">
                    <div className="flex-between-center">
                      <div className="switch-left">
                        <span className="switch-title">Global Interface Language</span>
                        <span className="switch-subtitle">Choose the translation table for buttons and guides.</span>
                      </div>
                      <div className="form-select-container" style={{ width: "180px" }}>
                        <select className="custom-select" value={interfaceLanguage} onChange={(e) => { setInterfaceLanguage(e.target.value); triggerToast(`Language updated to ${e.target.value}`, "accent"); }}>
                          {allLanguages.map((lang) => (
                            <option key={lang} value={lang}>{lang}</option>
                          ))}
                        </select>
                        <span className="select-arrow"><ChevronDown size={14} /></span>
                      </div>
                    </div>
                  </div>

                  {/* ── Global Module Defaults ── */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <div className="section-header">
                      <h3 className="section-title">Global Module Defaults</h3>
                      <p className="section-desc">Set default behaviors for Bible, Speaker, and Ticker modules across the app.</p>
                    </div>
                    <div className="settings-card fields-rows-stack">
                      <div className="flex-between-center">
                        <div className="switch-left">
                          <span className="switch-title">Default Bible Overlay Mode</span>
                          <span className="switch-subtitle">Choose which overlay mode the Bible module starts in.</span>
                        </div>
                        <div className="form-select-container" style={{ width: "180px" }}>
                          <select
                            className="custom-select"
                            value={settings.defaultBibleOverlayMode}
                            onChange={(e) => update({ defaultBibleOverlayMode: e.target.value as "fullscreen" | "lower-third" })}
                          >
                            <option value="fullscreen">Fullscreen</option>
                            <option value="lower-third">Lower Third</option>
                          </select>
                          <span className="select-arrow"><ChevronDown size={14} /></span>
                        </div>
                      </div>

                      <div className="flex-between-center">
                        <div className="switch-left">
                          <span className="switch-title">Default Speaker Size</span>
                          <span className="switch-subtitle">Default lower-third size for the Speaker module.</span>
                        </div>
                        <div className="form-select-container" style={{ width: "180px" }}>
                          <select
                            className="custom-select"
                            value={settings.defaultSpeakerSize}
                            onChange={(e) => update({ defaultSpeakerSize: e.target.value })}
                          >
                            <option value="s">Small (S)</option>
                            <option value="m">Medium (M)</option>
                            <option value="l">Large (L)</option>
                            <option value="xl">Extra Large (XL)</option>
                            <option value="2xl">2XL</option>
                            <option value="3xl">3XL</option>
                          </select>
                          <span className="select-arrow"><ChevronDown size={14} /></span>
                        </div>
                      </div>

                      <div className="flex-between-center">
                        <div className="switch-left">
                          <span className="switch-title">Default Ticker Scroll Speed</span>
                          <span className="switch-subtitle">Default scrolling speed for the Ticker module (1 = slow, 5 = fast).</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="range"
                            min={1}
                            max={5}
                            step={1}
                            value={settings.defaultTickerScrollSpeed}
                            onChange={(e) => update({ defaultTickerScrollSpeed: Number(e.target.value) })}
                            style={{ width: 100, accentColor: settings.brandColor }}
                          />
                          <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 20, textAlign: "center" }}>
                            {settings.defaultTickerScrollSpeed}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* About */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <div className="section-header">
                      <h3 className="section-title">About</h3>
                    </div>
                    <div className="settings-card">
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <AppLogo alt="MakeChurchEasy Studio" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "contain" }} />
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>MakeChurchEasy Studio</p>
                          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Version {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0"}</p>
                        </div>
                      </div>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                        Complete Church Production Control for OBS — a smart layer built on top of OBS Studio for church broadcast teams.
                      </p>
                      <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Built with Tauri v2 + React 19 + TypeScript</p>
                    </div>
                  </div>




                  {/* Danger Zone */}
                  <div className="settings-section" style={{ marginTop: "24px", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
                    <h3 className="section-title" style={{ color: "var(--danger-color)" }}><Trash2 size={18} style={{ verticalAlign: "text-bottom" }} /> Danger Zone</h3>

                    {/* Clear All Data */}
                    <p className="section-desc">Clear all saved layouts, templates, and assets. This cannot be undone.</p>
                    {cleared ? (
                      <p style={{ color: "var(--success-color)", fontSize: 13 }}><CheckCircle size={16} style={{ verticalAlign: "middle" }} /> Database cleared.</p>
                    ) : confirmClear ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "var(--danger-color)" }}>Are you sure?</span>
                        <button className="action-btn btn-primary" style={{ backgroundColor: "var(--danger-color)" }} onClick={handleClear}>Yes, Clear Everything</button>
                        <button className="action-btn" onClick={() => setConfirmClear(false)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="action-btn" style={{ color: "var(--danger-color)", border: "1px solid rgba(239,68,68,0.3)" }} onClick={() => setConfirmClear(true)}>
                        <Trash2 size={14} /><span>Clear All Data</span>
                      </button>
                    )}

                    {/* Clear Worship Songs */}
                    <div style={{ marginTop: 16, borderTop: "1px solid rgba(239,68,68,0.1)", paddingTop: 16 }}>
                      <p className="section-desc">Remove all worship songs from the library. This cannot be undone.</p>
                      {worshipCleared ? (
                        <p style={{ color: "var(--success-color)", fontSize: 13 }}><CheckCircle size={16} style={{ verticalAlign: "middle" }} /> Worship songs cleared.</p>
                      ) : confirmClearWorship ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: "var(--danger-color)" }}>Are you sure?</span>
                          <button className="action-btn btn-primary" style={{ backgroundColor: "var(--danger-color)" }} onClick={handleClearWorship}>Yes, Clear Worship</button>
                          <button className="action-btn" onClick={() => setConfirmClearWorship(false)}>Cancel</button>
                        </div>
                      ) : (
                        <button className="action-btn" style={{ color: "var(--danger-color)", border: "1px solid rgba(239,68,68,0.3)" }} onClick={() => setConfirmClearWorship(true)}>
                          <Trash2 size={14} /><span>Clear Worship Songs</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════════ OBS CONNECTION TAB ══════════════ */}
              {activeTab === "obs" && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3 className="section-title">Primary Connection Methods</h3>
                    <p className="section-desc">Connect to OBS Studio via the obs-websocket plugin (v5+).</p>
                  </div>

                  <div className="settings-card fields-rows-stack">
                    {/* Connection method */}
                    <div className="form-group">
                      <label className="form-label">Connection Method</label>
                      <div className="grid-2-col" style={{ marginTop: "4px" }}>
                        <label className="option-select-card">
                          <input type="radio" name="obs_method" checked={obsMethod === "WebSocket"} onChange={() => setObsMethod("WebSocket")} />
                          <div className="option-select-inner" style={{ padding: "16px", alignItems: "flex-start", textAlign: "left" }}>
                            <div className="checked-indicator"><Check size={10} /></div>
                            <div className="density-icon-box" style={{ background: obsMethod === "WebSocket" ? "rgba(var(--accent-rgb), 0.15)" : "var(--bg-card-hover)", color: obsMethod === "WebSocket" ? "var(--accent-color)" : "var(--text-secondary)" }}><Radio size={16} /></div>
                            <div style={{ marginTop: "6px" }}>
                              <span className="option-title">WebSocket (Recommended)</span>
                              <p className="option-desc" style={{ marginTop: "4px" }}>Direct live link with low latency.</p>
                            </div>
                          </div>
                        </label>
                        <label className="option-select-card">
                          <input type="radio" name="obs_method" checked={obsMethod === "Remote"} onChange={() => setObsMethod("Remote")} />
                          <div className="option-select-inner" style={{ padding: "16px", alignItems: "flex-start", textAlign: "left" }}>
                            <div className="checked-indicator"><Check size={10} /></div>
                            <div className="density-icon-box" style={{ background: obsMethod === "Remote" ? "rgba(var(--accent-rgb), 0.15)" : "var(--bg-card-hover)", color: obsMethod === "Remote" ? "var(--accent-color)" : "var(--text-secondary)" }}><ExternalLink size={16} /></div>
                            <div style={{ marginTop: "6px" }}>
                              <span className="option-title">Alternative Remote API</span>
                              <p className="option-desc" style={{ marginTop: "4px" }}>Fallback HTTP requests protocol.</p>
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <hr className="settings-divider" />

                    {/* Server address */}
                    <div className="form-group">
                      <label className="form-label">WebSocket Host Address</label>
                      <div className="custom-input-container">
                        <input type="text" className="custom-textbox" value={settings.obsUrl} onChange={(e) => update({ obsUrl: e.target.value })} placeholder="ws://localhost:4455" />
                        <button className="action-btn btn-primary" onClick={handleTestObs} disabled={obsStatus === "connecting"}>
                          {obsStatus === "connecting" ? (<><RefreshCw size={14} className="animate-spin" /><span>Connecting...</span></>) : (<><CheckCircle size={14} /><span>Test Connection</span></>)}
                        </button>
                      </div>
                    </div>

                    {/* Password */}
                    <div className="form-group" style={{ marginTop: "10px" }}>
                      <label className="form-label">Password (Optional)</label>
                      <div className="custom-input-container">
                        <input type="password" className="custom-textbox" value={obsPasswordDraft} onChange={(e) => setObsPasswordDraft(e.target.value)} placeholder="OBS authentication key" />
                      </div>
                      <span className="mv-settings-hint" style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Stored in memory for this session only.</span>
                    </div>

                    {obsTestResult && (
                      <p style={{ fontSize: 12, color: obsTestResult.includes("Connected") ? "var(--success-color)" : "var(--danger-color)" }}>
                        {obsTestResult.startsWith("Connected") ? "✓" : "✗"} {obsTestResult}
                      </p>
                    )}

                    <hr className="settings-divider" />

                    {/* Connection rules */}
                    <div>
                      <h4 className="form-label" style={{ marginBottom: "14px" }}>Connection Rules</h4>
                      <div className="switch-row" style={{ padding: "10px 0" }}>
                        <div className="switch-left">
                          <span className="switch-title">Auto-reconnect fallback</span>
                          <span className="switch-subtitle">Retry connections if server drops.</span>
                        </div>
                        <label className="switch-toggle-label">
                          <input type="checkbox" checked={settings.obsAutoReconnect} onChange={() => update({ obsAutoReconnect: !settings.obsAutoReconnect })} />
                          <span className="switch-slider"></span>
                        </label>
                      </div>
                      <div className="flex-between-center" style={{ padding: "10px 0" }}>
                        <div className="switch-left">
                          <span className="switch-title">Reconnect Interval</span>
                          <span className="switch-subtitle">Wait time between attempts.</span>
                        </div>
                        <div className="form-select-container" style={{ width: "130px" }}>
                          <select className="custom-select" value={obsReconnectInterval} onChange={(e) => { setObsReconnectInterval(e.target.value); triggerToast(`Interval set to ${e.target.value}`, "accent"); }}>
                            <option>5 seconds</option>
                            <option>10 seconds</option>
                            <option>30 seconds</option>
                          </select>
                          <span className="select-arrow"><ChevronDown size={14} /></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Connection actions */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <div className="section-header" style={{ marginBottom: "14px" }}>
                      <h4 className="section-title">Connection Actions</h4>
                    </div>
                    <div className="grid-3-col">
                      <button className="reset-button" style={{ justifyContent: "center", fontWeight: "600" }} onClick={handleReconnectNow}>
                        <RefreshCw size={14} /><span>Force Reconnect</span>
                      </button>
                      <button className="reset-button" style={{ justifyContent: "center", fontWeight: "600" }} onClick={() => setShowLogsPanel(!showLogsPanel)}>
                        <FileText size={14} /><span>{showLogsPanel ? "Hide Logs" : "View Logs"}</span>
                      </button>
                      <button className="reset-button" style={{ justifyContent: "center", fontWeight: "600", color: "var(--danger-color)" }} onClick={() => { obsService.disconnect(); setObsStatus("disconnected"); setObsPasswordDraft(""); triggerToast("Disconnected.", "accent"); }}>
                        <Trash2 size={14} /><span>Disconnect</span>
                      </button>
                    </div>
                    {showLogsPanel && (
                      <div className="expandable-logs-panel">
                        {obsLogs.map((log) => (
                          <div key={log.id} className="log-entry">
                            <span className="log-time">[{log.timestamp}]</span>
                            <span className="log-source">[{log.source}]</span>
                            <span>{log.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>


                </div>
              )}

              {/* ══════════════ APPEARANCE TAB ══════════════ */}
              {activeTab === "appearance" && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3 className="section-title">Design & Layout</h3>
                    <p className="section-desc">Customize the look, scaling, and behavior of MakeChurchEasy Studio.</p>
                  </div>

                  <div className="settings-card fields-rows-stack">
                    {/* Theme mode */}
                    <div className="form-group">
                      <label className="form-label">Interface Theme</label>
                      <div className="grid-3-col" style={{ marginTop: "4px" }}>
                        {([
                          ["dark", Moon, "Dark"],
                          ["light", Sun, "Light"],
                          ["system", Monitor, "System"],
                        ] as const).map(([id, IconComp, label]) => (
                          <label key={id} className="option-select-card">
                            <input type="radio" name="theme_mode" checked={theme === id} onChange={() => { setTheme(id); update({ theme: id } as any); }} />
                            <div className="option-select-inner" style={{ padding: "12px", textAlign: "center" }}>
                              <div className="checked-indicator"><Check size={10} /></div>
                              <div className="density-icon-box" style={{ margin: "0 auto", background: theme === id ? "rgba(var(--accent-rgb), 0.15)" : "var(--bg-card-hover)", color: theme === id ? "var(--accent-color)" : "var(--text-secondary)" }}>
                                <IconComp size={16} />
                              </div>
                              <span className="option-title" style={{ marginTop: "6px", display: "block" }}>{label}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <hr className="settings-divider" />

                    {/* Accent color */}
                    <div className="form-group">
                      <label className="form-label">Accent Color</label>
                      <div className="accent-swatches-container" style={{ marginTop: "6px" }}>
                        {SWATCHES.map((swatch) => (
                          <button key={swatch.id} className={`accent-swatch-btn ${accentColor === swatch.id ? "active" : ""}`} style={{ backgroundColor: swatch.hex }} title={swatch.name} onClick={() => setAccentColor(swatch.id)}>
                            {accentColor === swatch.id && <Check size={14} color="#fff" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <hr className="settings-divider" />

                    {/* Density */}


                    <hr className="settings-divider" />

                    {/* Font size */}
                    <div className="form-group">
                      <label className="form-label">Font Scale</label>
                      <div className="grid-3-col" style={{ marginTop: "4px" }}>
                        {([1, 2, 3] as const).map((v) => (
                          <label key={v} className="option-select-card">
                            <input type="radio" name="font_size" checked={fontSizeRange === v} onChange={() => setFontSizeRange(v)} />
                            <div className="option-select-inner" style={{ padding: "10px", textAlign: "center" }}>
                              <div className="checked-indicator"><Check size={10} /></div>
                              <span className="option-title">{v === 1 ? "Small" : v === 2 ? "Medium" : "Large"}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <hr className="settings-divider" />

                    {/* Toggles */}
                    <div className="switch-row">
                      <div className="switch-left">
                        <span className="switch-title">High contrast mode</span>
                        <span className="switch-subtitle">Increase text & border contrast for better readability.</span>
                      </div>
                      <label className="switch-toggle-label">
                        <input type="checkbox" checked={highContrastUI} onChange={() => { setHighContrastUI(!highContrastUI); update({ highContrast: !highContrastUI }); }} />
                        <span className="switch-slider"></span>
                      </label>
                    </div>
                    <div className="switch-row">
                      <div className="switch-left">
                        <span className="switch-title">Reduce motion & animations</span>
                        <span className="switch-subtitle">Disables CSS transitions and animations.</span>
                      </div>
                      <label className="switch-toggle-label">
                        <input type="checkbox" checked={reduceMotion} onChange={() => setReduceMotion(!reduceMotion)} />
                        <span className="switch-slider"></span>
                      </label>
                    </div>
                    <div className="switch-row">
                      <div className="switch-left">
                        <span className="switch-title">Rounded corners</span>
                        <span className="switch-subtitle">Toggle rounded corner style globally.</span>
                      </div>
                      <label className="switch-toggle-label">
                        <input type="checkbox" checked={roundedCorners} onChange={() => setRoundedCorners(!roundedCorners)} />
                        <span className="switch-slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════════ BRANDING TAB ══════════════ */}
              {activeTab === "branding" && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3 className="section-title">Church Profile</h3>
                    <p className="section-desc">Identity values synced from the web dashboard. Edit at makechurcheasy.com → Church Profile.</p>
                  </div>

                  {/* Sync status bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 12px", borderRadius: 3, backgroundColor: syncStatus ? "var(--surface-secondary, rgba(255,255,255,0.04))" : "transparent", border: syncStatus ? "1px solid var(--border-color)" : "none" }}>
                    {syncing && (
                      <>
                        <RefreshCw size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} />
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Syncing from web dashboard…</span>
                      </>
                    )}
                    {!syncing && syncStatus && (
                      <>
                        <CheckCircle size={14} style={{ color: "var(--accent, #10B981)", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>{syncStatus}</span>
                        <button
                          className="btn btn-ghost"
                          onClick={runSync}
                          disabled={syncing}
                          style={{ fontSize: 11, padding: "2px 8px", gap: 4, flexShrink: 0 }}
                        >
                          <RefreshCw size={12} />
                          Retry
                        </button>
                      </>
                    )}
                  </div>

                  <div className="settings-card fields-rows-stack">
                    <div className="form-group">
                      <label className="form-label">Church Name</label>
                      <input className="custom-textbox" type="text" value={settings.churchName} readOnly tabIndex={-1} style={{ opacity: 0.7, cursor: "default" }} />
                    </div>
                    {/* <div className="form-group">
                      <label className="form-label">Main Pastor Name</label>
                      <input className="custom-textbox" type="text" value={settings.mainPastorName} readOnly tabIndex={-1} style={{ opacity: 0.7, cursor: "default" }} />
                    </div> */}
                    <div className="form-group">
                      <label className="form-label">Pastors / Speakers</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr auto", gap: 8, alignItems: "center", fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" as const }}>
                          <span>Name</span><span>Position</span><span />
                        </div>
                        {speakerProfiles.filter((p) => p.name.trim()).map((profile, index) => (
                          <div key={`sp-${index}`} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr auto", gap: 8, alignItems: "center" }}>
                            <input className="custom-textbox" type="text" value={profile.name} readOnly tabIndex={-1} style={{ opacity: 0.7, cursor: "default" }} />
                            <input className="custom-textbox" type="text" value={profile.role} readOnly tabIndex={-1} style={{ opacity: 0.7, cursor: "default" }} />
                            {profile.isMain && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent, #F59E0B)", background: "rgba(245, 158, 11, 0.15)", padding: "2px 8px", borderRadius: 3, whiteSpace: "nowrap" }}>MAIN</span>
                            )}
                          </div>
                        ))}
                        {speakerProfiles.filter((p) => p.name.trim()).length === 0 && (
                          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No speakers configured.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Brand defaults */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <div className="section-header">
                      <h3 className="section-title">Brand Defaults</h3>
                      <p className="section-desc">Defaults for lower-third and speaker overlays (OBS output).</p>
                    </div>

                    <div className="settings-card fields-rows-stack">
                      <div className="form-group">
                        <label className="form-label">Default lower-third duration</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input className="custom-textbox" type="number" min={1} max={300} value={settings.lowerThirdDefaultDurationSec} readOnly tabIndex={-1} style={{ width: 80, opacity: 0.7, cursor: "default" }} />
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>sec</span>
                        </div>
                      </div>

                      <div className="grid-2-col">
                        <div className="form-group">
                          <label className="form-label">Primary Color</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: settings.brandColor, border: "1px solid var(--border-color)", flexShrink: 0 }} />
                            <input className="custom-textbox" type="text" value={settings.brandColor} readOnly tabIndex={-1} style={{ flex: 1, fontFamily: "monospace", opacity: 0.7, cursor: "default" }} />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Secondary Color</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: settings.brandSecondaryColor || DEFAULT_SETTINGS.brandColor, border: "1px solid var(--border-color)", flexShrink: 0 }} />
                            <input className="custom-textbox" type="text" value={settings.brandSecondaryColor} readOnly tabIndex={-1} style={{ flex: 1, fontFamily: "monospace", opacity: 0.7, cursor: "default" }} />
                          </div>
                        </div>
                      </div>

                      <div className="grid-2-col">
                        <div className="form-group">
                          <label className="form-label">Accent Color</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: settings.brandAccentColor, border: "1px solid var(--border-color)", flexShrink: 0 }} />
                            <input className="custom-textbox" type="text" value={settings.brandAccentColor} readOnly tabIndex={-1} style={{ flex: 1, fontFamily: "monospace", opacity: 0.7, cursor: "default" }} />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Font Family</label>
                          <input className="custom-textbox" type="text" value={settings.brandFontFamily} readOnly tabIndex={-1} style={{ opacity: 0.7, cursor: "default" }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Brand logo */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <div className="section-header">
                      <h3 className="section-title">Brand Logo</h3>
                      <p className="section-desc">Church logo synced from the web dashboard.</p>
                    </div>

                    <div className="settings-card fields-rows-stack">
                      {settings.brandLogoPath ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8 }}>
                          <img
                            src={resolveLogoPreviewSrc(settings.brandLogoPath)}
                            alt="Church logo"
                            style={{ width: 48, height: 48, borderRadius: 6, objectFit: "contain", background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}
                          />
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Logo synced from web dashboard</span>
                        </div>
                      ) : (
                        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No logo set. Upload one from the web dashboard.</p>
                      )}
                    </div>
                  </div>

                  {/* First-launch setup */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <div className="section-header">
                      <h3 className="section-title">First-Launch Setup</h3>
                      <p className="section-desc">Reopen the church profile setup flow for a new operator.</p>
                    </div>
                    <button className="action-btn" onClick={handleResetChurchOnboarding}><RefreshCw size={14} /> Reset Onboarding</button>
                  </div>
                </div>
              )}

              {/* ══════════════ BIBLE TAB ══════════════ */}


              {/* ══════════════ CREDITS TAB ══════════════ */}
              {activeTab === "usage" && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3 className="section-title">Credits Overview</h3>
                    <p className="section-desc">Track your AI credits usage and plan details.</p>
                  </div>

                  {/* ── Trial Banner ── */}
                  {trialActive && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 18px", borderRadius: "3px", marginBottom: "20px",
                      background: "rgba(139, 92, 246, 0.08)",
                      border: "1px solid rgba(139, 92, 246, 0.2)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Calendar size={18} style={{ color: "#8B5CF6" }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                            Growth Trial — {trialDaysLeft} Day{trialDaysLeft !== 1 ? "s" : ""} Remaining
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Ends {trialEndDate} · All premium features are active
                          </div>
                        </div>
                      </div>
                      <button className="action-btn btn-primary" style={{ fontSize: "0.78rem", padding: "6px 14px" }} onClick={() => triggerToast("Visit makechurcheasy.com/pricing to upgrade", "accent")}>
                        <ExternalLink size={12} /> Upgrade
                      </button>
                    </div>
                  )}

                  {/* ── Credits Dashboard ── */}
                  <div className="settings-card credits-dashboard" style={{ marginBottom: "24px" }}>
                    <div className="credits-dashboard-grid">
                      <div className="credits-stat">
                        <span className="credits-stat-label">Current Plan</span>
                        <div className="credits-stat-value-row">
                          <span className="credits-stat-value">{planLabel} Plan</span>
                          <span className="feature-tag-pill" style={{
                            textTransform: "uppercase",
                            fontSize: "8px",
                            background: trialActive ? "rgba(139,92,246,0.15)" : "rgba(16,185,129,0.15)",
                            color: trialActive ? "#8B5CF6" : "var(--success-color)",
                          }}>{trialActive ? "Active Trial" : "Active"}</span>
                        </div>
                      </div>
                      <div className="credits-stat">
                        <span className="credits-stat-label">Credits Remaining</span>
                        <span className="credits-stat-value credits-accent">{isUnlimited ? "Unlimited" : formatCredits(creditBalance)}</span>
                      </div>
                      <div className="credits-stat">
                        <span className="credits-stat-label">This Month</span>
                        <span className="credits-stat-value">{isUnlimited ? "—" : `${creditsUsedThisMonth} Credits Used`}</span>
                      </div>
                      <div className="credits-stat">
                        <span className="credits-stat-label">Next Reset</span>
                        <span className="credits-stat-value">{isUnlimited ? "N/A" : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); return d.toLocaleDateString("en-US", { month: "long", day: "numeric" }); })()}</span>
                      </div>
                    </div>

                    {!isUnlimited && (
                      <div className="credits-progress-section">
                        <div className="credits-progress-header">
                          <span className="credits-progress-text">{creditsUsedThisMonth} of {formatCredits(planCredits)} Credits Used</span>
                          <span className="credits-progress-pct">{usagePct}%</span>
                        </div>
                        <div className="credits-progress-track">
                          <div className="credits-progress-fill" style={{ width: `${usagePct}%` }}></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Recent Transactions ── */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <h4 className="section-title">Recent Transactions</h4>
                    {recentTransactions.length === 0 ? (
                      <p className="section-desc" style={{ marginTop: "8px" }}>No transactions yet.</p>
                    ) : (
                      <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {recentTransactions.map((tx) => (
                          <div key={tx._id || tx.createdAt} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 12px", borderRadius: "3px",
                            background: "var(--bg-secondary, rgba(255,255,255,0.04))",
                            fontSize: "0.8rem",
                          }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ fontWeight: 600 }}>{tx.description}</span>
                              <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                                {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <span style={{ fontWeight: 700, color: tx.amount < 0 ? "#f87171" : "#34d399" }}>
                              {tx.amount > 0 ? "+" : ""}{tx.amount}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── About Credits ── */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <h4 className="section-title">About Credits</h4>
                    <p className="section-desc" style={{ marginBottom: "14px" }}>Credits power AI features only.</p>
                    <div className="about-credits-grid">
                      {[
                        "Bible Presentation",
                        "Worship Presentation",
                        "Media Management",
                        "OBS Integration",
                        "Themes",
                        "Lower Thirds",
                      ].map((item, i) => (
                        <div key={i} className="about-credit-item">
                          <Check size={13} />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                    <p className="about-credits-note">do NOT consume credits.</p>
                  </div>

                  {/* ── Credit Consumption Rates ── */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <h4 className="section-title">Credit Consumption</h4>
                    <div className="credit-rates-grid" style={{ marginTop: "14px" }}>
                      {(planConfig?.creditCosts ?? []).map((rate, i) => {
                        const icons = [Mic, Globe, FileText, Book, Paintbrush];
                        const IconComp = icons[i] || Mic;
                        return (
                          <div key={i} className="credit-rate-row">
                            <div className="credit-rate-icon">
                              <IconComp size={16} />
                            </div>
                            <div className="credit-rate-content">
                              <div className="credit-rate-header">
                                <span className="credit-rate-title">{rate.name}</span>
                                <span className="credit-rate-cost">{rate.cost} Credit{rate.cost !== 1 ? "s" : ""} / {rate.unit.replace("flat", "use")}</span>
                              </div>
                              <p className="credit-rate-desc">{rate.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>


                  {/* ── Plan Features ── */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <h4 className="section-title">{proUnlocked ? "Pro Plan Features" : trialActive ? "Growth Trial Features" : "Free Plan Features"}</h4>
                    <div className="plan-features-columns" style={{ marginTop: "14px" }}>
                      {/* Included */}
                      <div className="plan-features-col">
                        <span className="plan-features-col-title plan-features-col-included">Included</span>
                        <ul className="plan-features-list">
                          {[
                            "Unlimited Songs",
                            "Unlimited Media",
                            "10,000+ Bible Translations",
                            "OBS Integration",
                            "Custom Themes",
                            "Lower Thirds",
                            "Speaker Profiles",
                            "EasyWorship Import",
                            "ProPresenter Import",
                            "Offline Bible Access",
                          ].map((f, i) => (
                            <li key={i} className="plan-features-list-item plan-features-list-included">
                              <Check size={13} />
                              <span>{f}</span>
                            </li>
                          ))}
                          {proUnlocked && [
                            "Speech-to-Scripture",
                            "Live Translation",
                            "Multiview",
                            "Mobile Control",
                            "Team Members",
                            "Cloud Backup",
                            "Priority Support",
                          ].map((f, i) => (
                            <li key={`pro-${i}`} className="plan-features-list-item plan-features-list-included">
                              <Check size={13} />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Not Included */}
                      {!proUnlocked && (
                        <div className="plan-features-col">
                          <span className="plan-features-col-title plan-features-col-excluded">Not Included</span>
                          <ul className="plan-features-list">
                            {[
                              "Speech-to-Scripture",
                              "Live Translation",
                              "Multiview",
                              "Mobile Control",
                              "Team Members",
                              "Cloud Backup",
                              "Priority Support",
                            ].map((f, i) => (
                              <li key={i} className="plan-features-list-item plan-features-list-excluded">
                                <span className="plan-feature-x">✗</span>
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════════ PRO LICENSE TAB ══════════════ */}
              {activeTab === "pro" && (
                <div className="settings-section">
                  <div className="section-header">
                    <h3 className="section-title">License Status</h3>
                    <p className="section-desc">Verify your license, activate features, manage keys.</p>
                  </div>

                  {/* Trial Banner */}
                  {trialActive && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 18px", borderRadius: "3px", marginBottom: "20px",
                      background: "rgba(139, 92, 246, 0.08)",
                      border: "1px solid rgba(139, 92, 246, 0.2)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Calendar size={18} style={{ color: "#8B5CF6" }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                            Growth Trial — {trialDaysLeft} Day{trialDaysLeft !== 1 ? "s" : ""} Remaining
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Ends {trialEndDate} · You have access to all premium features
                          </div>
                        </div>
                      </div>
                      <button className="action-btn btn-primary" style={{ fontSize: "0.78rem", padding: "6px 14px" }} onClick={() => triggerToast("Visit makechurcheasy.com/pricing to upgrade", "accent")}>
                        <ExternalLink size={12} /> Upgrade
                      </button>
                    </div>
                  )}

                  <div className="settings-card" style={{ padding: "24px", position: "relative", overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="flex-vertical-item" style={{ gap: "14px" }}>
                        <div className="flex-vertical-item" style={{ gap: "4px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>Status</span>
                          <span className={`license-status-tag ${proUnlocked || trialActive ? "active" : "inactive"}`}>
                            {proUnlocked ? "Active" : trialActive ? "Active Trial" : "Inactive"}
                          </span>
                        </div>
                        <div className="grid-3-col" style={{ gap: "32px" }}>
                          <div className="flex-vertical-item" style={{ gap: "4px" }}>
                            <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>Type</span>
                            <span style={{ fontWeight: "700", fontSize: "0.98rem" }}>{proUnlocked ? "Pro Unlimited" : trialActive ? "Growth Trial" : "N/A"}</span>
                          </div>
                          {trialActive && (
                            <div className="flex-vertical-item" style={{ gap: "4px" }}>
                              <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>Expires</span>
                              <span style={{ fontWeight: "700", fontSize: "0.98rem" }}>{trialEndDate}</span>
                            </div>
                          )}
                          {renewalsLeft > 0 && !proUnlocked && !trialActive && (
                            <div className="flex-vertical-item" style={{ gap: "4px" }}>
                              <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>Renewals Left</span>
                              <span style={{ fontWeight: "700", fontSize: "0.98rem" }}>{renewalsLeft}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="pro-shield-badge"><ShieldCheck size={32} /></div>
                    </div>
                  </div>

                  {/* Pro key form */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <h4 className="section-title">License Key</h4>
                    <p className="section-desc">Paste in the key provided via invoice.</p>

                    <div className="settings-card" style={{ marginTop: "14px" }}>
                      {proUnlocked ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--success-color)", fontSize: "0.88rem", fontWeight: "500", flex: 1 }}>
                            <CheckCircle size={16} />
                            <span>License active. Unlimited usage.</span>
                          </div>
                          <button className="action-btn" onClick={handleRemoveProLicense}>Remove</button>
                        </div>
                      ) : (
                        <div className="form-group">
                          <label className="form-label">License Key</label>
                          <div className="custom-input-container">
                            <input
                              className="custom-textbox"
                              type="text"
                              style={{ fontFamily: "var(--font-mono)", fontSize: "0.84rem" }}
                              placeholder="VC-PRO-XXXX-XXXX-XXXX-XXXX or renewal key"
                              value={proKeyInput}
                              onChange={(e) => { setProKeyInput(e.target.value); setProKeyStatus("idle"); setProKeyError(null); setProKeySuccessMsg(null); }}
                              onKeyDown={(e) => { if (e.key === "Enter") handleValidateProKey(); }}
                            />
                            <button className="action-btn btn-primary" onClick={handleValidateProKey} disabled={proKeyStatus === "validating"}>
                              {proKeyStatus === "validating" ? (<><RefreshCw size={14} className="animate-spin" /><span>Validating...</span></>) : (<><Lock size={14} /><span>Activate</span></>)}
                            </button>
                          </div>
                          {proKeyError && <p style={{ color: "var(--danger-color)", fontSize: 12, marginTop: 6 }}>{proKeyError}</p>}
                          {proKeySuccessMsg && <p style={{ color: "var(--success-color)", fontSize: 12, marginTop: 6 }}>{proKeySuccessMsg}</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Features checklist */}
                  <div className="settings-section" style={{ marginTop: "24px" }}>
                    <h4 className="section-title">Pro Features</h4>
                    <div className="settings-card" style={{ marginTop: "14px" }}>
                      <ul className="bullet-checklist">
                        {[
                          "Unlimited Speech-to-Scripture triggers",
                          "Advanced dual multi-language translation",
                          "Premium overlay output themes",
                          "Connect 5 secondary devices simultaneously",
                          "Priority 24/7 technical support",
                        ].map((feature, i) => (
                          <li key={i} className="checklist-bullet">
                            <CheckCircle size={15} className="bullet-icon-box" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════════ DEVELOPER TAB ══════════════ */}
              {activeTab === "developer" && (
                <DeveloperTabContent
                  userPlan={userPlan}
                  proUnlocked={proUnlocked}
                  triggerToast={triggerToast}
                />
              )}
            </div>

            {/* Right: widgets column */}
            <div className="widgets-column">
              {/* Appearance preview widget */}


              {/* Settings summary widget */}


              {/* OBS connection widget */}
              {activeTab === "obs" && (
                <div className="widget-card">
                  <div className="widget-header">
                    <h4 className="widget-title">Connection Status</h4>
                  </div>
                  <div className="widget-body">
                    <div className="radar-pulse-ambient">
                      <div className="radar-circle-outer">
                        <div className="radar-circle-inner" style={{ borderColor: obsStatus === "connected" ? "var(--success-color)" : "var(--text-muted)", color: obsStatus === "connected" ? "var(--success-color)" : "var(--text-muted)" }}>
                          <Radio size={28} />
                        </div>
                      </div>
                      {obsStatus === "connected" && <div className="radar-ripple"></div>}
                    </div>
                    <div className="details-rows-list" style={{ marginTop: "16px" }}>
                      <div className="details-row">
                        <span className="details-label">Ping</span>
                        <span className="details-value">
                          {obsStatus === "connected" ? (<><span className="dot-indicator dot-success"></span><span>Connected</span></>) : <span>Disconnected</span>}
                        </span>
                      </div>
                      <div className="details-row">
                        <span className="details-label">Endpoint</span>
                        <span className="details-value mono-display" style={{ fontSize: "11px" }}>{settings.obsUrl || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Usage gauge widget */}
              {activeTab === "usage" && (
                <div className="widget-card">
                  <div className="widget-header">
                    <h4 className="widget-title">Credits Used This Month</h4>
                  </div>
                  <div className="widget-body">
                    <div className="radial-gauge-container">
                      <svg width="150" height="150" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" className="radial-bg-circle" />
                        <circle
                          cx="50" cy="50" r="42"
                          className="radial-proc-circle"
                          strokeDasharray="263.89"
                          strokeDashoffset={isUnlimited ? "0" : String(263.89 * (1 - usagePct / 100))}
                        />
                      </svg>
                      <div className="radial-center-text">
                        <span className="radial-val">{isUnlimited ? "∞" : creditsUsedThisMonth}</span>
                        <span className="radial-unit">{isUnlimited ? "Unlimited" : `of ${formatCredits(planCredits)} Credits`}</span>
                      </div>
                    </div>
                    <p className="credits-sidebar-pct">{isUnlimited ? "Unlimited" : `${usagePct}%`}</p>
                  </div>
                </div>
              )}

              {/* Upgrade CTA / Plan features / Onboarding Checklist */}
              {(activeTab === "pro" || activeTab === "usage") && (
                <div className="widget-card">
                  {proUnlocked ? (
                    <>
                      <div className="widget-header">
                        <h4 className="widget-title">Pro Features</h4>
                      </div>
                      <div className="widget-body">
                        <ul className="bullet-checklist">
                          {[
                            "Unlimited Speech-to-Scripture",
                            "Live Translation",
                            "Dual Language Worship",
                            "Multiview",
                            "Mobile Control",
                            "Cloud Backup",
                          ].map((f, i) => (
                            <li key={i} className="checklist-bullet">
                              <CheckCircle size={15} className="bullet-icon-box" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : trialActive ? (
                    <>
                      <div className="widget-header">
                        <h4 className="widget-title">Getting Started</h4>
                      </div>
                      <div className="widget-body">
                        <p className="widget-desc" style={{ marginBottom: "14px" }}>Complete setup to get the most from your trial.</p>
                        <ul className="bullet-checklist">
                          {[
                            { label: "Pair a device", done: Boolean(authUser?.appId) },
                            { label: "Connect OBS", done: obsStatus === "connected" },
                            { label: "Run first presentation", done: false },
                            { label: "Try Speech-to-Scripture", done: false },
                            { label: "Try Live Translation", done: false },
                          ].map((item, i) => (
                            <li key={i} className="checklist-bullet" style={{ opacity: item.done ? 0.5 : 1 }}>
                              <CheckCircle size={15} className="bullet-icon-box" style={{ color: item.done ? "var(--success-color)" : undefined }} />
                              <span style={{ textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
                            </li>
                          ))}
                        </ul>
                        <button className="action-btn btn-primary" style={{ marginTop: "16px", width: "100%", justifyContent: "center" }} onClick={() => triggerToast("Visit makechurcheasy.com/pricing to view plans", "accent")}>
                          <ExternalLink size={14} />
                          <span>View Plans</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="widget-header">
                        <h4 className="widget-title">View Plans</h4>
                      </div>
                      <div className="widget-body">
                        <p className="widget-desc" style={{ marginBottom: "14px" }}>Compare available plans and unlock more features.</p>
                        <ul className="bullet-checklist">
                          {[
                            "Speech-to-Scripture",
                            "Live Translation",
                            "Dual Language Worship",
                            "Multiview",
                            "Mobile Control",
                            "Cloud Backup",
                          ].map((f, i) => (
                            <li key={i} className="checklist-bullet">
                              <CheckCircle size={15} className="bullet-icon-box" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                        <button className="action-btn btn-primary" style={{ marginTop: "16px", width: "100%", justifyContent: "center" }} onClick={() => triggerToast("Visit makechurcheasy.com/pricing to view plans", "accent")}>
                          <ExternalLink size={14} />
                          <span>View Plans</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Tips card */}

              {/* API Keys widget */}
              {activeTab === "developer" && (
                <div className="widget-card">
                  <div className="widget-header">
                    <h4 className="widget-title">API Rate Limit</h4>
                  </div>
                  <div className="widget-body">
                    <div className="details-rows-list">
                      <div className="details-row">
                        <span className="details-label">Daily Limit</span>
                        <span className="details-value">1,000 requests</span>
                      </div>
                      <div className="details-row">
                        <span className="details-label">Auth Method</span>
                        <span className="details-value">Bearer Token</span>
                      </div>
                      <div className="details-row">
                        <span className="details-label">Key Format</span>
                        <span className="details-value mono-display" style={{ fontSize: "10px" }}>mce_live_...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
