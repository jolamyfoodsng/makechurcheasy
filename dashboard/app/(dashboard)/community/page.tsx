"use client";

import { useTranslations } from "next-intl";
import {
  MessageCircle,
  Lightbulb,
  Map,
  Users,
  ExternalLink,
  ChevronRight,
  Github,
  Heart,
  BookOpen,
} from "lucide-react";

export default function CommunityPage() {
  const t = useTranslations("community");

  const COMMUNITY_LINKS = [
    {
      icon: MessageCircle,
      iconBg: "bg-green-50",
      iconColor: "text-green-600",
      title: t("whatsappTitle"),
      description: t("whatsappDescription"),
      href: "https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t",
      members: t("whatsappMembers"),
      badge: t("mostActive"),
      badgeColor: "bg-green-100 text-green-700 border-green-200",
    },
    {
      icon: Lightbulb,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      title: t("featureRequestsTitle"),
      description: t("featureRequestsDescription"),
      href: "https://github.com/jolamyfoodsng/makechurcheasy-releases/issues",
      members: t("communityDriven"),
      badge: t("voteAndDiscuss"),
      badgeColor: "bg-amber-100 text-amber-700 border-amber-200",
    },
    {
      icon: Map,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
      title: t("roadmapTitle"),
      description: t("roadmapDescription"),
      href: "https://github.com/jolamyfoodsng/makechurcheasy-releases/milestones",
      members: t("updatedWeekly"),
      badge: t("seeWhatsNext"),
      badgeColor: "bg-purple-100 text-purple-700 border-purple-200",
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-8 pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("title")}</h1>
        <p className="text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      {/* Primary Community Links */}
      <div className="grid grid-cols-1 gap-4">
        {COMMUNITY_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-blue-200 transition-shadow group flex flex-col sm:flex-row items-start gap-4"
            >
              <div className={`w-14 h-14 ${link.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
                <Icon className={`w-8 h-8 ${link.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                    {link.title}
                  </h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${link.badgeColor}`}>
                    {link.badge}
                  </span>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed mb-2">
                  {link.description}
                </p>
                <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                  <Users className="w-4 h-4" /> {link.members}
                </div>
              </div>
              <div className="shrink-0 self-center">
                <ExternalLink className="w-5 h-5 text-slate-300 group-hover:text-blue-700 transition-colors" />
              </div>
            </a>
          );
        })}
      </div>

      {/* Join CTA */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-100 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
            <MessageCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{t("joinConversation")}</h3>
            <p className="text-sm text-slate-600 mt-0.5">
              {t("joinConversationDesc")}
            </p>
          </div>
        </div>
        <a
          href="https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 h-11 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors shadow-sm text-sm whitespace-nowrap"
        >
          {t("joinWhatsApp")} <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
