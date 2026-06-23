import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  BookOpen,
  Music,
  Images,
  Mic,
  FileText,
  Palette,
  Loader2,
} from "lucide-react";
import {
  fetchAnalytics,
  formatNumber,
  type FeatureUsage,
  type BibleAnalytics,
  type WorshipAnalytics,
} from "../../services/adminService";
import "./Admin.css";

const FEATURE_ICONS = {
  bible: { icon: BookOpen, color: "#60a5fa" },
  worship: { icon: Music, color: "#34d399" },
  media: { icon: Images, color: "#a78bfa" },
  voice: { icon: Mic, color: "#f59e0b" },
  transcripts: { icon: FileText, color: "#f472b6" },
  themes: { icon: Palette, color: "#38bdf8" },
} as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#242428", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px", fontSize: 12, color: "var(--text)" }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || "var(--text-secondary)" }}>{formatNumber(p.value)}</div>
      ))}
    </div>
  );
}

const EMPTY_FEATURE: FeatureUsage = { bibleSearches: 0, worshipPresentations: 0, mediaPresentations: 0, voiceSessions: 0, transcriptViews: 0, themesCreated: 0 };
const EMPTY_BIBLE: BibleAnalytics = { mostUsedVersions: [], mostSearchedBooks: [], totalBibleSessions: 0 };
const EMPTY_WORSHIP: WorshipAnalytics = { songsCreated: 0, songsImported: 0, totalWorshipSlides: 0, mostUsedThemes: [] };

export default function AdminFeatureUsagePage() {
  const [loading, setLoading] = useState(true);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsage>(EMPTY_FEATURE);
  const [bibleAnalytics, setBibleAnalytics] = useState<BibleAnalytics>(EMPTY_BIBLE);
  const [worshipAnalytics, setWorshipAnalytics] = useState<WorshipAnalytics>(EMPTY_WORSHIP);
  const [mediaStats, setMediaStats] = useState({ imagesUploaded: 0, mediaPresentations: 0 });
  const [transcriptStats, setTranscriptStats] = useState({ totalTranscripts: 0, exportsGenerated: 0, translationsGenerated: 0 });

  useEffect(() => {
    fetchAnalytics(90).then((data) => {
      if (data) {
        setFeatureUsage(data.featureUsage);
        setBibleAnalytics(data.bibleAnalytics);
        setWorshipAnalytics(data.worshipAnalytics);
        setMediaStats(data.mediaAnalytics);
        setTranscriptStats(data.transcriptAnalytics);
      }
      setLoading(false);
    });
  }, []);

  const featureCards = useMemo(() => {
    const raw = [
      { key: "bible", label: "Bible Searches", value: featureUsage.bibleSearches },
      { key: "worship", label: "Worship Presentations", value: featureUsage.worshipPresentations },
      { key: "media", label: "Media Presentations", value: featureUsage.mediaPresentations },
      { key: "voice", label: "Voice Sessions", value: featureUsage.voiceSessions },
      { key: "transcripts", label: "Transcript Views", value: featureUsage.transcriptViews },
      { key: "themes", label: "Themes Created", value: featureUsage.themesCreated },
    ] as const;
    const maxVal = Math.max(...raw.map((f) => f.value), 1);
    return raw.map((f) => ({
      ...f,
      pct: Math.round((f.value / maxVal) * 100),
      ...FEATURE_ICONS[f.key as keyof typeof FEATURE_ICONS],
    }));
  }, [featureUsage]);

  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>Feature Usage</h1>
          <p>Track which MakeChurchEasy features users actually use</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px", gap: 8, color: "var(--text-muted)" }}>
          <Loader2 size={18} className="spin" />
          Loading feature usage…
        </div>
      ) : (
        <>
          {/* Feature Cards */}
          <div className="admin-kpi-grid">
            {featureCards.map((card) => {
              const Icon = card.icon;
              return (
                <div className="admin-kpi-card" key={card.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: `${card.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={14} color={card.color} />
                    </div>
                    <span className="admin-kpi-label" style={{ textTransform: "none" }}>{card.label}</span>
                  </div>
                  <div className="admin-kpi-value">{formatNumber(card.value)}</div>
                  <div className="admin-progress-bar" style={{ marginTop: 6 }}>
                    <div className="admin-progress-fill" style={{ width: `${card.pct}%`, background: card.color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bible Analytics */}
          <div className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Bible Analytics</div>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {formatNumber(bibleAnalytics.totalBibleSessions)} total sessions
              </span>
            </div>
            {bibleAnalytics.mostUsedVersions.length > 0 ? (
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bibleAnalytics.mostUsedVersions} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
                No Bible search data yet.
              </div>
            )}
          </div>

          {/* Worship Analytics */}
          <div className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Worship Analytics</div>
            </div>
            <div className="admin-kpi-grid" style={{ marginBottom: 16 }}>
              <div className="admin-kpi-card">
                <span className="admin-kpi-label">Songs Created</span>
                <div className="admin-kpi-value">{formatNumber(worshipAnalytics.songsCreated)}</div>
              </div>
              <div className="admin-kpi-card">
                <span className="admin-kpi-label">Songs Imported</span>
                <div className="admin-kpi-value">{formatNumber(worshipAnalytics.songsImported)}</div>
              </div>
              <div className="admin-kpi-card">
                <span className="admin-kpi-label">Worship Presentations</span>
                <div className="admin-kpi-value">{formatNumber(worshipAnalytics.totalWorshipSlides)}</div>
              </div>
            </div>
          </div>

          {/* Media & Transcript */}
          <div className="admin-grid-2">
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Media Analytics</div>
              </div>
              <div className="admin-stat-row">
                <span className="admin-stat-label">Media Uploaded</span>
                <span className="admin-stat-value">{formatNumber(mediaStats.imagesUploaded)}</span>
              </div>
              <div className="admin-stat-row">
                <span className="admin-stat-label">Media Presentations</span>
                <span className="admin-stat-value">{formatNumber(mediaStats.mediaPresentations)}</span>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Transcript Analytics</div>
              </div>
              <div className="admin-stat-row">
                <span className="admin-stat-label">Total Transcripts</span>
                <span className="admin-stat-value">{formatNumber(transcriptStats.totalTranscripts)}</span>
              </div>
              <div className="admin-stat-row">
                <span className="admin-stat-label">Translations Generated</span>
                <span className="admin-stat-value">{formatNumber(transcriptStats.translationsGenerated)}</span>
              </div>
              <div className="admin-stat-row">
                <span className="admin-stat-label">Exports Generated</span>
                <span className="admin-stat-value">{formatNumber(transcriptStats.exportsGenerated)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
