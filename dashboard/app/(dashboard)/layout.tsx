"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Topbar } from "@/components/Topbar";
import { TrialBanner } from "@/components/TrialBanner";
import { TrialWelcomeModal } from "@/components/TrialWelcomeModal";
import { FirstLoginWelcomeModal } from "@/components/FirstLoginWelcomeModal";
import { ProfileCompletionModal } from "@/components/ProfileCompletionModal";
import { PremiumWelcomeModal } from "@/components/PremiumWelcomeModal";
import { TrialExpiredUpgradeModal } from "@/components/TrialExpiredUpgradeModal";
import { UserPendingModalHost } from "@/components/UserPendingModalHost";
import { AnnouncementModalHost } from "@/components/AnnouncementModalHost";
import { ReferralCodePrompt } from "@/components/ReferralCodePrompt";
import { ActivationSurveyModal } from "@/components/ActivationSurveyModal";
import { useAuth } from "@/contexts/AuthContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { mongoUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isAdmin = pathname.startsWith("/admin");

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isAdmin ? "bg-slate-900" : "bg-slate-50"}`}>
        <Loader2 className={`w-6 h-6 animate-spin ${isAdmin ? "text-slate-500" : "text-slate-400"}`} />
      </div>
    );
  }

  if (!mongoUser) {
    const callbackUrl =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/dashboard";
    const safeCallbackUrl =
      callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/dashboard";
    router.replace(`/login?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`);
    return null;
  }

  return (
    <div className={`mce-dashboard-shell min-h-screen flex font-sans ${isAdmin ? "mce-admin-mode bg-slate-900 text-slate-50" : "mce-user-mode bg-slate-50 text-slate-900"}`}>
      {isAdmin ? (
        <AdminSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      ) : (
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      )}
      <div className={`flex-1 ${isAdmin ? "md:ml-[260px]" : "md:ml-[280px]"} flex flex-col min-w-0`}>
        <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
        {!isAdmin && <TrialBanner />}
        <main className="mce-dashboard-main flex-1 overflow-x-hidden overflow-y-auto w-full">
          {children}
        </main>
      </div>
      {!isAdmin && <TrialWelcomeModal />}
      {!isAdmin && <FirstLoginWelcomeModal />}
      {!isAdmin && <ProfileCompletionModal />}
      {!isAdmin && <PremiumWelcomeModal />}
      {!isAdmin && <TrialExpiredUpgradeModal />}
      {!isAdmin && <UserPendingModalHost />}
      {!isAdmin && <AnnouncementModalHost />}
      {!isAdmin && <ReferralCodePrompt />}
      {!isAdmin && <ActivationSurveyModal />}
    </div>
  );
}
