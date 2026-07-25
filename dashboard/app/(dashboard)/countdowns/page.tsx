"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Send,
  Save,
  Trash2,
  Clock,
  PanelLeftClose,
  PanelRightClose,
} from "lucide-react";
import { useCountdownStore } from "@/lib/countdowns/store";
import type { Countdown, CountdownTemplate } from "@/lib/countdowns/types";
import { generateOBSOverlayHTML } from "@/lib/countdowns/obs";
import CountdownSidebar from "@/components/countdowns/CountdownSidebar";
import CountdownPreview from "@/components/countdowns/CountdownPreview";
import CountdownSettings, {
  type SettingsTab,
} from "@/components/countdowns/CountdownSettings";

export default function CountdownsPage() {
  const {
    countdowns,
    loaded,
    createCountdown,
    updateCountdown,
    deleteCountdown,
    duplicateCountdown,
    exportCountdown,
    importCountdown,
  } = useCountdownStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("timer");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const active = countdowns.find((cd) => cd.id === activeId) ?? null;

  // Auto-select first countdown
  useEffect(() => {
    if (loaded && countdowns.length > 0 && !activeId) {
      setActiveId(countdowns[0].id);
    }
    if (loaded && countdowns.length === 0) {
      setActiveId(null);
    }
  }, [loaded, countdowns, activeId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleCreate = useCallback(
    (template?: CountdownTemplate) => {
      const cd = createCountdown(template ? { template } : undefined);
      setActiveId(cd.id);
    },
    [createCountdown],
  );

  const handleUpdate = useCallback(
    (updates: Partial<Countdown>) => {
      if (!activeId) return;
      updateCountdown(activeId, updates);
    },
    [activeId, updateCountdown],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const copy = duplicateCountdown(id);
      if (copy) {
        setActiveId(copy.id);
        showToast("Countdown duplicated");
      }
    },
    [duplicateCountdown, showToast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteCountdown(id);
      if (activeId === id) {
        const remaining = countdowns.filter((cd) => cd.id !== id);
        setActiveId(remaining[0]?.id ?? null);
      }
      showToast("Countdown deleted");
    },
    [deleteCountdown, activeId, countdowns, showToast],
  );

  const handleExport = useCallback(
    (id: string) => {
      const json = exportCountdown(id);
      if (!json) return;
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `countdown-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Countdown exported");
    },
    [exportCountdown, showToast],
  );

  const handleTogglePlay = useCallback(() => {
    if (!active) return;
    if (active.isRunning) {
      handleUpdate({ isRunning: false, remainingSeconds: active.remainingSeconds });
    } else {
      handleUpdate({
        isRunning: true,
        startedAt: new Date().toISOString(),
      });
    }
  }, [active, handleUpdate]);

  const handleReset = useCallback(() => {
    if (!active) return;
    const total =
      active.timerMode === "fixed"
        ? active.fixedDuration
        : active.remainingSeconds;
    handleUpdate({
      isRunning: false,
      startedAt: null,
      remainingSeconds: total,
    });
  }, [active, handleUpdate]);

  const handleSendToOBS = useCallback(() => {
    if (!active) return;
    const html = generateOBSOverlayHTML(active);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    // Copy the HTML to clipboard for OBS Browser Source
    navigator.clipboard.writeText(html).then(() => {
      showToast("HTML overlay copied to clipboard — paste into OBS Browser Source");
    }).catch(() => {
      // Fallback: download the file
      const a = document.createElement("a");
      a.href = url;
      a.download = `countdown-overlay-${active.id}.html`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("HTML file downloaded — add as Browser Source in OBS");
    });
  }, [active, showToast]);

  // Loading state
  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <Clock className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-72px)] flex flex-col bg-slate-50">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            title="Toggle sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-semibold text-slate-900">Countdowns</h1>
        </div>

        {active && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePlay}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active.isRunning
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  : "bg-green-100 text-green-700 hover:bg-green-200"
              }`}
            >
              {active.isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Play
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              title="Reset"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-slate-200" />

            <button
              onClick={() => handleUpdate({ title: active.title })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>

            <button
              onClick={handleSendToOBS}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Send className="w-3.5 h-3.5" /> Send to OBS
            </button>

            <button
              onClick={() => handleDelete(active.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          title="Toggle settings"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        {showSidebar && (
          <CountdownSidebar
            countdowns={countdowns}
            activeId={activeId}
            onSelect={setActiveId}
            onCreate={handleCreate}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onExport={handleExport}
            onImport={importCountdown}
          />
        )}

        {/* Center: Preview */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-auto bg-slate-100">
          {active ? (
            <div className="w-full max-w-3xl">
              <CountdownPreview countdown={active} />
              <div className="mt-3 text-center">
                <input
                  value={active.title}
                  onChange={(e) => handleUpdate({ title: e.target.value })}
                  className="text-center bg-transparent text-sm font-medium text-slate-700 border-none outline-none w-full"
                  placeholder="Countdown title..."
                />
              </div>
            </div>
          ) : (
            <div className="text-center">
              <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                No countdown selected
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Create a countdown to get started
              </p>
              <button
                onClick={() => handleCreate("circular")}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                + Create Countdown
              </button>
            </div>
          )}
        </div>

        {/* Right panel: Settings */}
        {showSettings && active && (
          <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white p-4 overflow-hidden flex flex-col">
            <CountdownSettings
              countdown={active}
              onUpdate={handleUpdate}
              activeTab={settingsTab}
              onTabChange={setSettingsTab}
            />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-200">
          {toast}
        </div>
      )}
    </div>
  );
}
