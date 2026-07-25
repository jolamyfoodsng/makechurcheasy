"use client";

import { useState, useEffect } from "react";
import { LOCALES, Locale, resolveLocalePreference } from "@/i18n/routing";
import { Globe, X } from "lucide-react";

interface LanguageSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LanguageSelector({ isOpen, onClose }: LanguageSelectorProps) {
  const [selectedLocale, setSelectedLocale] = useState<string>(() => {
    if (typeof document === "undefined") return LOCALES[0].code;
    const cookieMatch = document.cookie.match(/NEXT_LOCALE=([^;]+)/)?.[1];
    return resolveLocalePreference(cookieMatch || undefined, undefined, navigator.language);
  });

  useEffect(() => {
    // Check if user has already selected a language
    const hasSelectedLanguage = localStorage.getItem("language_selected");
    if (hasSelectedLanguage) {
      onClose();
    }
  }, [onClose]);

  const handleSelectLanguage = (locale: Locale) => {
    setSelectedLocale(locale.code);
  };

  const handleConfirm = () => {
    // Store the selected language
    localStorage.setItem("language_selected", "true");
    
    // Set the locale cookie
    document.cookie = `NEXT_LOCALE=${selectedLocale}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
    
    // Reload the page to apply the language
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F172A]/80 backdrop-blur-md">
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-[#E2E8F0] transform scale-95 md:scale-100 transition-all relative">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Select Your Language</h2>
              <p className="text-sm text-white/80">Choose your preferred language</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 hover:bg-white/20 rounded-lg transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Language Grid */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-3">
            {LOCALES.map((locale) => (
              <button
                key={locale.code}
                onClick={() => handleSelectLanguage(locale)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  selectedLocale === locale.code
                    ? "border-[#1D4ED8] bg-[#1D4ED8]/5"
                    : "border-[#E2E8F0] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{locale.flag}</span>
                  <div>
                    <div className="font-semibold text-[#0F172A]">{locale.nativeName}</div>
                    <div className="text-xs text-[#64748B]">{locale.name}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Confirm Button */}
          <button
            onClick={handleConfirm}
            className="w-full mt-6 bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-white px-6 py-3.5 rounded-xl text-sm font-semibold hover:shadow-lg transition-all transform hover:-translate-y-0.5"
          >
            Continue with {LOCALES.find(l => l.code === selectedLocale)?.nativeName}
          </button>
        </div>
      </div>
    </div>
  );
}
