"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  CreditCard,
  Download,
  ExternalLink,
  HelpCircle,
  Image,
  LifeBuoy,
  Mail,
  MessageCircle,
  Mic,
  Monitor,
  Search,
  Send,
  Shield,
  UploadCloud,
  Wifi,
  Wrench,
  X,
  Zap,
} from "lucide-react";

type GuideKey = "general" | "presentation" | "songs" | "media" | "prepare";

interface FAQ {
  questionKey: string;
  answerKey: string;
  categoryKey: string;
  categoryIcon: LucideIcon;
}

interface HelpResource {
  titleKey: string;
  descriptionKey: string;
  categoryKey: string;
  icon: LucideIcon;
  href?: string;
  guideKey?: GuideKey;
}

interface QuickStep {
  titleKey: string;
  descriptionKey: string;
  href?: string;
  guideKey?: GuideKey;
  icon: LucideIcon;
}

const SUPPORT_EMAIL = "support@makechurcheazy.com";
const COMMUNITY_URL = "https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t";
const TELEGRAM_URL = "https://t.me/makechurcheasy";

const HELP_RESOURCES: HelpResource[] = [
  {
    titleKey: "resourcePresentationTitle",
    descriptionKey: "resourcePresentationDesc",
    categoryKey: "cat_Integration",
    icon: Monitor,
    guideKey: "presentation",
  },
  {
    titleKey: "resourceDesktopTitle",
    descriptionKey: "resourceDesktopDesc",
    categoryKey: "cat_Devices",
    icon: Download,
    href: "/downloads",
  },
  {
    titleKey: "resourceSongsTitle",
    descriptionKey: "resourceSongsDesc",
    categoryKey: "cat_General",
    icon: UploadCloud,
    guideKey: "songs",
  },
  {
    titleKey: "resourceMediaTitle",
    descriptionKey: "resourceMediaDesc",
    categoryKey: "cat_General",
    icon: Image,
    guideKey: "media",
  },
  {
    titleKey: "resourceVerseAiTitle",
    descriptionKey: "resourceVerseAiDesc",
    categoryKey: "cat_Credits",
    icon: Mic,
    href: "/credits",
  },
  {
    titleKey: "resourceBillingTitle",
    descriptionKey: "resourceBillingDesc",
    categoryKey: "cat_Billing",
    icon: CreditCard,
    href: "/subscription/plans",
  },
];

const QUICK_STEPS: QuickStep[] = [
  {
    titleKey: "stepDownloadTitle",
    descriptionKey: "stepDownloadDesc",
    href: "/downloads",
    icon: Download,
  },
  {
    titleKey: "stepPairTitle",
    descriptionKey: "stepPairDesc",
    href: "/devices",
    icon: Wifi,
  },
  {
    titleKey: "stepPrepareTitle",
    descriptionKey: "stepPrepareDesc",
    guideKey: "prepare",
    icon: BookOpen,
  },
  {
    titleKey: "stepPresentTitle",
    descriptionKey: "stepPresentDesc",
    guideKey: "presentation",
    icon: Monitor,
  },
];

const GUIDE_CONTENT: Record<GuideKey, {
  titleKey: string;
  introKey: string;
  stepKeys: string[];
  icon: LucideIcon;
}> = {
  general: {
    titleKey: "guideGeneralTitle",
    introKey: "guideGeneralIntro",
    stepKeys: ["guideGeneralStepOne", "guideGeneralStepTwo", "guideGeneralStepThree", "guideGeneralStepFour"],
    icon: BookOpen,
  },
  presentation: {
    titleKey: "guidePresentationTitle",
    introKey: "guidePresentationIntro",
    stepKeys: [
      "guidePresentationStepOne",
      "guidePresentationStepTwo",
      "guidePresentationStepThree",
      "guidePresentationStepFour",
    ],
    icon: Monitor,
  },
  songs: {
    titleKey: "guideSongsTitle",
    introKey: "guideSongsIntro",
    stepKeys: ["guideSongsStepOne", "guideSongsStepTwo", "guideSongsStepThree", "guideSongsStepFour"],
    icon: UploadCloud,
  },
  media: {
    titleKey: "guideMediaTitle",
    introKey: "guideMediaIntro",
    stepKeys: ["guideMediaStepOne", "guideMediaStepTwo", "guideMediaStepThree", "guideMediaStepFour"],
    icon: Image,
  },
  prepare: {
    titleKey: "guidePrepareTitle",
    introKey: "guidePrepareIntro",
    stepKeys: ["guidePrepareStepOne", "guidePrepareStepTwo", "guidePrepareStepThree", "guidePrepareStepFour"],
    icon: Wrench,
  },
};

const FAQS: FAQ[] = [
  { questionKey: "faqQ1", answerKey: "faqA1", categoryKey: "Devices", categoryIcon: Monitor },
  { questionKey: "faqQ2", answerKey: "faqA2", categoryKey: "Credits", categoryIcon: Zap },
  { questionKey: "faqQ3", answerKey: "faqA3", categoryKey: "Integration", categoryIcon: Wifi },
  { questionKey: "faqQ4", answerKey: "faqA4", categoryKey: "Billing", categoryIcon: CreditCard },
  { questionKey: "faqQ5", answerKey: "faqA5", categoryKey: "Security", categoryIcon: Shield },
  { questionKey: "faqQ6", answerKey: "faqA6", categoryKey: "Devices", categoryIcon: Monitor },
  { questionKey: "faqQ7", answerKey: "faqA7", categoryKey: "General", categoryIcon: HelpCircle },
  { questionKey: "faqQ8", answerKey: "faqA8", categoryKey: "Account", categoryIcon: Wrench },
];

function SupportAction({
  href,
  onClick,
  className,
  children,
}: {
  href?: string;
  onClick?: () => void;
  className: string;
  children: ReactNode;
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${className} w-full text-left`}>
      {children}
    </button>
  );
}

export default function SupportPage() {
  const t = useTranslations("support");
  const [openFAQ, setOpenFAQ] = useState<string | null>(FAQS[0]?.questionKey ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGuide, setActiveGuide] = useState<GuideKey | null>(null);

  const query = searchQuery.trim().toLowerCase();
  const activeGuideContent = activeGuide ? GUIDE_CONTENT[activeGuide] : null;
  const ActiveGuideIcon = activeGuideContent?.icon;

  const resources = useMemo(
    () =>
      HELP_RESOURCES.map((resource) => ({
        ...resource,
        title: t(resource.titleKey),
        description: t(resource.descriptionKey),
        category: t(resource.categoryKey),
      })),
    [t],
  );

  const faqs = useMemo(
    () =>
      FAQS.map((faq) => ({
        ...faq,
        question: t(faq.questionKey),
        answer: t(faq.answerKey),
        category: t(`cat_${faq.categoryKey}`),
      })),
    [t],
  );

  const filteredResources = query
    ? resources.filter(
        (resource) =>
          resource.title.toLowerCase().includes(query) ||
          resource.description.toLowerCase().includes(query) ||
          resource.category.toLowerCase().includes(query),
      )
    : resources;

  const filteredFAQs = query
    ? faqs.filter(
        (faq) =>
          faq.question.toLowerCase().includes(query) ||
          faq.answer.toLowerCase().includes(query) ||
          faq.category.toLowerCase().includes(query),
      )
    : faqs;

  const hasSearchResults = filteredResources.length > 0 || filteredFAQs.length > 0;

  const contactOptions = [
    {
      icon: Mail,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-700",
      title: t("emailSupportTitle"),
      description: t("emailSupportDesc"),
      href: `mailto:${SUPPORT_EMAIL}`,
      label: SUPPORT_EMAIL,
      external: false,
    },
    {
      icon: MessageCircle,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-700",
      title: t("whatsappTitle"),
      description: t("whatsappDesc"),
      href: COMMUNITY_URL,
      label: t("joinCommunity"),
      external: true,
    },
    {
      icon: Send,
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
      title: t("telegramTitle"),
      description: t("telegramDesc"),
      href: TELEGRAM_URL,
      label: t("joinTelegram"),
      external: true,
    },
    {
      icon: BookOpen,
      iconBg: "bg-violet-50",
      iconColor: "text-violet-700",
      title: t("docsTitle"),
      description: t("docsDesc"),
      guideKey: "general" as GuideKey,
      label: t("viewDocs"),
      external: false,
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 pb-16 space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 mb-3">
            {t("eyebrow")}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-950">
            {t("title")}
          </h1>
          <p className="text-sm md:text-base text-slate-600 mt-3 leading-7">
            {t("subtitle")}
          </p>
        </div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
        >
          <Mail className="h-4 w-4" />
          {t("contactSupport")}
        </a>
      </header>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                {t("resourcesHeading")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("resourcesDesc")}
              </p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-950 placeholder:text-slate-400 outline-none transition-colors focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredResources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500 md:col-span-2">
                {t("noResourceResults")}
              </div>
            ) : (
              filteredResources.map((resource) => {
                const Icon = resource.icon;

                return (
                  <SupportAction
                    key={resource.titleKey}
                    href={resource.href}
                    onClick={resource.guideKey ? () => setActiveGuide(resource.guideKey ?? null) : undefined}
                    className="group flex min-h-[172px] flex-col rounded-xl border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-blue-200 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 ring-1 ring-slate-200">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                        {resource.category}
                      </span>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-slate-950">
                      {resource.title}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                      {resource.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700">
                      {t("openResource")}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </SupportAction>
                );
              })
            )}
          </div>

          {!hasSearchResults && (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <HelpCircle className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-800">{t("noResults")}</p>
              <p className="mt-1 text-sm text-slate-500">{t("noResultsDesc")}</p>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {t("serviceHelpHeading")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t("serviceHelpDesc")}
                </p>
              </div>
            </div>
            <ul className="mt-5 space-y-3">
              {["serviceHelpOne", "serviceHelpTwo", "serviceHelpThree", "serviceHelpFour"].map((key) => (
                <li key={key} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-950 p-5 text-white md:p-6">
            <h2 className="text-lg font-semibold">{t("contactHeading")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              {t("contactDesc")}
            </p>
            <div className="mt-5 space-y-3">
              {contactOptions.map((option) => {
                const Icon = option.icon;

                if ("guideKey" in option) {
                  return (
                    <button
                      key={option.title}
                      type="button"
                      onClick={() => setActiveGuide(option.guideKey ?? null)}
                      className="group flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${option.iconBg} ${option.iconColor}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{option.title}</span>
                        <span className="block truncate text-xs text-slate-300">{option.label}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-white" />
                    </button>
                  );
                }

                return (
                  <a
                    key={option.title}
                    href={option.href}
                    target={option.external ? "_blank" : undefined}
                    rel={option.external ? "noopener noreferrer" : undefined}
                    className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${option.iconBg} ${option.iconColor}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{option.title}</span>
                      <span className="block truncate text-xs text-slate-300">{option.label}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-white" />
                  </a>
                );
              })}
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              {t("quickStartHeading")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t("quickStartDesc")}
            </p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {QUICK_STEPS.map((step, index) => {
            const Icon = step.icon;

            return (
              <SupportAction
                key={step.titleKey}
                href={step.href}
                onClick={step.guideKey ? () => setActiveGuide(step.guideKey ?? null) : undefined}
                className="group rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-200 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-950">
                  {t(step.titleKey)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t(step.descriptionKey)}
                </p>
              </SupportAction>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-950">
            {t("faqHeading")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("faqIntro")}
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filteredFAQs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {t("noFaqResults")}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredFAQs.map((faq) => {
                const isOpen = openFAQ === faq.questionKey;
                const CategoryIcon = faq.categoryIcon;

                return (
                  <div key={faq.questionKey}>
                    <button
                      type="button"
                      onClick={() => setOpenFAQ(isOpen ? null : faq.questionKey)}
                      className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <CategoryIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-950">
                          {faq.question}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          {faq.category}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 md:pl-[4.75rem]">
                        <p className="text-sm leading-7 text-slate-700">
                          {faq.answer}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {activeGuideContent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-guide-title"
          onClick={() => setActiveGuide(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4 border-b border-slate-200 p-5 md:p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                {ActiveGuideIcon && <ActiveGuideIcon className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="support-guide-title" className="text-xl font-semibold text-slate-950">
                  {t(activeGuideContent.titleKey)}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t(activeGuideContent.introKey)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveGuide(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label={t("closeGuide")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 md:p-6">
              <h3 className="text-sm font-semibold text-slate-950">
                {t("guideStepsHeading")}
              </h3>
              <ol className="mt-4 space-y-3">
                {activeGuideContent.stepKeys.map((stepKey, index) => (
                  <li key={stepKey} className="flex gap-3 rounded-lg bg-slate-50 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6 text-slate-700">
                      {t(stepKey)}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm leading-6 text-blue-950">
                  {t("guideSupportNote")}
                </p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
                >
                  <Mail className="h-4 w-4" />
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
