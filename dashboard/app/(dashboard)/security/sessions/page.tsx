"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  Info,
  Monitor,
  Laptop,
  Smartphone,
  AlertTriangle,
  Shield,
  History,
  Lock,
  LogOut,
  CheckCircle2,
  Power,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getSecuritySessions, deleteSecuritySession, type SecuritySession } from "@/lib/api";
import { useTranslations } from "next-intl";

interface MappedSession {
  id: string;
  name: string;
  os: string;
  location: string;
  active: string;
  type: "desktop" | "laptop" | "phone";
  current: boolean;
  sessionId: string;
}

function mapSession(s: SecuritySession, currentSessionId: string, t: ReturnType<typeof useTranslations>): MappedSession {
  const isCurrent = s.sessionId === currentSessionId;
  const platform = (s.devicePlatform || "").toLowerCase();
  let type: "desktop" | "laptop" | "phone" = "desktop";
  if (platform.includes("mobile") || platform.includes("iphone") || platform.includes("android")) type = "phone";
  else if (platform.includes("mac") || platform.includes("linux")) type = "laptop";

  const lastActive = s.lastActive ? timeAgo(new Date(s.lastActive), t) : t("common.unknown");

  return {
    id: s._id || s.sessionId,
    name: s.deviceName || t("security.unknownDevice"),
    os: [s.deviceOs, s.browser].filter(Boolean).join(" • ") || t("common.unknown"),
    location: s.location || s.ipAddress || t("common.unknown"),
    active: isCurrent ? t("security.onlineNow") : lastActive,
    type,
    current: isCurrent,
    sessionId: s.sessionId,
  };
}

function timeAgo(date: Date, t: ReturnType<typeof useTranslations>): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t("common.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("common.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("common.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  return t("common.daysAgo", { n: days });
}

export default function SessionManager() {
  const t = useTranslations();
  const { mongoUser } = useAuth();
  const userId = mongoUser?._id || "";
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [sessions, setSessions] = useState<MappedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminating, setTerminating] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

  const fetchSessions = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getSecuritySessions(userId);
      const currentSessionId = data.find((s) => s.isCurrent)?.sessionId || "";
      setSessions(data.map((s) => mapSession(s, currentSessionId, t)));
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const toggleSession = (id: string) => {
    const newSet = new Set(selectedSessions);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSessions(newSet);
  };

  const handleTerminateSelected = async () => {
    if (!userId || selectedSessions.size === 0) return;
    setTerminating(true);
    try {
      const toDelete = sessions.filter((s) => selectedSessions.has(s.id));
      await Promise.all(toDelete.map((s) => deleteSecuritySession(s.sessionId)));
      await fetchSessions();
      setSelectedSessions(new Set());
      setStep(4);
    } catch {
      // keep current state
    } finally {
      setTerminating(false);
    }
  };

  const IconForType = ({ type, className }: { type: string; className?: string }) => {
    switch (type) {
      case "desktop": return <Monitor className={className} />;
      case "laptop": return <Laptop className={className} />;
      case "phone": return <Smartphone className={className} />;
      default: return <Monitor className={className} />;
    }
  };

  if (step === 3) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full min-h-[calc(100vh-80px)] flex flex-col pt-16 md:pt-24 pb-16">
        <div className="max-w-4xl mx-auto w-full mb-10 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[600px] px-4">
            <div className="flex items-center gap-2 opacity-50">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">1</div>
              <span className="text-xs font-bold text-slate-800">{t("security.sessions.stepActiveSessions")}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className="flex items-center gap-2 opacity-50">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">2</div>
              <span className="text-xs font-bold text-slate-800">{t("security.sessions.stepSelectSessions")}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold ring-4 ring-blue-600/20">3</div>
              <span className="text-xs font-bold text-blue-600">{t("security.sessions.confirmSignOut")}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <div className="flex items-center gap-2 opacity-30">
              <div className="w-6 h-6 rounded-full bg-slate-400 text-white flex items-center justify-center text-[10px] font-bold">4</div>
              <span className="text-xs font-bold text-slate-800">{t("security.sessions.stepCompleted")}</span>
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto w-full bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm overflow-hidden z-10 transition-transform">
          <div className="p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
                <LogOut className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{t("security.sessions.stepConfirmSignOut")}</h2>
                <p className="text-sm font-medium text-slate-500">{t("common.stepOf", { current: 3, total: 4 })}</p>
              </div>
            </div>

            <div className="flex gap-4 items-start mb-6">
              <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-4">
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  {t("security.sessions.aboutToSignOut", { count: selectedSessions.size })}
                </p>
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl">
                  <p className="text-sm font-medium text-red-800 italic">
                    {t("security.sessions.willRemainSignedIn")}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  {t("security.sessions.terminateWarning")}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button
                onClick={handleTerminateSelected}
                disabled={terminating}
                className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl transition-all shadow-md shadow-red-600/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {terminating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Power className="w-5 h-5" />}
                {terminating ? t("common.signingOut") : t("common.signOut")}
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={terminating}
                className="flex-1 h-11 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl transition-all text-sm"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
          <div className="h-1 bg-red-600/10 w-full overflow-hidden">
            <div className="h-full bg-red-600 w-1/3 animate-[pulse_2s_infinite]"></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto w-full mt-12">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex gap-4">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">{t("security.sessions.securityProtocol")}</h4>
              <p className="text-xs text-slate-500 mt-1">{t("security.sessions.securityProtocolDesc")}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex gap-4">
            <History className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">{t("security.sessions.sessionHistory")}</h4>
              <p className="text-xs text-slate-500 mt-1">{t("security.sessions.sessionHistoryDesc")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto w-full min-h-[calc(100vh-80px)] flex flex-col justify-center items-center pb-16">
        <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col items-center p-12">
          <div className="flex items-center gap-2 mb-10 w-full justify-center">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">4</div>
            <span className="text-sm font-semibold text-blue-600">{t("security.sessions.completed")}</span>
          </div>

          <div className="mb-8 relative flex items-center justify-center">
            <div className="absolute w-24 h-24 bg-green-100 rounded-full animate-ping opacity-50"></div>
            <div className="relative w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 fill-green-100" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-3 text-center tracking-tight">{t("security.sessions.signedOutSuccessfully")}</h1>
          <p className="text-sm text-slate-500 text-center mb-10 max-w-xs leading-relaxed">
            {t("security.sessions.sessionsTerminated")}
          </p>

          <Link
            href="/security"
            className="w-full h-11 py-3.5 bg-blue-700 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-blue-800 transition-all shadow-sm"
          >
            {t("security.sessions.backToSecurity")}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full pb-16">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6 font-medium">
        <Link href="/settings" className="hover:text-slate-900 transition-colors">{t("security.sessions.account")}</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href="/security" className="hover:text-slate-900 transition-colors">{t("security.sessions.security")}</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-blue-600 font-bold">{t("security.sessions.activeSessions")}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <Monitor className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{t("security.sessions.manageActiveSessions")}</h1>
            <p className="text-slate-500 mt-1 text-sm md:text-base">{t("security.sessions.viewManageDevices")}</p>
          </div>
        </div>

        {step === 1 && (
          <div className="flex items-center gap-2 text-slate-600 bg-white shadow-sm px-4 py-2 rounded-full border border-slate-200 h-fit whitespace-nowrap text-sm font-medium">
            <Clock className="w-4 h-4 text-slate-400" />
            {t("security.sessions.estimatedTime")}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
          <p className="text-sm text-slate-500">{t("security.sessions.loadingSessions")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-blue-600 mb-5 flex items-center gap-2 text-sm">
                <Info className="w-5 h-5" /> {t("security.sessions.processGuide")}
              </h3>
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 font-bold", step === 1 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")}>1</div>
                  <p className={cn("text-sm", step === 1 ? "text-slate-900 font-bold" : "text-slate-500")}>{t("security.sessions.step1Desc")}</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 font-bold", step === 2 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")}>2</div>
                  <p className={cn("text-sm", step === 2 ? "text-slate-900 font-bold" : "text-slate-500")}>{t("security.sessions.step2Desc")}</p>
                </div>
                <div className="flex items-start gap-3 opacity-50">
                  <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs shrink-0 font-bold">3</div>
                  <p className="text-slate-500 text-sm">{t("security.sessions.step3Desc")}</p>
                </div>
              </div>
            </div>

            {step === 2 && (
              <div className="p-6 rounded-2xl bg-white shadow-sm border border-slate-200">
                <p className="flex items-center gap-2 text-slate-700 font-semibold text-sm mb-2">
                  <Clock className="w-4 h-4 text-blue-600" /> {t("security.sessions.estTime2to3")}
                </p>
                <p className="text-slate-500 text-xs leading-relaxed">{t("security.sessions.endingSessionsImmediate")}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 sm:p-6 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", step === 1 ? "hidden" : "bg-blue-600 text-white")}>
                    {step}
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 flex items-center gap-2">
                      {step === 1 && <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>}
                      {step === 1 ? t("security.sessions.activeSessions") : t("security.sessions.selectSessions")}
                    </h2>
                    {step === 2 && <p className="text-slate-500 text-xs mt-0.5">{t("security.sessions.chooseSessionsDesc")}</p>}
                  </div>
                </div>
                <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                  {step === 1 ? t("security.sessions.deviceCount", { count: sessions.length }) : t("security.sessions.stepOfSimple", { current: step, total: 3 })}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {sessions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">{t("security.sessions.noActiveSessions")}</div>
                ) : (
                  sessions.map((session) => {
                    const isSelected = selectedSessions.has(session.id);
                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "p-4 sm:p-6 flex items-center gap-4 transition-all group",
                          step === 2 && (session.current ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-slate-50"),
                          step === 2 && isSelected && "bg-blue-50 hover:bg-blue-50"
                        )}
                        onClick={() => {
                          if (step === 2 && !session.current) toggleSession(session.id);
                        }}
                      >
                        {step === 2 && (
                          <div className="relative shrink-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={session.current}
                              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer disabled:cursor-not-allowed"
                              onChange={() => { }}
                            />
                          </div>
                        )}

                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border",
                          step === 2 && isSelected ? "bg-white border-blue-200 text-blue-600" : "bg-slate-50 border-slate-100 text-slate-500",
                          step === 1 && session.current && "relative"
                        )}>
                          <IconForType type={session.type} className="w-6 h-6" />
                          {step === 1 && session.current && (
                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-slate-900 text-sm">{session.name}</h4>
                            {session.current && (
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                                {t("security.sessions.currentDevice")}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-500 truncate">
                            <span className="truncate">{session.location}</span>
                            <span className="w-1 h-1 bg-slate-300 rounded-full shrink-0"></span>
                            <span className="truncate">{session.os}</span>
                          </div>
                        </div>

                        {step === 1 && (
                          <div className="text-right shrink-0 hidden sm:block">
                            <p className={cn("text-xs sm:text-sm font-semibold", session.current ? "text-green-600" : "text-slate-500")}>
                              {session.active}
                            </p>
                          </div>
                        )}

                        {step === 2 && isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 ml-2" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 sm:p-6 bg-slate-50/50 border-t border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center">
                {step === 1 ? (
                  <>
                    <button
                      onClick={() => setStep(2)}
                      className="w-full sm:w-auto h-11 px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors shadow-sm text-sm"
                    >
                      {t("security.sessions.selectSessionsToSignOut")}
                    </button>
                    <button
                      onClick={async () => {
                        const others = sessions.filter((s) => !s.current).map((s) => s.id);
                        setSelectedSessions(new Set(others));
                        setStep(3);
                      }}
                      className="w-full sm:w-auto h-11 px-6 py-2.5 rounded-xl bg-blue-700 text-white font-semibold hover:bg-blue-800 transition-colors shadow-sm flex items-center justify-center gap-2 text-sm"
                    >
                      <LogOut className="w-4 h-4" /> {t("security.sessions.signOutAllOther")}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
                      <button
                        onClick={() => { setStep(1); setSelectedSessions(new Set()); }}
                        className="w-full sm:w-auto h-11 px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        onClick={() => { if (selectedSessions.size > 0) setStep(3); }}
                        className={cn(
                          "w-full sm:w-auto h-11 px-6 py-2.5 rounded-xl text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2",
                          selectedSessions.size > 0 ? "bg-red-600 hover:bg-red-700 cursor-pointer" : "bg-red-300 cursor-not-allowed"
                        )}
                        disabled={selectedSessions.size === 0}
                      >
                        {t("security.sessions.signOutSelected", { count: selectedSessions.size })}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {step === 1 && (
              <div className="mt-6 flex flex-col sm:flex-row items-start gap-4 p-6 rounded-2xl bg-red-50 border border-red-100 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-red-100 shadow-sm">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h5 className="font-bold text-red-900 text-sm">{t("security.sessions.unrecognizedDevice")}</h5>
                  <p className="text-sm text-red-800/80 mt-1 mb-3">{t("security.sessions.unrecognizedDeviceDesc")}</p>
                  <Link href="/security/password" className="text-sm text-red-700 font-bold hover:underline">{t("security.sessions.changePasswordNow")}</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 1 && !loading && (
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/security/password" className="p-6 bg-white border border-slate-200 rounded-2xl hover:border-blue-200 transition-colors group">
            <Lock className="w-6 h-6 text-blue-600 mb-4" />
            <h4 className="font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{t("security.sessions.changePassword")}</h4>
            <p className="text-xs text-slate-500 leading-relaxed">{t("security.sessions.changePasswordDesc")}</p>
          </Link>
          <div className="p-6 bg-white border border-slate-200 rounded-2xl hover:border-blue-200 transition-colors group">
            <Shield className="w-6 h-6 text-indigo-600 mb-4" />
            <h4 className="font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">{t("security.sessions.twoFactorAuth")}</h4>
            <p className="text-xs text-slate-500 leading-relaxed">{t("security.sessions.twoFactorAuthDesc")}</p>
          </div>
          <div className="p-6 bg-white border border-slate-200 rounded-2xl hover:border-blue-200 transition-colors group">
            <History className="w-6 h-6 text-purple-600 mb-4" />
            <h4 className="font-bold text-slate-900 mb-2 group-hover:text-purple-600 transition-colors">{t("security.sessions.activityLog")}</h4>
            <p className="text-xs text-slate-500 leading-relaxed">{t("security.sessions.activityLogDesc")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
