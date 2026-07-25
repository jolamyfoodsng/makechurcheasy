"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, Zap } from "lucide-react";

interface CreditPack {
  id: "top_up_500" | "service_1200" | "month_3000";
  name: string;
  description: string;
  credits: number;
  prices: {
    USD: number;
    NGN: number;
  };
  badge?: string;
}

const ASSEMBLYAI_PRO_REALTIME_USD_PER_HOUR = 0.45;
const SPEECH_TO_SCRIPTURE_CREDITS_PER_MINUTE = 1;

function formatCurrency(amount: number, currency: "USD" | "NGN") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(amount);
}

function Field({
  label,
  value,
  type = "text",
  min,
  onChange,
}: {
  label: string;
  value: string | number;
  type?: "text" | "number";
  min?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-400">{label}</span>
      <input
        type={type}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm font-medium text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
      />
    </label>
  );
}

export default function AdminCreditsPage() {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/credit-packs")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Could not load credit packs")))
      .then((data) => setPacks(Array.isArray(data.packs) ? data.packs : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load credit packs"))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    const credits = packs.reduce((sum, pack) => sum + pack.credits, 0);
    const lowestUsdPerCredit = packs.length
      ? Math.min(...packs.map((pack) => pack.prices.USD / pack.credits))
      : 0;
    return { credits, lowestUsdPerCredit };
  }, [packs]);

  const updatePack = (id: CreditPack["id"], patch: Partial<CreditPack>) => {
    setPacks((current) => current.map((pack) => (
      pack.id === id ? { ...pack, ...patch } : pack
    )));
    setSaved(false);
  };

  const updatePackPrice = (id: CreditPack["id"], currency: "USD" | "NGN", value: number) => {
    setPacks((current) => current.map((pack) => (
      pack.id === id
        ? { ...pack, prices: { ...pack.prices, [currency]: value } }
        : pack
    )));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/credit-packs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save credit packs");
      setPacks(data.packs);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save credit packs");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Credit packs</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
            Manage the packs users buy from the dashboard credits page. These are paid purchases, not admin grants.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save pricing
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
          Credit pack pricing saved.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Current packs</p>
          <p className="mt-2 text-3xl font-black text-slate-50 tabular-nums">{packs.length}</p>
          <p className="mt-1 text-sm text-slate-400">Editable purchase options</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Total credits listed</p>
          <p className="mt-2 text-3xl font-black text-slate-50 tabular-nums">{totals.credits.toLocaleString()}</p>
          <p className="mt-1 text-sm text-slate-400">Across all purchasable packs</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Cost floor</p>
          <p className="mt-2 text-3xl font-black text-slate-50 tabular-nums">
            {formatCurrency(ASSEMBLYAI_PRO_REALTIME_USD_PER_HOUR, "USD")}/hr
          </p>
          <p className="mt-1 text-sm text-slate-400">AssemblyAI realtime pro reference</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {packs.map((pack) => {
          const estimatedVendorCost = (pack.credits / 60) * ASSEMBLYAI_PRO_REALTIME_USD_PER_HOUR / SPEECH_TO_SCRIPTURE_CREDITS_PER_MINUTE;
          const grossMargin = pack.prices.USD > 0
            ? Math.round(((pack.prices.USD - estimatedVendorCost) / pack.prices.USD) * 100)
            : 0;
          return (
            <div key={pack.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-50">{pack.name}</p>
                    <p className="text-xs text-slate-500">{pack.id}</p>
                  </div>
                </div>
                {pack.badge && (
                  <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200">
                    {pack.badge}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <Field
                  label="Pack name"
                  value={pack.name}
                  onChange={(value) => updatePack(pack.id, { name: value })}
                />
                <Field
                  label="Description"
                  value={pack.description}
                  onChange={(value) => updatePack(pack.id, { description: value })}
                />
                <div className="grid grid-cols-3 gap-3">
                  <Field
                    label="Credits"
                    type="number"
                    min={1}
                    value={pack.credits}
                    onChange={(value) => updatePack(pack.id, { credits: Number(value) })}
                  />
                  <Field
                    label="USD"
                    type="number"
                    min={1}
                    value={pack.prices.USD}
                    onChange={(value) => updatePackPrice(pack.id, "USD", Number(value))}
                  />
                  <Field
                    label="NGN"
                    type="number"
                    min={100}
                    value={pack.prices.NGN}
                    onChange={(value) => updatePackPrice(pack.id, "NGN", Number(value))}
                  />
                </div>
                <Field
                  label="Badge"
                  value={pack.badge || ""}
                  onChange={(value) => updatePack(pack.id, { badge: value || undefined })}
                />
              </div>

              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Estimated high-cost vendor spend</span>
                  <span className="font-bold text-slate-100">{formatCurrency(estimatedVendorCost, "USD")}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-400">Estimated gross margin</span>
                  <span className={grossMargin >= 50 ? "font-bold text-emerald-300" : "font-bold text-amber-300"}>
                    {grossMargin}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
