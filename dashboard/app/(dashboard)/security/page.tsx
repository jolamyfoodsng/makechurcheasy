"use client";

import { useEffect, useState } from "react";
import { Shield, Lock, Smartphone, Monitor as Desktop, Mail, ShieldCheck, MoreVertical, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { getSecuritySessions, terminateOtherSessions, getUser, get2FAStatus, type SecuritySession, type User } from "@/lib/api";
import { getUserId } from "@/lib/userId";
import { Card, CardHeader, Badge, Button, EmptyState } from "@/components/ui";
import { useTranslations } from "next-intl";

function formatTimeAgo(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return t("common.justNow");
  if (diff < 3600) return t("common.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("common.hoursAgo", { n: Math.floor(diff / 3600) });
  if (diff < 2592000) return t("common.daysAgo", { n: Math.floor(diff / 86400) });
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Security() {
  const t = useTranslations();
  const userId = getUserId();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    Promise.all([
      getUser(userId).catch(() => null),
      getSecuritySessions(userId).catch(() => []),
      get2FAStatus().catch(() => ({ enabled: false })),
    ])
      .then(([u, s, fa]) => { setUser(u); setSessions(s); setTwoFactorEnabled(fa.enabled); })
      .finally(() => setLoading(false));
  }, [userId]);

  const handleTerminateOthers = async () => {
    if (!userId) return;
    try {
      const currentSession = sessions.find((s) => s.isCurrent);
      if (currentSession?.sessionId) {
        await terminateOtherSessions(userId, currentSession.sessionId);
      }
      const updated = await getSecuritySessions(userId);
      setSessions(updated);
    } catch { }
    setOpenDropdown(null);
  };

  const sessionCount = sessions.length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full flex flex-col gap-4 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("security.title")}</h1>
        <p className="text-sm text-slate-500">{t("security.description")}</p>
      </div>

      {/* Security Overview */}
      <Card padding="lg">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t("security.overview")}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{t("security.accountSecurityStatus")}</p>
          </div>
          <Badge variant="success" size="md" dot>{t("security.secure")}</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Lock, title: t("common.password"), stat: t("security.strong"), variant: "success" as const },
            { icon: Smartphone, title: t("security.twoFactorAuth"), stat: twoFactorEnabled ? t("common.enabled") : t("common.notConfigured"), variant: twoFactorEnabled ? "success" as const : "default" as const },
            { icon: Desktop, title: t("security.activeSessions"), stat: loading ? "..." : String(sessionCount), variant: "info" as const },
            { icon: Mail, title: t("security.recoveryEmail"), stat: t("common.verified"), variant: "success" as const },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100">
                <item.icon className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{item.title}</span>
                <Badge variant={item.variant} size="sm">{item.stat}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Password */}
      <Card padding="md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t("common.password")}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {user?.passwordLastChanged ? t("common.lastChanged", { time: formatTimeAgo(user.passwordLastChanged, t) }) : t("security.noPasswordChange")}
            </p>
          </div>
          <Link href="/security/password">
            <Button variant="secondary" size="sm" icon={<Lock className="w-4 h-4" />}>{t("security.changePassword")}</Button>
          </Link>
        </div>
      </Card>

      {/* Two-Factor Auth */}
      <Card padding="lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t("security.twoFactorAuth")}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t("security.twoFactorDescription")}</p>
            <p className="text-xs mt-1.5">
              Status: <Badge variant={twoFactorEnabled ? "success" : "default"} size="sm">{twoFactorEnabled ? t("common.enabled") : t("common.notConfigured")}</Badge>
            </p>
          </div>
          <Link href="/security/2fa">
            <Button variant="secondary" size="sm" icon={<Shield className="w-4 h-4" />}>{t("security.manage2FA")}</Button>
          </Link>
        </div>
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${twoFactorEnabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{t("security.twoFA.authenticatorApp")}</h3>
            <p className="text-xs text-slate-500">{t("security.twoFA.setupDescription")}</p>
          </div>
        </div>
      </Card>

      {/* Active Sessions */}
      <Card padding="lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t("security.activeSessions")}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t("security.sessionsDescription")}</p>
          </div>
          {!loading && sessions.length > 0 && (
            <Link href="/security/sessions">
              <Button variant="secondary" size="sm" icon={<Desktop className="w-4 h-4" />}>{t("security.manageSessions")}</Button>
            </Link>
          )}
        </div>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {loading ? (
            <div className="p-6 text-center text-slate-400 flex items-center justify-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> {t("security.loadingSessions")}
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState icon={<Desktop className="w-5 h-5" />} title={t("security.noActiveSessions")} description={t("security.sessionsWillAppear")} />
          ) : (
            sessions.map((session, i) => (
              <div key={session.sessionId || i} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-500">
                    {session.deviceOs?.includes("Mobile") || session.deviceOs?.includes("iPhone") || session.deviceOs?.includes("Android") ? (
                      <Smartphone className="w-4 h-4" />
                    ) : (
                      <Desktop className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{session.deviceName || t("security.unknownDevice")}</p>
                    <p className="text-[11px] text-slate-500">
                      {session.ipAddress || t("security.unknownIP")} · {session.location || t("security.unknownLocation")}
                      {session.isCurrent && <span className="ml-2"><Badge variant="success" size="sm">{t("security.current")}</Badge></span>}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <div className="relative">
                    <button
                      onClick={() => setOpenDropdown(openDropdown === i ? null : i)}
                      className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openDropdown === i && (
                      <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl py-1 z-10 min-w-[160px]">
                        <button
                          onClick={handleTerminateOthers}
                          className="flex items-center gap-2 px-3 h-[36px] text-sm text-red-600 hover:bg-red-50 w-full text-left"
                        >
                          <Trash2 className="w-4 h-4" /> {t("security.terminate")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
