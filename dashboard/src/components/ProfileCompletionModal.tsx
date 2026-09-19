"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Globe2 } from "lucide-react";
import { countries } from "@/lib/countries";
import { updateUser } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/** List of required profile fields. Add more fields here in the future. */
const requiredProfileFields = ["country"];
const COUNTRY_REQUIRED_EVENT = "mce:country-required";
const pendingCountrySelectionResolvers = new Set<() => void>();

/**
 * Open the shared country modal from a flow that needs a saved country.
 * The promise resolves after the country has been persisted and the auth
 * context has been refreshed, so callers can safely retry their action.
 */
export function requestCountrySelection(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    pendingCountrySelectionResolvers.add(resolve);
    window.dispatchEvent(new Event(COUNTRY_REQUIRED_EVENT));
  });
}

function resolvePendingCountrySelections() {
  for (const resolve of pendingCountrySelectionResolvers) resolve();
  pendingCountrySelectionResolvers.clear();
}

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

  // Payment and other protected flows can request the same modal without
  // creating a second, competing dialog in the page.
  useEffect(() => {
    function handleCountryRequired() {
      hasOpenedRef.current = true;
      setError(null);
      setOpen(true);
    }

    window.addEventListener(COUNTRY_REQUIRED_EVENT, handleCountryRequired);
    return () => window.removeEventListener(COUNTRY_REQUIRED_EVENT, handleCountryRequired);
  }, []);

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
      resolvePendingCountrySelections();
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
      role="presentation"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="mx-4 w-full max-w-[420px] rounded-xl border border-slate-200 bg-white p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="country-selection-title"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Globe2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 id="country-selection-title" className="mb-2 text-lg font-bold text-slate-900">
            Choose your country
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Select your country so we can show the correct currency and start
            your payment securely. You only need to do this once.
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
            aria-label="Country"
            className="h-11 w-full appearance-none rounded-lg border border-slate-300 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
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
          className={`h-11 w-full rounded-lg text-sm font-semibold text-white transition-colors ${canSave && !saving
            ? "bg-blue-700 hover:bg-blue-800 active:bg-blue-900"
            : "cursor-not-allowed bg-slate-300"
            }`}
        >
          {saving ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
