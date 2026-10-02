"use client";

import { Check, Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function AdminPwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    setIsInstalled(standalone);
    setIsIos(/iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin" }).catch((error) => {
        console.error("[admin] Failed to register offline app shell:", error);
      });
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setShowHelp(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setShowHelp((visible) => !visible);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  };

  if (isInstalled) {
    return (
      <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-300">
        <Check className="h-4 w-4" aria-hidden="true" />
        App installed
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={install}
        aria-expanded={showHelp}
        aria-controls="admin-install-help"
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-400/40 bg-blue-500/15 px-4 text-sm font-semibold text-blue-100 transition-colors hover:border-blue-300/60 hover:bg-blue-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Install dashboard
      </button>
      {showHelp && (
        <div
          id="admin-install-help"
          role="status"
          className="absolute right-0 top-full z-30 mt-3 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-950 p-4 text-left shadow-2xl"
        >
          <div className="flex items-start gap-3 pr-6">
            <Share className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
            <p className="text-sm leading-6 text-slate-300">
              {isIos
                ? "In Safari, tap Share, then choose Add to Home Screen."
                : "Open your browser menu and choose Install app or Add to Home screen."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close install instructions"
            onClick={() => setShowHelp(false)}
            className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
