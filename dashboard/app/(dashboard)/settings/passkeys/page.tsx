"use client";

import { useCallback, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { ArrowLeft, Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

type Passkey = { id: string; name: string; createdAt?: string; deviceType?: string; backedUp?: boolean };

export default function PasskeysSettings() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/auth/passkeys", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load passkeys.");
    setPasskeys(data.passkeys || []);
  }, []);
  useEffect(() => { refresh().catch((err) => setError(err.message)); }, [refresh]);

  async function addPasskey() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const optionsResponse = await fetch("/api/auth/passkeys/register-options", { method: "POST", credentials: "include" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || "Could not start passkey setup.");
      const credential = await startRegistration({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkeys/register-verify", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(result.error || "Could not save this passkey.");
      await refresh(); setNotice("Passkey added. You can now use it to sign in.");
    } catch (err: any) { setError(err.message || "Passkey setup was cancelled."); }
    finally { setBusy(false); }
  }

  async function removePasskey(id: string) {
    setError(""); setNotice(""); setBusy(true);
    try {
      const response = await fetch("/api/auth/passkeys", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove passkey.");
      await refresh(); setNotice("Passkey removed.");
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="p-4 md:p-8 max-w-3xl mx-auto w-full space-y-6 pb-16">
    <div><Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back to Settings</Link><h1 className="text-2xl font-bold text-slate-900">Passkeys</h1><p className="mt-1 text-sm text-slate-500">Use Face ID, Touch ID, Windows Hello, or a password manager to sign in securely.</p></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center"><Fingerprint className="w-5 h-5" /></div><div><h2 className="font-bold text-slate-900">Your passkeys</h2><p className="text-sm text-slate-500">Passkeys stay protected by your device or password manager.</p></div></div><button onClick={addPasskey} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add a passkey</button></div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
      {passkeys.length ? <ul className="divide-y divide-slate-100">{passkeys.map((passkey) => <li key={passkey.id} className="flex items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-slate-900">{passkey.name}</p><p className="text-xs text-slate-500">Added {passkey.createdAt ? new Date(passkey.createdAt).toLocaleDateString() : "recently"}{passkey.backedUp ? " · Synced passkey" : ""}</p></div><button aria-label={`Remove ${passkey.name}`} onClick={() => removePasskey(passkey.id)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="w-4 h-4" /> Remove</button></li>)}</ul> : <div className="py-10 text-center"><Fingerprint className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No passkeys yet</p><p className="mt-1 text-sm text-slate-500">Add one to sign in without typing your password.</p></div>}
    </section>
    <p className="text-xs text-slate-500">You can still sign in with your other enabled methods. Removing a passkey does not delete your account.</p>
  </div>;
}
