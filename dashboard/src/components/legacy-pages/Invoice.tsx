"use client";
import React from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Church,
  CreditCard,
  Download
} from "lucide-react";
import { useTranslations } from "next-intl";

export default function Invoice() {
  const t = useTranslations();
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full flex flex-col min-h-full pb-16">

      {/* Breadcrumbs */}
      <nav className="flex mb-6 items-center gap-2 text-sm font-medium text-slate-500">
        <Link to="/billing" className="hover:text-slate-900 transition-colors">{t("invoice.billing")}</Link>
        <ChevronRight className="w-4 h-4" />
        <Link to="/billing/invoices" className="hover:text-slate-900 transition-colors">{t("invoice.invoices")}</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-900">{t("invoice.invoiceNumber")}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Invoice Document */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.05)]">

            {/* Invoice Header */}
            <div className="p-6 md:p-8 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start gap-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white">
                    <Church className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold text-blue-600 tracking-tight">EasyBible Mount</span>
                </div>
                <h2 className="text-3xl font-black text-slate-900">{t("invoice.invoiceNumber")}</h2>
                <p className="text-sm font-medium text-slate-500 mt-1">{t("invoice.issuedOn")}</p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-3 w-full md:w-auto">
                <span className="px-4 py-1.5 bg-emerald-50 text-emerald-700 font-bold text-sm rounded-full border border-emerald-200 flex items-center gap-1.5 shrink-0 self-start md:self-end">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span>
                  {t("invoice.paid")}
                </span>
                <div className="text-left md:text-right w-full md:w-auto">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t("invoice.amountPaid")}</p>
                  <p className="text-2xl font-black text-slate-900">$19.00</p>
                </div>
              </div>
            </div>

            {/* Invoice Body */}
            <div className="p-6 md:p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t("invoice.billedTo")}</h4>
                  <p className="font-bold text-sm text-slate-900 mb-1">{t("invoice.graceCommunityChurch")}</p>
                  <p className="text-sm font-medium text-slate-600 leading-relaxed">
                    {t("invoice.churchAddress")}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t("invoice.paymentDetails")}</h4>
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-5 h-5 text-slate-400" />
                    <p className="text-sm font-medium text-slate-600">{t("invoice.visaEnding")}</p>
                  </div>
                  <p className="text-sm font-medium text-slate-500">{t("invoice.transactionId")}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t("invoice.description")}</th>
                      <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">{t("invoice.qty")}</th>
                      <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t("invoice.unitPrice")}</th>
                      <th className="py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t("invoice.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="py-6">
                        <p className="font-bold text-sm text-slate-900 mb-1">{t("invoice.proPlanMonthly")}</p>
                        <p className="text-xs font-medium text-slate-500">{t("invoice.billingPeriod")}</p>
                      </td>
                      <td className="py-6 text-center text-sm font-medium text-slate-700">1</td>
                      <td className="py-6 text-right text-sm font-medium text-slate-700">$19.00</td>
                      <td className="py-6 text-right font-bold text-sm text-slate-900">$19.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invoice Footer */}
            <div className="p-6 md:p-8 bg-slate-50/50 text-center border-t border-slate-100">
              <p className="text-sm text-slate-500 italic font-medium max-w-xl mx-auto">
                {t("invoice.thankYouMessage")}
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-all active:scale-95 shadow-sm">
              <Download className="w-4 h-4" />
              {t("invoice.downloadInvoicePdf")}
            </button>
          </div>
        </div>

        {/* Right: Summary & Support */}
        <div className="lg:col-span-4 space-y-6">

          {/* Summary Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6">{t("invoice.summary")}</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-slate-600">Pro Plan - Monthly</span>
                <span className="text-slate-900">$19.00</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-slate-600">{t("invoice.subtotal")}</span>
                <span className="text-slate-900">$19.00</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-slate-600">{t("invoice.tax")}</span>
                <span className="text-slate-900">$0.00</span>
              </div>
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                <span className="font-bold text-lg text-slate-900">{t("invoice.total")}</span>
                <span className="font-black text-xl text-blue-600">$19.00</span>
              </div>
            </div>
          </div>

          {/* Help Card */}
          <div className="bg-slate-900 rounded-xl p-6 relative overflow-hidden group">
            <div className="relative z-10">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center text-white mb-4 border border-white/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              </div>
              <h3 className="font-bold text-white mb-2">{t("invoice.needHelp")}</h3>
              <p className="text-sm font-medium text-slate-400 mb-4 leading-relaxed">
                {t("invoice.billingQuestion")}
              </p>
              <Link to="/support" className="inline-flex items-center gap-2 text-white font-bold text-sm hover:underline">
                {t("invoice.contactSupport")}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-colors pointer-events-none"></div>
          </div>

          {/* History Card */}
          <div className="border border-slate-200 rounded-xl p-6 bg-white shadow-sm">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">{t("invoice.billingCycle")}</h4>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <div className="w-[45%] h-full bg-blue-600 rounded-full"></div>
              </div>
              <span className="text-sm font-bold text-slate-700">{t("invoice.daysLeft")}</span>
            </div>
            <p className="text-sm font-medium text-slate-500 mt-4">{t("invoice.nextBillingDate")}</p>
          </div>

        </div>
      </div>
    </div>
  );
}
