"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Percent,
  Plus,
  Copy,
  Check,
  Tag,
  Users,
  Calendar,
  Sparkles,
  ExternalLink,
  Loader2,
  X,
  AlertCircle,
  Clock,
  ArrowRight,
  Mail,
} from "lucide-react";

interface DiscountItem {
  _id: string;
  offerCode: string;
  offerDiscountPercent: number;
  offerDurationMonths: number;
  offerMaxRedemptions?: number | null;
  offerRedemptionCount?: number;
  offerApplicablePlans?: string[];
  offerApplicableBillingCycles?: string[];
  audience?: string;
  targetEmails?: string[];
  status: "active" | "archived" | "draft";
  expiresAt?: string | null;
  createdAt: string;
  claimUrl: string;
}

interface RedemptionItem {
  _id: string;
  code: string;
  userId: string;
  plan: string;
  billingCycle: string;
  percentOff: number;
  durationMonths: number;
  discountAmount: number;
  finalAmount: number;
  paystackReference: string;
  createdAt: string;
}

export default function AdminDiscountsPage() {
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [stats, setStats] = useState({ totalDiscounts: 0, activeDiscounts: 0, totalRedemptions: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create Modal State
  const [showModal, setShowModal] = useState(false);
  const [preset, setPreset] = useState<string>("half_off_2m");
  const [code, setCode] = useState("SAVE50-2M");
  const [discountPercent, setDiscountPercent] = useState(50);
  const [durationMonths, setDurationMonths] = useState(2);
  const [plan, setPlan] = useState("growth");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [audience, setAudience] = useState("all_users");
  const [targetEmails, setTargetEmails] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdClaimUrl, setCreatedClaimUrl] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState(false);

  const fetchDiscounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/discounts", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDiscounts(data.discounts || []);
      setRedemptions(data.redemptions || []);
      setStats(data.stats || { totalDiscounts: 0, activeDiscounts: 0, totalRedemptions: 0 });
    } catch (err: any) {
      setError(err?.message || "Failed to load discounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePresetSelect = (selectedPreset: string) => {
    setPreset(selectedPreset);
    if (selectedPreset === "half_off_1m") {
      setCode("SAVE50-1M");
      setDiscountPercent(50);
      setDurationMonths(1);
      setBillingCycle("monthly");
    } else if (selectedPreset === "half_off_2m") {
      setCode("SAVE50-2M");
      setDiscountPercent(50);
      setDurationMonths(2);
      setBillingCycle("monthly");
    } else if (selectedPreset === "intro_90_off_15d") {
      setCode("INTRO90");
      setDiscountPercent(90);
      setDurationMonths(1);
      setBillingCycle("monthly");
      setExpiresInDays(15);
    } else if (selectedPreset === "annual_20_off") {
      setCode("ANNUAL20");
      setDiscountPercent(20);
      setDurationMonths(12);
      setBillingCycle("yearly");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCreateError("");
    setCreatedClaimUrl(null);

    try {
      const payload = {
        code,
        discountPercent: Number(discountPercent),
        durationMonths: Number(durationMonths),
        applicablePlans: [plan],
        applicableBillingCycles: [billingCycle],
        expiresInDays: Number(expiresInDays) || 14,
        audience,
        targetEmails: targetEmails ? targetEmails.split(",").map((e) => e.trim()).filter(Boolean) : [],
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        sendEmail,
      };

      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create discount");

      setCreatedClaimUrl(data.discount?.claimUrl || "");
      fetchDiscounts();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create discount");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Percent className="w-6 h-6 text-indigo-400" />
            Discounts & Promotions
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Create SaaS discount campaigns, Apple-style half-price promos, and generate direct claim links.
          </p>
        </div>

        <button
          onClick={() => {
            setShowModal(true);
            setCreatedClaimUrl(null);
            setCreateError("");
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          Create Discount
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-[#0B101E] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Campaigns</p>
              <p className="text-2xl font-bold text-white mt-0.5">{stats.totalDiscounts}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0B101E] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Discounts</p>
              <p className="text-2xl font-bold text-emerald-400 mt-0.5">{stats.activeDiscounts}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0B101E] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Redemptions</p>
              <p className="text-2xl font-bold text-purple-300 mt-0.5">{stats.totalRedemptions}</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Discounts Table */}
      <div className="rounded-2xl border border-slate-800 bg-[#0B101E] overflow-hidden">
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Promotional Campaigns</h2>
          <span className="text-xs text-slate-400">{discounts.length} campaign(s)</span>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : discounts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No discount campaigns created yet. Click "Create Discount" to launch your first offer!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800/80 bg-slate-900/40 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Code</th>
                  <th className="px-5 py-3.5">Offer</th>
                  <th className="px-5 py-3.5">Plans & Billing</th>
                  <th className="px-5 py-3.5">Audience</th>
                  <th className="px-5 py-3.5">Redemptions</th>
                  <th className="px-5 py-3.5">Expires</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {discounts.map((d) => {
                  const isExpired = d.expiresAt && new Date(d.expiresAt).getTime() < Date.now();
                  return (
                    <tr key={d._id} className="hover:bg-slate-800/30 transition">
                      <td className="px-5 py-4 font-mono font-bold text-sm text-indigo-300">
                        {d.offerCode}
                      </td>
                      <td className="px-5 py-4 font-medium text-white">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold">
                          {d.offerDiscountPercent}% off
                        </span>
                        <span className="ml-2 text-slate-400">
                          for {d.offerDurationMonths} mo
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-400 capitalize">
                        {(d.offerApplicablePlans || ["all"]).join(", ")} &middot; {(d.offerApplicableBillingCycles || ["monthly"]).join(", ")}
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        {d.targetEmails && d.targetEmails.length > 0
                          ? `${d.targetEmails.length} user(s)`
                          : d.audience?.replace("_", " ") || "All users"}
                      </td>
                      <td className="px-5 py-4 text-slate-300 font-semibold">
                        {d.offerRedemptionCount || 0}
                        {d.offerMaxRedemptions ? ` / ${d.offerMaxRedemptions}` : ""}
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        {d.expiresAt ? (
                          <span className={isExpired ? "text-red-400" : ""}>
                            {new Date(d.expiresAt).toLocaleDateString()}
                          </span>
                        ) : (
                          "Never"
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleCopyLink(d.claimUrl, d._id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium"
                          title="Copy direct claim link"
                        >
                          {copiedId === d._id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Redemptions Table */}
      {redemptions.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-[#0B101E] overflow-hidden">
          <div className="p-5 border-b border-slate-800/80">
            <h2 className="text-base font-semibold text-white">Recent Discount Redemptions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800/80 bg-slate-900/40 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Savings</th>
                  <th className="px-5 py-3">Final Paid</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {redemptions.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-800/30 transition">
                    <td className="px-5 py-3.5 font-mono font-bold text-indigo-300">{r.code}</td>
                    <td className="px-5 py-3.5 capitalize">{r.plan} ({r.billingCycle})</td>
                    <td className="px-5 py-3.5 text-emerald-400 font-semibold">{r.percentOff}% off (-{r.discountAmount})</td>
                    <td className="px-5 py-3.5 text-white font-bold">{r.finalAmount}</td>
                    <td className="px-5 py-3.5 text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 text-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">Create Discount Campaign</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdClaimUrl ? (
              <div className="py-6 space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  <p className="font-semibold text-base">Discount Campaign Created Successfully!</p>
                  <p className="text-xs mt-1 text-emerald-400/80">
                    Your code <strong>{code}</strong> is active and ready to be used.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Direct Claim Link
                  </label>
                  <div className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-700 rounded-xl">
                    <input
                      readOnly
                      value={createdClaimUrl}
                      className="bg-transparent text-xs text-indigo-300 font-mono flex-1 outline-none px-2"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyLink(createdClaimUrl, "created")}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    >
                      {copiedId === "created" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === "created" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium text-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4 pt-4 text-xs">
                {/* Popular SaaS Presets */}
                <div>
                  <label className="font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Select Popular Preset
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["half_off_2m", "50% Off for 2 Months", "Apple/SaaS standard save offer"],
                      ["half_off_1m", "50% Off for 1 Month", "Half price first month"],
                      ["intro_90_off_15d", "10% of Price for 15 Days", "90% off introductory price"],
                      ["annual_20_off", "20% Off Annual Plan", "Yearly billing incentive"],
                    ].map(([id, title, desc]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handlePresetSelect(id)}
                        className={`p-3 rounded-xl border text-left transition ${
                          preset === id
                            ? "border-indigo-500 bg-indigo-600/15 text-white ring-1 ring-indigo-500/50"
                            : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <p className="font-bold text-white text-xs">{title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Promo Code</label>
                    <input
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono uppercase font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Discount %</label>
                    <input
                      type="number"
                      min={1}
                      max={95}
                      required
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Duration (Months)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      required
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Expires in (Days)</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Applicable Plan</label>
                    <select
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                    >
                      <option value="growth">Growth Plan</option>
                      <option value="basic">Basic Plan</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Billing Cycle</label>
                    <select
                      value={billingCycle}
                      onChange={(e) => setBillingCycle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly (Annual)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Target Audience</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                  >
                    <option value="all_users">All Users</option>
                    <option value="free_users">Free Plan Users Only</option>
                    <option value="expired_trials">Expired Trial Users Only</option>
                    <option value="cancelled_users">Cancelled Subscribers Only</option>
                    <option value="inactive_7d">Inactive for 7+ Days</option>
                    <option value="inactive_30d">Inactive for 30+ Days</option>
                    <option value="never_opened_app">Never Opened Desktop App</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Target Email(s) (Optional, comma-separated)</label>
                  <input
                    value={targetEmails}
                    onChange={(e) => setTargetEmails(e.target.value)}
                    placeholder="pastor@church.org, media@church.org"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendEmail}
                      onChange={(e) => setSendEmail(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-medium text-white">
                        <Mail className="w-3.5 h-3.5 text-indigo-400" />
                        Send promotional email to targeted users
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        All users matching the selected audience will receive an email with the promo code and claim link.
                      </p>
                    </div>
                  </label>
                </div>

                {createError && (
                  <p className="text-red-400 text-xs">{createError}</p>
                )}

                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Create Campaign
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
