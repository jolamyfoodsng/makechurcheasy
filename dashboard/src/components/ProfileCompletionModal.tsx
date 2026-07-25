"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { countries } from "@/lib/countries";
import { updateUser } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/** List of required profile fields. Add more fields here in the future. */
const requiredProfileFields = ["country"];

/**
 * Check if the user profile has missing required fields.
 */
export function hasMissingProfileFields(user: { country?: string } | null): boolean {
  if (!user) return false;
  return requiredProfileFields.some((field) => {
    const value = user[field as keyof typeof user];
    return value === null || value === undefined || value === "";
  });
}

export function ProfileCompletionModal() {
  const { mongoUser, refreshMongoUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOpenedRef = useRef(false);

  // Check on mount and when user changes — but only open once per session
  useEffect(() => {
    if (hasOpenedRef.current) return;
    if (mongoUser && hasMissingProfileFields(mongoUser)) {
      hasOpenedRef.current = true;
      setOpen(true);
    }
  }, [mongoUser]);

  // Prevent ESC and click outside
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  const canSave = country.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!canSave || saving || !mongoUser?._id) return;
    setSaving(true);
    setError(null);

    try {
      await updateUser(mongoUser._id, { country });
      await refreshMongoUser();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [canSave, saving, country, mongoUser?._id, refreshMongoUser]);

  if (!open || !mongoUser) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="w-full max-w-[420px] mx-4 bg-white rounded-xl shadow-2xl p-7 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">👤</div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Complete Your Profile
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            We noticed your country information is missing. Please select your
            country to continue using MakeChurchEasy.
          </p>
        </div>

        {/* Country selector */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Country <span className="text-red-500">*</span>
          </label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
          >
            <option value="" disabled>Select your country...</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${canSave && !saving
            ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
            : "bg-slate-300 cursor-not-allowed"
            }`}
        >
          {saving ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
