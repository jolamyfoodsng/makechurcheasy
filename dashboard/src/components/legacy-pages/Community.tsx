"use client";
import React from "react";
import {
  MessageSquare,
  Lightbulb,
  List,
  Smartphone,
  Cloud,
  Bot,
  Layers,
  ArrowUp,
  ThumbsUp,
  MessageCircle,
  ExternalLink
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "next-intl";

export default function Community() {
  const t = useTranslations();
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6 pb-16">

      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-3xl font-black text-slate-900 mb-2">{t("navigation.community")}</h2>
        <p className="text-slate-500 text-base">{t("communityExtended.connectCollaborate")}</p>
      </div>

      {/* Top Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

        {/* WhatsApp Community */}
        <div className="bg-white p-8 rounded-sm border border-slate-200 shadow-sm text-center flex flex-col items-center group transition-transform duration-300 hover:-translate-y-1">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-sm flex items-center justify-center mb-6">
            <MessageSquare className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">{t("communityExtended.whatsappCommunity")}</h3>
          <p className="text-slate-500 text-sm font-semibold mb-2">{t("communityExtended.membersCount")}</p>
          <p className="text-slate-500 text-sm mb-8 max-w-[240px]">{t("communityExtended.whatsappDescription")}</p>
          <a href="https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t" target="_blank" rel="noopener noreferrer" className="mt-auto px-6 py-3 border-2 border-emerald-600 text-emerald-600 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-600 hover:text-white transition-all w-full justify-center">
            {t("communityExtended.joinCommunity")} <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Feature Requests */}
        <div className="bg-white p-8 rounded-sm border border-slate-200 shadow-sm text-center flex flex-col items-center group transition-transform duration-300 hover:-translate-y-1">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-sm flex items-center justify-center mb-6">
            <Lightbulb className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">{t("communityExtended.featureRequests")}</h3>
          <p className="text-slate-500 text-sm font-semibold mb-2">{t("communityExtended.voteAndSuggest")}</p>
          <p className="text-slate-500 text-sm mb-8 max-w-[240px]">{t("communityExtended.featureRequestsDescription")}</p>
          <button className="mt-auto px-6 py-3 border-2 border-amber-500 text-amber-500 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-amber-500 hover:text-white transition-all w-full justify-center">
            {t("communityExtended.viewRequests")} <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {/* Roadmap */}
        <div className="bg-white p-8 rounded-sm border border-slate-200 shadow-sm text-center flex flex-col items-center group transition-transform duration-300 hover:-translate-y-1">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-sm flex items-center justify-center mb-6">
            <List className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">{t("communityExtended.roadmap")}</h3>
          <p className="text-slate-500 text-sm font-semibold mb-2">{t("communityExtended.seeWhatsComing")}</p>
          <p className="text-slate-500 text-sm mb-8 max-w-[240px]">{t("communityExtended.roadmapDescription")}</p>
          <button className="mt-auto px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-600 hover:text-white transition-all w-full justify-center">
            {t("communityExtended.viewRoadmap")} <ExternalLink className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Feature Requests Table */}
      <div className="bg-white rounded-sm border border-slate-200 shadow-sm mb-8 overflow-hidden">
        <div className="px-6 py-5 flex justify-between items-center border-b border-slate-200 bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-900">{t("communityExtended.topFeatureRequests")}</h3>
          <Link to="#" className="text-blue-600 text-sm font-bold hover:underline">{t("communityExtended.viewAllRequests")}</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="text-left border-b border-slate-200 bg-slate-50/80">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t("communityExtended.feature")}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t("communityExtended.votes")}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">

              {/* Row 1 */}
              <tr className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 mb-0.5">{t("communityExtended.mobileApp")}</p>
                      <p className="text-xs text-slate-500">{t("communityExtended.mobileAppDescription")}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg font-bold text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition-all">
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span className="text-sm">342</span>
                  </button>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2.5 py-1 rounded bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">{t("communityExtended.inProgress")}</span>
                </td>
              </tr>

              {/* Row 2 */}
              <tr className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 mb-0.5">{t("communityExtended.cloudBackup")}</p>
                      <p className="text-xs text-slate-500">{t("communityExtended.cloudBackupDescription")}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg font-bold text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition-all">
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span className="text-sm">289</span>
                  </button>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider">{t("communityExtended.planned")}</span>
                </td>
              </tr>

              {/* Row 3 */}
              <tr className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 mb-0.5">{t("communityExtended.aiSermonAssistant")}</p>
                      <p className="text-xs text-slate-500">{t("communityExtended.aiSermonDescription")}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg font-bold text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition-all">
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span className="text-sm">215</span>
                  </button>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider">{t("communityExtended.planned")}</span>
                </td>
              </tr>

              {/* Row 4 */}
              <tr className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 mb-0.5">{t("communityExtended.advancedLowerThirds")}</p>
                      <p className="text-xs text-slate-500">{t("communityExtended.advancedLowerThirdsDescription")}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg font-bold text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition-all">
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span className="text-sm">187</span>
                  </button>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2.5 py-1 rounded bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">{t("communityExtended.underReview")}</span>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

      {/* Community Highlights Section */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">{t("communityExtended.communityHighlights")}</h3>
          <Link to="#" className="text-blue-600 text-sm font-bold hover:underline">{t("communityExtended.viewAllPosts")}</Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* Post 1 */}
          <div className="bg-white p-5 rounded-sm border border-slate-200 shadow-sm flex flex-col h-full hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0 overflow-hidden">
                <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="User Avatar" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 leading-tight mb-0.5">John Okafor</p>
                <p className="text-xs text-slate-500">2h ago in <span className="text-blue-600">Tips</span></p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-4 flex-1 line-clamp-3">{t("communityExtended.setupMultiView")}</p>
            <div className="relative rounded-lg overflow-hidden mb-4 aspect-video bg-slate-100 border border-slate-200">
              <img src="https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=600&auto=format&fit=crop" alt="Setup" className="w-full h-full object-cover opacity-90" />
            </div>
            <div className="flex items-center gap-4 text-slate-500 pt-3 border-t border-slate-100">
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <ThumbsUp className="w-4 h-4" />
                <span className="text-xs font-bold">24</span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-bold">8</span>
              </button>
            </div>
          </div>

          {/* Post 2 */}
          <div className="bg-white p-5 rounded-sm border border-slate-200 shadow-sm flex flex-col h-full hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0 overflow-hidden">
                <img src="https://i.pravatar.cc/150?u=a042581f4e29026704b" alt="User Avatar" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 leading-tight mb-0.5">Grace Emmanuel</p>
                <p className="text-xs text-slate-500">5h ago in <span className="text-blue-600">Discussion</span></p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-6 flex-1">{t("communityExtended.organizeMediaLibrary")}</p>
            <div className="flex items-center gap-4 text-slate-500 pt-3 border-t border-slate-100 mt-auto">
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <ThumbsUp className="w-4 h-4" />
                <span className="text-xs font-bold">18</span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-bold">12</span>
              </button>
            </div>
          </div>

          {/* Post 3 */}
          <div className="bg-white p-5 rounded-sm border border-slate-200 shadow-sm flex flex-col h-full hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0 overflow-hidden">
                <img src="https://i.pravatar.cc/150?u=a042581f4e29026704c" alt="User Avatar" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 leading-tight mb-0.5">David Joshua</p>
                <p className="text-xs text-slate-500">1d ago in <span className="text-blue-600">Tips</span></p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-6 flex-1">{t("communityExtended.newTranslationFeature")}</p>
            <div className="flex items-center gap-4 text-slate-500 pt-3 border-t border-slate-100 mt-auto">
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <ThumbsUp className="w-4 h-4" />
                <span className="text-xs font-bold">36</span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-bold">5</span>
              </button>
            </div>
          </div>

          {/* Post 4 */}
          <div className="bg-white p-5 rounded-sm border border-slate-200 shadow-sm flex flex-col h-full hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0 overflow-hidden">
                <img src="https://i.pravatar.cc/150?u=a042581f4e29026704e" alt="User Avatar" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 leading-tight mb-0.5">Mercy A.</p>
                <p className="text-xs text-slate-500">1d ago in <span className="text-blue-600">Showcase</span></p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-4 flex-1 line-clamp-3">{t("communityExtended.newLowerThirdsSetup")}</p>
            <div className="relative rounded-lg overflow-hidden mb-4 aspect-video bg-slate-100 border border-slate-200">
              <img src="https://images.unsplash.com/photo-1438283173091-5dbf5c5a3206?q=80&w=600&auto=format&fit=crop" alt="Setup" className="w-full h-full object-cover opacity-90" />
            </div>
            <div className="flex items-center gap-4 text-slate-500 pt-3 border-t border-slate-100">
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <ThumbsUp className="w-4 h-4" />
                <span className="text-xs font-bold">28</span>
              </button>
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-bold">7</span>
              </button>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
