"use client";

import { useTranslations } from "next-intl";
import {
  Headset,
  Mail,
  MessageSquare,
  BookOpen,
  ExternalLink,
  HelpCircle,
  Bug,
  Lightbulb,
  Send,
} from "lucide-react";

const SUPPORT_EMAIL = "support@makechurcheazy.com";
const COMMUNITY_URL = "https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t";
const TELEGRAM_URL = "https://t.me/makechurcheasy";
const DOCS_URL = "https://github.com/jolamyfoodsng/makechurcheasy-releases/wiki";

export default function AdminSupportPage() {
  const t = useTranslations();

  const supportChannels = [
    {
      icon: MessageSquare,
      title: t("admin.support.liveChat"),
      description: t("admin.support.liveChatDescription"),
      action: COMMUNITY_URL,
      iconColor: "bg-emerald-500/15 text-emerald-400",
    },
    {
      icon: Send,
      title: t("admin.support.telegram"),
      description: t("admin.support.telegramDescription"),
      action: TELEGRAM_URL,
      iconColor: "bg-sky-500/15 text-sky-400",
    },
    {
      icon: Mail,
      title: t("admin.support.emailSupport"),
      description: t("admin.support.emailDescription"),
      action: `mailto:${SUPPORT_EMAIL}`,
      iconColor: "bg-blue-500/15 text-blue-400",
    },
    {
      icon: BookOpen,
      title: t("admin.support.documentation"),
      description: t("admin.support.documentationDescription"),
      action: DOCS_URL,
      iconColor: "bg-violet-500/15 text-violet-400",
    },
  ];

  const quickActions = [
    {
      icon: Bug,
      title: t("admin.support.reportBug"),
      description: t("admin.support.reportBugDescription"),
      action: `mailto:${SUPPORT_EMAIL}?subject=Bug%20Report%20-%20MakeChurchEasy`,
      iconColor: "bg-red-500/15 text-red-400",
    },
    {
      icon: Lightbulb,
      title: t("admin.support.featureRequest"),
      description: t("admin.support.featureRequestDescription"),
      action: `mailto:${SUPPORT_EMAIL}?subject=Feature%20Request%20-%20MakeChurchEasy`,
      iconColor: "bg-amber-500/15 text-amber-400",
    },
    {
      icon: HelpCircle,
      title: t("admin.support.faq"),
      description: t("admin.support.faqDescription"),
      action: DOCS_URL,
      iconColor: "bg-slate-500/15 text-slate-400",
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-50">
          {t("admin.support.title")}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {t("admin.support.description")}
        </p>
      </div>

      {/* Support Channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {supportChannels.map((channel) => {
          const Icon = channel.icon;
          return (
            <a
              key={channel.title}
              href={channel.action}
              target={channel.action.startsWith("http") ? "_blank" : undefined}
              rel={channel.action.startsWith("http") ? "noopener noreferrer" : undefined}
              className="group rounded-2xl bg-gray-900 border border-slate-700 p-6 hover:border-slate-600 transition-colors"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${channel.iconColor}`}>
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-50 mb-1 group-hover:text-violet-400 transition-colors">
                {channel.title}
              </h3>
              <p className="text-sm text-slate-400 mb-4">{channel.description}</p>
              <div className="flex items-center gap-1.5 text-xs font-medium text-violet-400">
                <span>{t("admin.support.openLink")}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </a>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl bg-gray-900 border border-slate-700 p-6">
        <h2 className="text-base font-semibold text-slate-50 mb-4">
          {t("admin.support.quickActions")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <a
                key={action.title}
                href={action.action}
                target={action.action.startsWith("http") ? "_blank" : undefined}
                rel={action.action.startsWith("http") ? "noopener noreferrer" : undefined}
                className="flex items-start gap-4 p-4 rounded-xl bg-gray-800 border border-slate-700 hover:border-slate-600 transition-colors text-left"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${action.iconColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-50 mb-0.5">
                    {action.title}
                  </h3>
                  <p className="text-xs text-slate-400">{action.description}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
