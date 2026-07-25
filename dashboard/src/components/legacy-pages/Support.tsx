"use client";
import React, { useState } from "react";
import {
  HelpCircle,
  Mail,
  MessageCircle,
  FileText,
  Search,
  BookOpen,
  ChevronRight,
  PhoneCall,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "next-intl";

export default function Support() {
  const t = useTranslations("support");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: t("faqQuestion1"),
      a: t("faqAnswer1")
    },
    {
      q: t("faqQuestion2"),
      a: t("faqAnswer2")
    },
    {
      q: t("faqQuestion3"),
      a: t("faqAnswer3")
    },
    {
      q: t("faqQuestion4"),
      a: t("faqAnswer4")
    }
  ];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full flex-1 flex flex-col gap-8 pb-16">

      {/* Search Header */}
      <div className="bg-blue-600 rounded-[2rem] p-8 md:p-12 text-center relative overflow-hidden shadow-xl">
        <div className="absolute inset-0 bg-white opacity-5 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "24px 24px" }}></div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-white mb-4">{t("howCanWeHelp")}</h2>
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              className="w-full pl-12 pr-4 py-4 rounded-xl bg-white border-none shadow-lg focus:ring-4 focus:ring-blue-400/30 outline-none text-slate-900 font-medium transition-all"
            />
          </div>
        </div>
      </div>

      {/* Support Channels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        <div className="bg-white p-6 rounded-sm border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">{t("knowledgeBase")}</h3>
          <p className="text-sm text-slate-500 mb-6 flex-1">{t("knowledgeBaseDescription")}</p>
          <button className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-bold transition-colors">
            {t("browseArticles")}
          </button>
        </div>

        <div className="bg-white p-6 rounded-sm border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <MessageCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">{t("liveChat")}</h3>
          <p className="text-sm text-slate-500 mb-6 flex-1">{t("liveChatDescription")}</p>
          <button className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm font-bold transition-colors border border-emerald-200 flex justify-center items-center gap-2">
            {t("startChat")}
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </button>
        </div>

        <div className="bg-white p-6 rounded-sm border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">{t("emailTicket")}</h3>
          <p className="text-sm text-slate-500 mb-6 flex-1">{t("emailTicketDescription")}</p>
          <button className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-bold transition-colors">
            {t("submitTicket")}
          </button>
        </div>

      </div>

      {/* FAQs */}
      <div className="bg-white rounded-sm border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900">{t("frequentlyAskedQuestions")}</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {faqs.map((faq, i) => (
            <div key={i} className="p-2">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 rounded-lg transition-colors text-left"
              >
                <span className="font-bold text-slate-800 text-sm">{faq.q}</span>
                {openFaq === i ? (
                  <ChevronUp className="w-5 h-5 text-blue-600 shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                )}
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4 pt-2 text-sm text-slate-600 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
