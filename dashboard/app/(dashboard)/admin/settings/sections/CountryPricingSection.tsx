"use client";

import { useState, useEffect } from "react";
import {
  Globe,
  Save,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

interface PlanPrice {
  monthly: number;
  yearly: number;
}

interface CountryEntry {
  country: string;
  currency: string;
  currencySymbol: string;
  enabled: boolean;
  plans: {
    basic: PlanPrice;
    growth: PlanPrice;
    pro: PlanPrice;
  };
}

interface CountryPricingDoc {
  version: number;
  countries: Record<string, CountryEntry>;
  updatedAt: string;
}

const EMPTY_PLAN: PlanPrice = { monthly: 0, yearly: 0 };

const EMPTY_COUNTRY: CountryEntry = {
  country: "",
  currency: "",
  currencySymbol: "",
  enabled: true,
  plans: {
    basic: { ...EMPTY_PLAN },
    growth: { ...EMPTY_PLAN },
    pro: { ...EMPTY_PLAN },
  },
};

const PLAN_TIERS = ["basic", "growth", "pro"] as const;

export function CountryPricingSection() {
  const [pricing, setPricing] = useState<CountryPricingDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bumping, setBumping] = useState(false);
  const [editingCountry, setEditingCountry] = useState<string | null>(null);
  const [editData, setEditData] = useState<CountryEntry | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCountry, setNewCountry] = useState({ code: "", ...EMPTY_COUNTRY });
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      const res = await fetch("/api/admin/country-pricing");
      if (res.ok) {
        const data = await res.json();
        setPricing(data);
      }
    } catch (err) {
      console.error("Failed to load country pricing:", err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleEdit = (code: string, entry: CountryEntry) => {
    setEditingCountry(code);
    setEditData({ ...entry, plans: { ...entry.plans } });
  };

  const handleSave = async () => {
    if (!editingCountry || !editData) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/country-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: editingCountry,
          updates: editData,
        }),
      });
      if (res.ok) {
        showToast("success", `${editingCountry} pricing updated`);
        setEditingCountry(null);
        setEditData(null);
        await loadPricing();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed to save");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCountry = async () => {
    if (!newCountry.code || !newCountry.currency) {
      showToast("error", "Country code and currency are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/country-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: newCountry.code,
          updates: {
            country: newCountry.country || newCountry.code,
            currency: newCountry.currency,
            currencySymbol: newCountry.currencySymbol,
            enabled: newCountry.enabled,
            plans: newCountry.plans,
          },
          isNew: true,
        }),
      });
      if (res.ok) {
        showToast("success", `${newCountry.code} added`);
        setShowAddModal(false);
        setNewCountry({ code: "", ...EMPTY_COUNTRY });
        await loadPricing();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed to add");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(`Delete pricing for ${code}?`)) return;
    try {
      const res = await fetch("/api/admin/country-pricing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: code }),
      });
      if (res.ok) {
        showToast("success", `${code} removed`);
        await loadPricing();
      }
    } catch {
      showToast("error", "Failed to delete");
    }
  };

  const handleToggle = async (code: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/admin/country-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: code,
          updates: { enabled },
        }),
      });
      if (res.ok) {
        await loadPricing();
      }
    } catch {
      showToast("error", "Failed to toggle");
    }
  };

  const handleBumpVersion = async () => {
    if (!confirm("Bump pricing version? Existing subscriptions keep their current pricing.")) return;
    setBumping(true);
    try {
      const res = await fetch("/api/admin/country-pricing/version", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        showToast("success", `Version bumped to ${data.version}`);
        await loadPricing();
      }
    } catch {
      showToast("error", "Failed to bump version");
    } finally {
      setBumping(false);
    }
  };

  const updatePlanPrice = (
    plan: (typeof PLAN_TIERS)[number],
    cycle: "monthly" | "yearly",
    value: string
  ) => {
    if (!editData) return;
    const num = parseInt(value) || 0;
    setEditData({
      ...editData,
      plans: {
        ...editData.plans,
        [plan]: { ...editData.plans[plan], [cycle]: num },
      },
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Country Pricing</h2>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-100 rounded-xl" />
          <div className="h-64 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-slate-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Country Pricing</h2>
            <p className="text-sm text-slate-500">
              Manage regional pricing for each country. Version: {pricing?.version || 1}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBumpVersion}
            disabled={bumping}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${bumping ? "animate-spin" : ""}`} />
            Bump Version
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Country
          </button>
        </div>
      </div>

      {/* Pricing Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Country</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Currency</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Basic (mo)</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Growth (mo)</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Pro (mo)</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Active</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pricing?.countries &&
                Object.entries(pricing.countries)
                  .sort(([, a], [, b]) => a.country.localeCompare(b.country))
                  .map(([code, entry]) => (
                    <tr
                      key={code}
                      className={`border-b border-slate-50 hover:bg-slate-50 ${!entry.enabled ? "opacity-50" : ""
                        }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{code}</span>
                          <span className="text-slate-500">{entry.country}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {entry.currencySymbol} {entry.currency}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {entry.plans.basic.monthly.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {entry.plans.growth.monthly.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {entry.plans.pro.monthly.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggle(code, !entry.enabled)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {entry.enabled ? (
                            <ToggleRight className="w-6 h-6 text-green-500" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-slate-300" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(code, entry)}
                            className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(code)}
                            className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingCountry && editData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">
                Edit {editingCountry} — {editData.country}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {editData.currencySymbol} {editData.currency}
              </p>
            </div>
            <div className="p-6 space-y-6">
              {PLAN_TIERS.map((tier) => (
                <div key={tier} className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-700 capitalize">{tier}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Monthly</label>
                      <input
                        type="number"
                        value={editData.plans[tier].monthly}
                        onChange={(e) => updatePlanPrice(tier, "monthly", e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Yearly</label>
                      <input
                        type="number"
                        value={editData.plans[tier].yearly}
                        onChange={(e) => updatePlanPrice(tier, "yearly", e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setEditingCountry(null);
                  setEditData(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Country Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Add Country</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Country Code (ISO 2)</label>
                  <input
                    type="text"
                    value={newCountry.code}
                    onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value.toUpperCase() })}
                    placeholder="GH"
                    maxLength={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Country Name</label>
                  <input
                    type="text"
                    value={newCountry.country}
                    onChange={(e) => setNewCountry({ ...newCountry, country: e.target.value })}
                    placeholder="Ghana"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Currency</label>
                  <input
                    type="text"
                    value={newCountry.currency}
                    onChange={(e) => setNewCountry({ ...newCountry, currency: e.target.value.toUpperCase() })}
                    placeholder="GHS"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Symbol</label>
                  <input
                    type="text"
                    value={newCountry.currencySymbol}
                    onChange={(e) => setNewCountry({ ...newCountry, currencySymbol: e.target.value })}
                    placeholder="GH₵"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {PLAN_TIERS.map((tier) => (
                <div key={tier} className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-700 capitalize">{tier}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Monthly</label>
                      <input
                        type="number"
                        value={newCountry.plans[tier].monthly}
                        onChange={(e) => {
                          const num = parseInt(e.target.value) || 0;
                          setNewCountry({
                            ...newCountry,
                            plans: {
                              ...newCountry.plans,
                              [tier]: { ...newCountry.plans[tier], monthly: num },
                            },
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Yearly</label>
                      <input
                        type="number"
                        value={newCountry.plans[tier].yearly}
                        onChange={(e) => {
                          const num = parseInt(e.target.value) || 0;
                          setNewCountry({
                            ...newCountry,
                            plans: {
                              ...newCountry.plans,
                              [tier]: { ...newCountry.plans[tier], yearly: num },
                            },
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewCountry({ code: "", ...EMPTY_COUNTRY });
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCountry}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Add Country
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-semibold ${toast.type === "success" ? "bg-green-600" : "bg-red-600"
              }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
