"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, Check } from "lucide-react";
import { usePathname } from "next/navigation";
import { LOCALES, normalizeLanguageValue, type Locale } from "@/i18n/routing";
import { updateUser } from "@/lib/api";
import { getUserId } from "@/lib/userId";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value};expires=${expires};path=/;SameSite=Lax`;
}

export function LanguageSwitcher() {
  const { mongoUser, refreshMongoUser } = useAuth();
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentCode = normalizeLanguageValue(mongoUser?.language || "en", mongoUser?.country);
  const currentLocale: Locale =
    LOCALES.find((l) => l.code === currentCode) || LOCALES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    async (locale: Locale) => {
      if (locale.code === currentCode) {
        setIsOpen(false);
        return;
      }

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

      setIsOpen(false);
      window.location.reload();
    },
    [currentCode, refreshMongoUser],
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors",
          isAdmin
            ? isOpen
              ? "bg-gray-800 text-slate-100"
              : "text-slate-400 hover:bg-gray-800 hover:text-slate-300"
            : isOpen
              ? "bg-slate-100 text-slate-900"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
        )}
        title="Change language"
      >
        <Globe className="w-4 h-4" />
        <span className="hidden md:inline text-xs">{currentLocale.nativeName}</span>
      </button>

      {isOpen && (
        <div className={`absolute right-0 top-full mt-2 w-52 rounded-xl shadow-lg overflow-hidden z-50 border ${isAdmin ? "bg-gray-900 border-slate-700" : "bg-white border-slate-200"}`}>
          <div className="p-1.5">
            {LOCALES.map((locale) => (
              <button
                key={locale.code}
                onClick={() => handleSelect(locale)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                  locale.code === currentCode
                    ? isAdmin
                      ? "bg-indigo-500/15 text-indigo-400 font-semibold"
                      : "bg-blue-50 text-blue-700 font-semibold"
                    : isAdmin
                      ? "text-slate-300 hover:bg-gray-800"
                      : "text-slate-700 hover:bg-slate-50",
                )}
              >
                <span className="text-base leading-none">{locale.flag}</span>
                <span className="flex-1 text-left">{locale.nativeName}</span>
                {locale.code === currentCode && (
                  <Check className={cn("w-3.5 h-3.5 shrink-0", isAdmin ? "text-indigo-400" : "text-blue-600")} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
