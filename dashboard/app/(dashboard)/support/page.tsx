"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageCircle,
  BookOpen,
  ExternalLink,
  Search,
  CreditCard,
  Monitor,
  Zap,
  Shield,
  Settings,
  Wifi,
} from "lucide-react";

interface FAQ {
  questionKey: string;
  answerKey: string;
  categoryKey: string;
  categoryIcon: typeof HelpCircle;
}

const FAQS: FAQ[] = [
  { questionKey: "faqQ1", answerKey: "faqA1", categoryKey: "Devices", categoryIcon: Monitor },
  { questionKey: "faqQ2", answerKey: "faqA2", categoryKey: "Credits", categoryIcon: Zap },
  { questionKey: "faqQ3", answerKey: "faqA3", categoryKey: "Integration", categoryIcon: Wifi },
  { questionKey: "faqQ4", answerKey: "faqA4", categoryKey: "Billing", categoryIcon: CreditCard },
  { questionKey: "faqQ5", answerKey: "faqA5", categoryKey: "Security", categoryIcon: Shield },
  { questionKey: "faqQ6", answerKey: "faqA6", categoryKey: "Devices", categoryIcon: Monitor },
  { questionKey: "faqQ7", answerKey: "faqA7", categoryKey: "General", categoryIcon: HelpCircle },
  { questionKey: "faqQ8", answerKey: "faqA8", categoryKey: "Account", categoryIcon: Settings },
];

export default function SupportPage() {
  const t = useTranslations("support");
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const faqs = FAQS.map(faq => ({
    ...faq,
    question: t(faq.questionKey),
    answer: t(faq.answerKey),
    category: t(`cat_${faq.categoryKey}`),
  }));

  const filteredFAQs = searchQuery
    ? faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : faqs;

  const CONTACT_OPTIONS = [
    {
      icon: Mail,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      title: t("emailSupportTitle"),
      description: t("emailSupportDesc"),
      href: "mailto:support@creatorstudioslabs.stream",
      label: "support@creatorstudioslabs.stream",
    },
    {
      icon: MessageCircle,
      iconBg: "bg-green-50",
      iconColor: "text-green-600",
      title: t("whatsappTitle"),
      description: t("whatsappDesc"),
      href: "https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t",
      label: t("joinCommunity"),
    },
    {
      icon: BookOpen,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
      title: t("docsTitle"),
      description: t("docsDesc"),
      href: "https://github.com/jolamyfoodsng/makechurcheasy-releases/wiki",
      label: t("viewDocs"),
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 transition-colors"
        />
      </div>

      {/* Contact Options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CONTACT_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <a
              key={option.title}
              href={option.href}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-blue-200 transition-shadow group"
            >
              <div className={`w-10 h-10 ${option.iconBg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${option.iconColor}`} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1 group-hover:text-blue-700 transition-colors">
                {option.title}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                {option.description}
              </p>
              <span className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                {option.label} <ExternalLink className="w-3 h-3" />
              </span>
            </a>
          );
        })}
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4">{t("faqHeading")}</h2>
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {filteredFAQs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {t("noResults")}
            </div>
          ) : (
            filteredFAQs.map((faq, i) => {
              const isOpen = openFAQ === i;
              const CatIcon = faq.categoryIcon;
              return (
                <div key={i}>
                  <button
                    onClick={() => setOpenFAQ(isOpen ? null : i)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                      <CatIcon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{faq.question}</p>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">{faq.category}</p>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pl-17">
                      <p className="text-sm text-slate-600 leading-relaxed ml-12">
                        {faq.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Still Need Help */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{t("stillNeedHelp")}</h3>
            <p className="text-sm text-slate-600 mt-0.5">
              {t("stillNeedHelpDesc")}
            </p>
          </div>
        </div>
        <a
          href="mailto:support@creatorstudioslabs.stream"
          className="flex items-center gap-2 h-11 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-colors shadow-sm text-sm whitespace-nowrap"
        >
          <Mail className="w-4 h-4" /> {t("contactSupport")}
        </a>
      </div>
    </div>
  );
}
