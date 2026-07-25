"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Church,
  User,
  Globe,
  Users,
  CreditCard,
  Calendar,
  Clock,
  Mail,
  Zap,
  BookOpen,
  Music,
  Mic,
  FileText,
  Monitor,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getCountryDisplayName } from "@/lib/countryDisplay";

interface ChurchDetail {
  id: string;
  name: string;
  email: string;
  churchName: string;
  role: string;
  credits: number;
  plan: string;
  country: string;
  createdAt: string | null;
  lastLogin: string | null;
  appId: string;
  usage: {
    bibleSearches: number;
    songsCreated: number;
    mediaUploaded: number;
    aiHoursUsed: number;
    transcriptCount: number;
  };
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-gray-800 ${className ?? ""}`} />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-300 font-medium">{value}</span>
    </div>
  );
}

function UsageStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="text-center">
      <div className="w-8 h-8 bg-gray-800 rounded-xl flex items-center justify-center text-slate-400 mx-auto mb-1.5">
        {icon}
      </div>
      <p className="text-lg font-bold text-slate-50">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

export default function AdminChurchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations();
  const [church, setChurch] = useState<ChurchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchChurch = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(t('admin.churches.detail.title') + " not found");
      const data = await res.json();
      setChurch({
        id: data.id || data._id,
        name: data.name,
        email: data.email,
        churchName: data.churchName,
        role: data.role,
        credits: data.credits,
        plan: data.plan,
        country: data.country || "",
        createdAt: data.createdAt,
        lastLogin: data.lastLogin,
        appId: data.appId,
        usage: data.usage || {
          bibleSearches: 0,
          songsCreated: 0,
          mediaUploaded: 0,
          aiHoursUsed: 0,
          transcriptCount: 0,
        },
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load church");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchChurch();
  }, [fetchChurch]);

  function planBadgeClasses(plan: string) {
    const colors: Record<string, string> = {
      free: "bg-gray-800 text-slate-400",
      basic: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
      growth: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
      pro: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
      ambassador: "bg-purple-900/50 text-purple-300 border border-purple-700/50",
      unlimited: "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50",
    };
    return colors[plan] || colors.free;
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <SkeletonBlock className="h-6 w-32 mb-6" />
        <div className="flex items-start gap-4 mb-8">
          <SkeletonBlock className="w-14 h-14 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-6 w-48" />
            <SkeletonBlock className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-48" />
        </div>
        <SkeletonBlock className="h-32" />
      </div>
    );
  }

  if (error || !church) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <p className="text-sm text-red-400 mb-4">{error || "Church not found"}</p>
        <button
          onClick={() => router.back()}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← {t('admin.churches.detail.backToChurches')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('admin.churches.detail.backToChurches')}
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 shrink-0">
          <Church className="w-7 h-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-50">
            {church.churchName || church.name || t('admin.churches.detail.title')}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> {t('admin.churches.detail.pastor')}: {church.name}
          </p>
          <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> {church.email}
          </p>
          {church.country && (
            <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> {getCountryDisplayName(church.country)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Church Info Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Church className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">
              {t('admin.churches.detail.churchInformation')}
            </h2>
          </div>
          <div className="space-y-2">
            <InfoRow
              label={t('admin.churches.detail.churchName')}
              value={church.churchName || "—"}
            />
            <InfoRow
              label={t('admin.churches.detail.pastor')}
              value={church.name || "—"}
            />
            <InfoRow
              label={t('admin.churches.detail.country')}
              value={getCountryDisplayName(church.country, "—")}
            />
            <InfoRow
              label={t('admin.churches.detail.plan')}
              value={church.plan || "free"}
            />
          </div>
          <div className="flex items-center gap-2 mt-4">
            <span
              className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${planBadgeClasses(
                church.plan
              )}`}
            >
              {church.plan || "free"}
            </span>
          </div>
        </div>

        {/* Account Info Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">
              {t('admin.churches.detail.accountInformation')}
            </h2>
          </div>
          <div className="space-y-2">
            <InfoRow
              label={t('admin.churches.detail.email')}
              value={church.email || "—"}
            />
            <InfoRow
              label={t('admin.churches.detail.joined')}
              value={
                church.createdAt
                  ? new Date(church.createdAt).toLocaleDateString()
                  : "—"
              }
            />
            <InfoRow
              label={t('admin.churches.detail.lastLogin')}
              value={
                church.lastLogin
                  ? new Date(church.lastLogin).toLocaleString()
                  : "—"
              }
            />
            <InfoRow
              label={t('admin.churches.detail.userRole')}
              value={church.role || "—"}
            />
            <InfoRow
              label={t('admin.churches.detail.credits')}
              value={church.credits.toLocaleString()}
            />
            <InfoRow
              label={t('admin.churches.detail.appId')}
              value={church.appId || t('admin.churches.detail.appIdNA')}
            />
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Zap className="w-4 h-4 text-indigo-400" />
          </div>
          <h2 className="text-sm font-semibold text-slate-50">
            {t('admin.userDetail.usage.title')}
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-2">
          <UsageStat
            icon={<BookOpen className="w-4 h-4" />}
            label={t('admin.userDetail.usage.bibleSearches')}
            value={church.usage.bibleSearches}
          />
          <UsageStat
            icon={<Music className="w-4 h-4" />}
            label={t('admin.userDetail.usage.songsCreated')}
            value={church.usage.songsCreated}
          />
          <UsageStat
            icon={<Monitor className="w-4 h-4" />}
            label={t('admin.userDetail.usage.mediaUploaded')}
            value={church.usage.mediaUploaded}
          />
          <UsageStat
            icon={<Mic className="w-4 h-4" />}
            label={t('admin.userDetail.usage.aiHours')}
            value={church.usage.aiHoursUsed}
          />
          <UsageStat
            icon={<FileText className="w-4 h-4" />}
            label={t('admin.userDetail.usage.transcripts')}
            value={church.usage.transcriptCount}
          />
        </div>
      </div>
    </div>
  );
}
