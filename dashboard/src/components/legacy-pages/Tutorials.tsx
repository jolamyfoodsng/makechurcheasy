"use client";
import React from "react";
import {
  PlayCircle,
  BookOpen,
  Mic,
  Languages,
  MonitorPlay,
  LayoutGrid,
  Clock,
  ListOrdered,
  ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "next-intl";

export default function Tutorials() {
  const t = useTranslations("tutorials");
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6 pb-16">

      {/* Header */}
      <div className="mb-4">
        <h2 className="text-3xl font-black text-slate-900 mb-2">{t("title")}</h2>
        <p className="text-slate-500 text-base">{t("subtitle")}</p>
      </div>

      {/* Hero Section */}
      <div className="bg-slate-900 rounded-[2rem] p-8 md:p-10 lg:p-12 mb-8 flex flex-col lg:flex-row gap-10 items-center relative overflow-hidden group shadow-xl">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, #3b82f6 1px, transparent 1px)", backgroundSize: "24px 24px" }}></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>

        <div className="flex-1 relative z-10 text-white">
          <h3 className="text-3xl md:text-4xl font-black leading-tight mb-4">{t("heroTitle")}</h3>
          <p className="text-slate-300 text-base mb-8 max-w-lg leading-relaxed">
            {t("heroDescription")}
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6">
            <button className="bg-blue-600 text-white px-8 py-4 rounded-xl flex items-center justify-center gap-3 text-sm font-bold hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95">
              <PlayCircle className="w-5 h-5 fill-current" />
              {t("startGettingStarted")}
            </button>
            <div className="flex items-center justify-center sm:justify-start gap-4 text-slate-400 text-sm font-medium">
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {t("minutes")}</span>
              <span className="flex items-center gap-1.5"><ListOrdered className="w-4 h-4" /> {t("lessons")}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full relative z-10">
          <div className="aspect-video bg-slate-800 rounded-sm overflow-hidden shadow-2xl relative group/video border border-slate-700 cursor-pointer">
            <img
              src="https://images.unsplash.com/photo-1438283173091-5dbf5c5a3206?q=80&w=800&auto=format&fit=crop"
              alt="Tutorial Preview"
              className="w-full h-full object-cover opacity-80 group-hover/video:opacity-100 transition-opacity duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent"></div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30 group-hover/video:scale-110 transition-transform duration-300 shadow-xl">
                <PlayCircle className="w-10 h-10 fill-current" />
              </div>
            </div>

            <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
              <div>
                <h4 className="text-white text-lg font-bold mb-1">Great is Thy faithfulness, O God my Father</h4>
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">{t("previewSubtitle")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Browse by Category */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">{t("browseByCategory")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

          <div className="bg-white p-6 rounded-sm border border-slate-200 flex flex-col items-center text-center group hover:border-blue-500 hover:shadow-md transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BookOpen className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">{t("gettingStarted")}</h4>
            <p className="text-xs font-medium text-slate-500">{t("videosCount", { count: 6 })}</p>
          </div>

          <div className="bg-white p-6 rounded-sm border border-slate-200 flex flex-col items-center text-center group hover:border-purple-500 hover:shadow-md transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Mic className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">{t("speechToScripture")}</h4>
            <p className="text-xs font-medium text-slate-500">{t("videosCount", { count: 8 })}</p>
          </div>

          <div className="bg-white p-6 rounded-sm border border-slate-200 flex flex-col items-center text-center group hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Languages className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">{t("translation")}</h4>
            <p className="text-xs font-medium text-slate-500">{t("videosCount", { count: 7 })}</p>
          </div>

          <div className="bg-white p-6 rounded-sm border border-slate-200 flex flex-col items-center text-center group hover:border-amber-500 hover:shadow-md transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <MonitorPlay className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">{t("obsIntegration")}</h4>
            <p className="text-xs font-medium text-slate-500">{t("videosCount", { count: 9 })}</p>
          </div>

          <div className="bg-white p-6 rounded-sm border border-slate-200 flex flex-col items-center text-center group hover:border-slate-500 hover:shadow-md transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">{t("allTutorials")}</h4>
            <p className="text-xs font-medium text-slate-500">{t("videosCount", { count: 35 })}</p>
          </div>

        </div>
      </div>

      {/* Popular Tutorials */}
      <div>
        <div className="flex justify-between items-end mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{t("popularTutorials")}</h3>
          <Link to="#" className="text-sm font-bold text-blue-600 hover:underline">{t("viewAll")}</Link>
        </div>

        <div className="flex flex-col gap-4">

          <div className="bg-white border border-slate-200 rounded-sm p-4 flex flex-col sm:flex-row gap-6 items-start sm:items-center hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
            <div className="w-full sm:w-56 aspect-video shrink-0 relative rounded-xl overflow-hidden bg-slate-100">
              <img src="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600&auto=format&fit=crop" alt="Thumbnail" className="w-full h-full object-cover" />
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-md text-[10px] text-white font-bold tracking-wider">5:23</div>
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                  <h4 className="text-lg font-bold text-slate-900 mb-1 leading-tight">{t("gettingStartedTitle")}</h4>
                  <p className="text-sm text-slate-500">{t("gettingStartedDescription")}</p>
                </div>
                <span className="px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-full uppercase tracking-wider shrink-0 border border-blue-100">{t("beginner")}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-sm p-4 flex flex-col sm:flex-row gap-6 items-start sm:items-center hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
            <div className="w-full sm:w-56 aspect-video shrink-0 relative rounded-xl overflow-hidden bg-slate-100">
              <img src="https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=600&auto=format&fit=crop" alt="Thumbnail" className="w-full h-full object-cover" />
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-md text-[10px] text-white font-bold tracking-wider">7:12</div>
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                  <h4 className="text-lg font-bold text-slate-900 mb-1 leading-tight">{t("speechToScriptureTitle")}</h4>
                  <p className="text-sm text-slate-500">{t("speechToScriptureDescription")}</p>
                </div>
                <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-full uppercase tracking-wider shrink-0">{t("popular")}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-sm p-4 flex flex-col sm:flex-row gap-6 items-start sm:items-center hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
            <div className="w-full sm:w-56 aspect-video shrink-0 relative rounded-xl overflow-hidden bg-slate-100">
              <img src="https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?q=80&w=600&auto=format&fit=crop" alt="Thumbnail" className="w-full h-full object-cover" />
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-md text-[10px] text-white font-bold tracking-wider">6:45</div>
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                  <h4 className="text-lg font-bold text-slate-900 mb-1 leading-tight">{t("translationTitle")}</h4>
                  <p className="text-sm text-slate-500">{t("translationDescription")}</p>
                </div>
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full uppercase tracking-wider shrink-0 border border-slate-200">{t("intermediate")}</span>
              </div>
            </div>
          </div>

        </div>

        <button className="w-full mt-6 py-4 border-2 border-slate-200 border-dashed rounded-sm text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-2">
          {t("viewAllTutorials")}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}
