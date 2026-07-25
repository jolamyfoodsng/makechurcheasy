"use client";

import { useState, useEffect } from "react";
import { Globe, Check } from "lucide-react";
import { LOCALES, type Locale } from "@/i18n/routing";
import { updateUser } from "@/lib/api";
import { getUserId } from "@/lib/userId";
import { useAuth } from "@/contexts/AuthContext";

const LANGUAGE_ONBOARDING_KEY = "mce_language_onboarding_shown";

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value};expires=${expires};path=/;SameSite=Lax`;
}

export function LanguageOnboardingModal() {
  const { mongoUser, refreshMongoUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mongoUser) return;
    // Already picked a language before
    if (mongoUser.language) return;
    // Already dismissed this modal
    if (localStorage.getItem(LANGUAGE_ONBOARDING_KEY) === "true") return;
    const timer = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(timer);
  }, [mongoUser]);

  async function handleSelect(locale: Locale) {
    setSelected(locale.code);
    setSaving(true);

    setCookie("NEXT_LOCALE", locale.code);

    const userId = getUserId();
    if (userId) {
      try {
        await updateUser(userId, { language: locale.code });
        await refreshMongoUser();
      } catch {
        // Profile save failed, cookie is still set for this session
      }
    }

    localStorage.setItem(LANGUAGE_ONBOARDING_KEY, "true");
    setOpen(false);
    window.location.reload();
  }

  function handleSkip() {
    localStorage.setItem(LANGUAGE_ONBOARDING_KEY, "true");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200"
      onClick={handleSkip}
    >
      <div
        className="w-full max-w-[480px] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 pt-8 pb-6 text-center">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Globe className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Choose Your Language</h2>
          <p className="text-sm text-blue-100 mt-1">
            Which language would you like to use?
          </p>
        </div>

        {/* Language grid */}
        <div className="px-6 py-5">
          <div className="grid grid-cols-2 gap-2 mb-5">
            {LOCALES.map((locale) => (
              <button
                key={locale.code}
                onClick={() => handleSelect(locale)}
                disabled={saving}
                className={`relative flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${selected === locale.code
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                  } disabled:opacity-50`}
              >
                <span className="text-2xl">{locale.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {locale.nativeName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {locale.name}
                  </p>
                </div>
                {selected === locale.code && (
                  <Check className="w-4 h-4 text-blue-600 shrink-0" />
                )}
              </button>
            ))}
          </div>

          <button
            onClick={handleSkip}
            disabled={saving}
            className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors py-1"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
