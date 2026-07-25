"use client";

import {
  LayoutDashboard,
  Users,
  Landmark,
  CreditCard,
  Zap,
  BarChart3,
  Monitor,
  Crown,
  Headset,
  FileText,
  Settings,
  Mail,
  Megaphone,
  X,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "../../lib/utils";
import { AppLogo } from "../AppLogo";

const adminNavItems = [
  { path: "/admin", labelKey: "admin.sidebar.dashboard", icon: LayoutDashboard, exact: true },
  { path: "/admin/users", labelKey: "admin.sidebar.users", icon: Users },
  { path: "/admin/churches", labelKey: "admin.sidebar.churches", icon: Landmark },
  { path: "/admin/subscriptions", labelKey: "admin.sidebar.subscriptions", icon: CreditCard },
  { path: "/admin/communications", label: "Communications", icon: Mail },
  { path: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { path: "/admin/credits", labelKey: "admin.sidebar.credits", icon: Zap },
  { path: "/admin/analytics", labelKey: "admin.sidebar.analytics", icon: BarChart3 },
  { path: "/admin/devices", labelKey: "admin.sidebar.devices", icon: Monitor },
  { path: "/admin/ambassadors", labelKey: "admin.sidebar.ambassadors", icon: Crown },
  { path: "/admin/support", labelKey: "admin.sidebar.support", icon: Headset },
  { path: "/admin/audit-logs", labelKey: "admin.sidebar.auditLogs", icon: FileText },
  { path: "/admin/settings", labelKey: "admin.sidebar.settings", icon: Settings },
];

export function AdminSidebar({ isOpen, setIsOpen }: { isOpen?: boolean; setIsOpen?: (v: boolean) => void }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen?.(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-[260px] bg-gray-900 flex flex-col z-50 transition-transform duration-300 md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between gap-3 px-5 h-[72px] shrink-0 border-b border-slate-700">
          <Link href="/admin" className="flex items-center gap-3">
            <AppLogo className="w-8 h-8 object-contain" mode="dark" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-slate-50">{t("common.appName")}</span>
              <span className="text-[11px] font-medium text-violet-400">{t("admin.sidebar.adminPanel")}</span>
            </div>
          </Link>
          <button
            className="md:hidden p-1.5 text-slate-400 hover:text-slate-50 rounded-lg hover:bg-gray-800 transition-colors"
            onClick={() => setIsOpen?.(false)}
          >
            <X className="w-[20px] h-[20px]" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.path
              : pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setIsOpen?.(false)}
                className={cn(
                  "flex items-center gap-3 px-3 h-[44px] rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-violet-500/15 text-violet-400"
                    : "text-slate-400 hover:bg-gray-800 hover:text-slate-50"
                )}
              >
                <Icon className="w-[20px] h-[20px] shrink-0" />
                <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-3 mt-auto border-t border-slate-700">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 h-[44px] rounded-xl text-sm font-medium text-slate-400 hover:bg-gray-800 hover:text-slate-50 transition-all"
          >
            <Shield className="w-[20px] h-[20px] shrink-0" />
            <span>{t("admin.sidebar.backToApp")}</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
