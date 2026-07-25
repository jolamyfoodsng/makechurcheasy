"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";

export function useUnsavedChanges(hasUnsaved: boolean) {
  const t = useTranslations();
  const [showModal, setShowModal] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Block browser reload / close
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // Intercept all <a> clicks when there are unsaved changes
  useEffect(() => {
    if (!hasUnsaved) return;

    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (anchor.target === "_blank") return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Ignore external links
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
      } catch { return; }

      // Ignore if same path
      try {
        const url = new URL(href, window.location.origin);
        if (url.pathname === window.location.pathname) return;
      } catch { return; }

      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
      setShowModal(true);
    };

    const handlePopState = () => {
      if (hasUnsaved) {
        setShowModal(true);
      }
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasUnsaved]);

  const confirmNavigation = useCallback(() => {
    setShowModal(false);
    if (pendingHref) {
      window.location.href = pendingHref;
      setPendingHref(null);
    }
  }, [pendingHref]);

  const cancelNavigation = useCallback(() => {
    setShowModal(false);
    setPendingHref(null);
    // Push the state back since popstate already removed it
    if (window.history.state) {
      window.history.pushState(window.history.state, "", window.location.href);
    }
  }, []);

  const Modal = useCallback(() => {
    if (!showModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/40" onClick={cancelNavigation} />
        <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 p-6 max-w-sm w-full mx-4 z-10">
          <button
            onClick={cancelNavigation}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900">{t("unsavedChanges.title")}</h3>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            {t("unsavedChanges.description")}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={cancelNavigation}
              className="px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors bg-white"
            >
              {t("unsavedChanges.stayOnPage")}
            </button>
            <button
              onClick={confirmNavigation}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              {t("unsavedChanges.leavePage")}
            </button>
          </div>
        </div>
      </div>
    );
  }, [showModal, cancelNavigation, confirmNavigation]);

  return { showModal, Modal, confirmNavigation, cancelNavigation };
}
