"use client";

import { useTranslations } from "next-intl";
import {
  PlayCircle,
  BookOpen,
  Mic,
  Languages,
  Layout,
  MonitorSmartphone,
  Settings,
  ChevronRight,
  Clock,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { Card, Button } from "@/components/ui";

interface Tutorial {
  id: string;
  titleKey: string;
  descKey: string;
  categoryKey: string;
  durationKey: string;
  icon: typeof PlayCircle;
  iconBg: string;
  iconColor: string;
}

const TUTORIAL_ITEMS: Tutorial[] = [
  { id: "getting-started", titleKey: "tut1Title", descKey: "tut1Desc", categoryKey: "catBasics", durationKey: "dur5", icon: BookOpen, iconBg: "bg-blue-50", iconColor: "text-blue-600" },
  { id: "speech-to-scripture", titleKey: "tut2Title", descKey: "tut2Desc", categoryKey: "catAIFeatures", durationKey: "dur8", icon: Mic, iconBg: "bg-purple-50", iconColor: "text-purple-600" },
  { id: "translation", titleKey: "tut3Title", descKey: "tut3Desc", categoryKey: "catAIFeatures", durationKey: "dur6", icon: Languages, iconBg: "bg-green-50", iconColor: "text-green-600" },
  { id: "lower-thirds", titleKey: "tut4Title", descKey: "tut4Desc", categoryKey: "catDesign", durationKey: "dur10", icon: Layout, iconBg: "bg-amber-50", iconColor: "text-amber-600" },
  { id: "obs-integration", titleKey: "tut5Title", descKey: "tut5Desc", categoryKey: "catIntegration", durationKey: "dur7", icon: MonitorSmartphone, iconBg: "bg-rose-50", iconColor: "text-rose-600" },
  { id: "worship-mode", titleKey: "tut6Title", descKey: "tut6Desc", categoryKey: "catWorship", durationKey: "dur6", icon: PlayCircle, iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
  { id: "device-pairing", titleKey: "tut7Title", descKey: "tut7Desc", categoryKey: "catBasics", durationKey: "dur5", icon: MonitorSmartphone, iconBg: "bg-cyan-50", iconColor: "text-cyan-600" },
  { id: "custom-themes", titleKey: "tut8Title", descKey: "tut8Desc", categoryKey: "catDesign", durationKey: "dur4", icon: Settings, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
];

const CATEGORY_KEYS = ["catAll", "catBasics", "catAIFeatures", "catDesign", "catIntegration", "catWorship"] as const;

export default function TutorialsPage() {
  const t = useTranslations("tutorials");
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORY_KEYS)[number]>(CATEGORY_KEYS[0]);

  const tutorials = TUTORIAL_ITEMS.map(item => ({
    ...item,
    title: t(item.titleKey),
    description: t(item.descKey),
    category: t(item.categoryKey),
    duration: t(item.durationKey),
  }));

  const filtered = activeCategory === CATEGORY_KEYS[0]
    ? tutorials
    : tutorials.filter((item) => item.categoryKey === activeCategory);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("title")}</h1>
        <p className="text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_KEYS.map((catKey) => (
          <button
            key={catKey}
            onClick={() => setActiveCategory(catKey)}
            className={`px-4 h-[44px] rounded-xl text-sm font-semibold transition-colors border ${activeCategory === catKey
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
          >
            {t(catKey)}
          </button>
        ))}
      </div>

      {/* Tutorial grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((tutorial) => {
          const Icon = tutorial.icon;
          return (
            <Card key={tutorial.id} padding="md" className="flex flex-col hover:border-blue-200 transition-colors group cursor-pointer">
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 ${tutorial.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${tutorial.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{tutorial.category}</span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="w-4 h-4" /> {tutorial.duration}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{tutorial.title}</h3>
                </div>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed mb-3 flex-1">{tutorial.description}</p>
              <div className="flex items-center pt-3 border-t border-slate-100">
                <span className="text-sm font-semibold text-blue-700 flex items-center gap-1 group-hover:gap-2 transition-all">
                  {t("watchTutorial")} <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Help banner */}
      <Card padding="md" className="bg-slate-50">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{t("cantFindTitle")}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{t("cantFindDesc")}</p>
          </div>
          <a
            href="https://github.com/jolamyfoodsng/makechurcheasy-releases/wiki"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secondary" size="sm" icon={<BookOpen className="w-4 h-4" />}>
              {t("viewDocs")} <ExternalLink className="w-4 h-4 text-slate-400 ml-1" />
            </Button>
          </a>
        </div>
      </Card>
    </div>
  );
}
