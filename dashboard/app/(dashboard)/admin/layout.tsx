"use client";

import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const { mongoUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-slate-400">{t("common.loading")}</p>
      </div>
    );
  }

  if (mongoUser?.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <Shield className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-50 mb-2">{t("admin.layout.accessDenied")}</h1>
        <p className="text-slate-400">
          {t("admin.layout.noPermission")}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
