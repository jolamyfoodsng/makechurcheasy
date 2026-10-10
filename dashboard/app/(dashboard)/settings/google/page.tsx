"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { GoogleMark } from "@/components/GoogleMark";

const googleErrors: Record<string, string> = {
  google_cancelled: "Google connection was cancelled.",
  google_link_signin_required: "Sign in again before connecting Google.",
  google_link_session_expired: "Your sign-in expired. Please try connecting again.",
  google_account_in_use: "That Google account is already connected to another MakeChurchEazy account.",
  google_email_unverified: "Google could not confirm this email address.",
  google_not_configured: "Google sign-in is not configured right now.",
  google_auth_failed: "Google could not be connected. Please try again.",
};

export default function ManageGoogle() {
  const { mongoUser, isGoogleLinked, connectGoogleAccount, refreshMongoUser } = useAuth();
  const linked = isGoogleLinked();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("google_error");
    if (code) setError(googleErrors[code] || "Google could not be connected. Please try again.");
    if (params.get("google_connected") === "1") {
      setNotice("Google account connected. You can now use it to sign in.");
      void refreshMongoUser();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refreshMongoUser]);

  return <div className="p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6 pb-16">
    <div><Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back to Settings</Link><h1 className="text-2xl font-bold text-slate-900">Connect Google</h1><p className="mt-1 text-sm text-slate-500">Link your Google account to sign in to MakeChurchEazy with one click.</p></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white"><GoogleMark size={25} /></div><div><h2 className="text-lg font-bold text-slate-900">Google account</h2><p className="text-sm text-slate-500">{linked ? mongoUser?.googleAccount?.email || mongoUser?.email : "Not connected"}</p></div></div>
      {linked ? <div className="mt-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /><div><p className="text-sm font-semibold text-green-800">Google is connected</p><p className="mt-1 text-xs text-green-700">Use this Google account on the sign-in page. Your existing password sign-in remains available.</p></div></div> : <p className="mt-6 text-sm text-slate-600">You’ll choose a Google account and approve the connection. This won’t replace your password.</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
      <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={busy || linked} onClick={() => { setBusy(true); connectGoogleAccount("/settings/google"); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark size={18} />}{linked ? "Connected" : "Connect Google account"}</button><Link href="/settings" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Done</Link></div>
    </section>
  </div>;
}
