/**
 * ProfileCompletionModal — Blocks app usage until required profile fields are filled.
 *
 * Extensible: add fields to `requiredProfileFields` to enforce more fields.
 */

import { useState, useEffect, useCallback } from "react";
import CountryPicker from "./CountryPicker";
import { getDeviceId } from "../services/authService";
import "./CountryPicker.css";
import "./ProfileCompletionModal.css";

const API_BASE = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";

/** List of required profile fields. Add more fields here in the future. */
const requiredProfileFields = ["country"];

interface ProfileCompletionModalProps {
  user: {
    id: string;
    country?: string;
  };
  onComplete: (updatedFields: Record<string, string>) => void;
}

export default function ProfileCompletionModal({ user, onComplete }: ProfileCompletionModalProps) {
  const [country, setCountry] = useState(user.country || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Prevent ESC key from closing the modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Prevent navigation away
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const canSave = country.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);

    try {
      const deviceId = getDeviceId();
      const res = await fetch(`${API_BASE}/api/user`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(deviceId ? { "X-Device-Id": deviceId } : {}),
        },
        body: JSON.stringify({ userId: user.id, country }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to save (${res.status})`);
      }

      onComplete({ country });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [canSave, saving, country, user.id, onComplete]);

  return (
    <div className="pcm-backdrop" onContextMenu={(e) => e.preventDefault()}>
      <div
        className={`pcm-modal ${visible ? "pcm-modal--visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pcm-header">
          <div className="pcm-icon">👤</div>
          <h2 className="pcm-title">Complete Your Profile</h2>
          <p className="pcm-description">
            We noticed your country information is missing. Please select your country to continue using MakeChurchEasy.
          </p>
        </div>

        {/* Form */}
        <div className="pcm-form">
          <label className="pcm-label">
            Country <span className="pcm-required">*</span>
          </label>
          <CountryPicker
            value={country}
            onChange={setCountry}
            placeholder="Select your country..."
          />
        </div>

        {/* Error */}
        {error && (
          <div className="pcm-error">{error}</div>
        )}

        {/* Save button */}
        <button
          className="pcm-save-btn"
          disabled={saving}
          type="button"
          onClick={handleSave}
          title="Save and continue"
        >
          {saving ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
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
