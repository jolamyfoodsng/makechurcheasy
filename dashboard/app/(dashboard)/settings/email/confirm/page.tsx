"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { confirmEmailChange } from "@/lib/api";
import { useTranslations } from "next-intl";

function ConfirmEmailContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [nextEmailChangeAt, setNextEmailChangeAt] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("settings.emailConfirm.noToken"));
      return;
    }

    confirmEmailChange(token)
      .then((result) => {
        setStatus("success");
        setMessage(result.message);
        setNextEmailChangeAt(result.nextEmailChangeAt);
      })
      .catch((err: any) => {
        setStatus("error");
        setMessage(err.message || t("settings.emailConfirm.failedVerify"));
      });
  }, [token]);

  const formattedDate = nextEmailChangeAt
    ? new Date(nextEmailChangeAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-h-[calc(100vh-80px)] flex flex-col justify-center items-center pb-16">
      <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 md:p-12 text-center relative overflow-hidden flex flex-col items-center">

        {status === "loading" && (
          <>
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-8">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">
              {t("settings.emailConfirm.verifying")}
            </h1>
            <p className="text-slate-600 text-sm max-w-md mx-auto">
              {t("settings.emailConfirm.verifyingDescription")}
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-8">
              <CheckCircle2 className="w-12 h-12 text-green-600 fill-green-100" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">
              {t("settings.emailConfirm.verified")}
            </h1>
            <p className="text-slate-600 text-sm max-w-md mx-auto mb-6">
              {t("settings.emailConfirm.verifiedDescription")}
            </p>
            {formattedDate && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-md mx-auto mb-8 text-sm text-slate-600">
                {t("settings.emailConfirm.nextChangeAvailable", { date: formattedDate })}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <Link
                href="/settings"
                className="w-full sm:w-auto px-5 py-2.5 h-11 bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-600/20 hover:bg-blue-800 transition-all"
              >
                {t("settings.emailConfirm.returnToSettings")}
              </Link>
              <Link
                href="/"
                className="w-full sm:w-auto px-5 py-2.5 h-11 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold shadow-sm hover:bg-slate-50 transition-all"
              >
                {t("settings.email.goToDashboard")}
              </Link>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-8">
              <XCircle className="w-12 h-12 text-red-500 fill-red-100" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">
              {t("settings.emailConfirm.failed")}
            </h1>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-w-md mx-auto mb-8 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 text-left">{message}</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <Link
                href="/settings/email"
                className="w-full sm:w-auto px-5 py-2.5 h-11 bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-600/20 hover:bg-blue-800 transition-all"
              >
                {t("settings.emailConfirm.requestNewLink")}
              </Link>
              <Link
                href="/settings"
                className="w-full sm:w-auto px-5 py-2.5 h-11 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold shadow-sm hover:bg-slate-50 transition-all"
              >
                {t("settings.emailConfirm.returnToSettings")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConfirmEmailFallback() {
  const t = useTranslations();
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-h-[calc(100vh-80px)] flex flex-col justify-center items-center pb-16">
      <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 md:p-12 text-center flex flex-col items-center">
        <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-8">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">
          {t("common.loading")}
        </h1>
      </div>
    </div>
  );
}

export default function ConfirmEmailChangePage() {
  return (
    <Suspense fallback={<ConfirmEmailFallback />}>
      <ConfirmEmailContent />
    </Suspense>
  );
}
