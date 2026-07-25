"use client";

import { X, LayoutDashboard, CreditCard, Zap, Download, Monitor, Landmark, BookOpen, Users, HelpCircle, ShieldCheck, Receipt, Settings, Headset, Timer, Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "../lib/utils";
import { useSubscription } from "../lib/useSubscription";
import { AppLogo } from "./AppLogo";

export function Sidebar({ isOpen, setIsOpen }: { isOpen?: boolean, setIsOpen?: (v: boolean) => void }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { plan, planLabel, isFreePlan, isOnTrial, trialDaysLeft, trialDurationDays, user, mongoUser } = useSubscription();

  const trialDayLabel = trialDaysLeft === 1 ? t("common.dayRemaining") : `${trialDaysLeft} days`;
  const trialDuration = trialDurationDays || 14;
  const trialProgressPct = isOnTrial ? Math.min(100, Math.round(((trialDuration - trialDaysLeft) / trialDuration) * 100)) : 0;

  const mainNavItems = [
    { path: "/dashboard", label: t("navigation.dashboard"), icon: LayoutDashboard },
    { path: "/notifications", label: t("common.notifications"), icon: Bell },
    { path: "/subscription", label: t("navigation.subscription"), icon: CreditCard },
    { path: "/credits", label: t("navigation.credits"), icon: Zap },
    { path: "/downloads", label: t("navigation.downloads"), icon: Download },
    { path: "/devices", label: t("navigation.devices"), icon: Monitor },
    { path: "/church-profile", label: t("navigation.churchProfile"), icon: Landmark },
    { path: "/tutorials", label: t("navigation.tutorials"), icon: BookOpen },
    { path: "/community", label: t("navigation.community"), icon: Users },
    { path: "/support", label: t("navigation.support"), icon: HelpCircle },
    { path: "/security", label: t("navigation.security"), icon: ShieldCheck },
    { path: "/billing", label: t("navigation.billing"), icon: Receipt },
    { path: "/settings", label: t("navigation.settings"), icon: Settings },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen?.(false)}
        />
      )}

      <aside className={cn(
        "fixed left-0 top-0 h-full w-[280px] bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-300 md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between gap-3 px-5 h-[72px] shrink-0 border-b border-slate-100">
          <Link href="/" className="flex items-center gap-3">
            <AppLogo className="w-8 h-8 object-contain" mode="dark" />
            <span className="text-sm font-bold text-slate-900">{t("common.appName")}</span>
          </Link>
          <button className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors" onClick={() => setIsOpen?.(false)}>
            <X className="w-[20px] h-[20px]" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === "/"
              ? pathname === "/"
              : pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setIsOpen?.(false)}
                className={cn(
                  "flex items-center gap-3 px-3 h-[44px] rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className="w-[20px] h-[20px] shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-3 mt-auto border-t border-slate-100 flex flex-col gap-3">
          {/* Plan CTA */}
          {isOnTrial ? (
            <Link href="/subscription/plans" className="block border border-amber-200 bg-amber-50 rounded-xl p-4 hover:bg-amber-100/60 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">{t("trial.daysRemaining", { days: trialDaysLeft })}</span>
              </div>
              <div className="w-full bg-amber-200/50 rounded-full h-1.5 mb-3">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${trialProgressPct}%` }} />
              </div>
              <span className="w-full bg-amber-600 text-white font-semibold py-2 rounded-xl text-xs hover:bg-amber-700 transition-colors flex items-center justify-center">
                {t("trial.upgradeNow")}
              </span>
            </Link>
          ) : isFreePlan ? (
            <Link href="/subscription/plans" className="block border border-blue-200 bg-blue-50 rounded-xl p-4 hover:bg-blue-100/60 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700">{t("subscription.plans.freePlan")}</span>
              </div>
              <p className="text-xs text-blue-600/70 mb-3 leading-relaxed">
                Unlock more credits, devices, and AI features.
              </p>
              <span className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl text-xs hover:bg-blue-700 transition-colors flex items-center justify-center">
                {t("subscription.plans.managePlan")}
              </span>
            </Link>
          ) : (
            <div className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t("common.currentPlan")}</span>
              </div>
              <p className="text-sm font-bold text-slate-900">{planLabel} Plan</p>
              {mongoUser?.credits != null && (
                <p className="text-xs text-slate-500 mt-0.5">{mongoUser.credits.toLocaleString()} credits remaining</p>
              )}
              <Link href="/subscription/plans" className="mt-2 block text-center text-xs font-semibold text-blue-600 hover:underline">
                Manage Plan →
              </Link>
            </div>
          )}

          {/* Help link */}
          <Link
            href="/support"
            className="flex items-center gap-3 text-slate-700 hover:bg-slate-50 rounded-xl px-3 h-[44px] transition-colors text-sm font-medium"
          >
            <Headset className="w-[20px] h-[20px] shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-xs">Need help?</span>
              <span className="text-[11px] text-slate-400">{t("common.contactSupport")}</span>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}
