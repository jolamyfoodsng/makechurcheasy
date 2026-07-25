"use client";

import type { Countdown, CountdownTemplate } from "@/lib/countdowns/types";
import { TEMPLATE_LABELS, TEMPLATE_DESCRIPTIONS } from "@/lib/countdowns/types";
import { Plus, Clock, Copy, Trash2, Download, Upload, MoreVertical } from "lucide-react";
import { useState, useRef } from "react";

interface Props {
  countdowns: Countdown[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (template?: CountdownTemplate) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onImport: (json: string) => void;
}

const TEMPLATE_ORDER: CountdownTemplate[] = [
  "circular",
  "minimal",
  "modern",
  "conference",
  "lower-third",
  "full-screen",
  "custom",
];

export default function CountdownSidebar({
  countdowns,
  activeId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
}: Props) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = ev.target?.result as string;
      onImport(json);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">My Countdowns</h3>
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Countdown
        </button>
      </div>

      {/* Template picker */}
      {showTemplates && (
        <div className="p-3 border-b border-slate-200 bg-slate-50">
          <p className="text-xs font-medium text-slate-500 mb-2">Choose Template</p>
          <div className="space-y-1">
            {TEMPLATE_ORDER.map((t) => (
              <button
                key={t}
                onClick={() => {
                  onCreate(t);
                  setShowTemplates(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-200"
              >
                <span className="font-medium text-slate-900">{TEMPLATE_LABELS[t]}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{TEMPLATE_DESCRIPTIONS[t]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Countdown list */}
      <div className="flex-1 overflow-y-auto">
        {countdowns.length === 0 ? (
          <div className="p-6 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No countdowns yet</p>
            <p className="text-xs text-slate-400 mt-1">Create one to get started</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {countdowns.map((cd) => (
              <div
                key={cd.id}
                onClick={() => onSelect(cd.id)}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                  activeId === cd.id
                    ? "bg-blue-50 border border-blue-200"
                    : "hover:bg-slate-50 border border-transparent"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{cd.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {cd.isRunning ? (
                      <span className="text-green-600 font-medium">● Running</span>
                    ) : (
                      TEMPLATE_LABELS[cd.template]
                    )}
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === cd.id ? null : cd.id);
                    }}
                    className="p-1 rounded hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-3.5 h-3.5 text-slate-500" />
                  </button>

                  {menuOpen === cd.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                        <button
                          onClick={(e) => { e.stopPropagation(); onDuplicate(cd.id); setMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Copy className="w-3.5 h-3.5" /> Duplicate
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onExport(cd.id); setMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="w-3.5 h-3.5" /> Export
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(cd.id); setMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import button */}
      <div className="p-3 border-t border-slate-200">
        <button
          onClick={() => importRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import Countdown
        </button>
        <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
      </div>
    </div>
  );
}
