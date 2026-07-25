"use client";

import { Sparkles, Save, Plus, X } from "lucide-react";
import { Card, CardHeader, Button, Input, Toggle, Select } from "@/components/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["ai"];
  onChange: (data: PlatformSettings["ai"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function AISettingsSection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.aiSettings");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["ai"]>) =>
    onChange({ ...data, ...fields });

  const updateFeatureToggle = (
    feature: keyof PlatformSettings["ai"]["featureToggles"],
    value: boolean
  ) =>
    update({
      featureToggles: { ...data.featureToggles, [feature]: value },
    });

  const [newLanguage, setNewLanguage] = useState("");

  const addLanguage = () => {
    const lang = newLanguage.trim().toLowerCase();
    if (lang && !data.supportedLanguages.includes(lang)) {
      update({ supportedLanguages: [...data.supportedLanguages, lang] });
      setNewLanguage("");
    }
  };

  const removeLanguage = (lang: string) => {
    update({ supportedLanguages: data.supportedLanguages.filter((l) => l !== lang) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {t("description")}
        </p>
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("aiFeatures")}
            description={t("aiFeaturesDescription")}
            icon={<Sparkles className="w-4 h-4" />}
            action={
              <Button
                size="sm"
                loading={saving}
                onClick={onSave}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                {tc("save")}
              </Button>
            }
          />
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <Toggle
              label={t("scriptureTranslation")}
              description={t("scriptureTranslationDescription")}
              checked={data.featureToggles.scriptureTranslation}
              onChange={(v) => updateFeatureToggle("scriptureTranslation", v)}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("speechToScripture")}
              description={t("speechToScriptureDescription")}
              checked={data.featureToggles.speechToScripture}
              onChange={(v) => updateFeatureToggle("speechToScripture", v)}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("aiSummaries")}
              description={t("aiSummariesDescription")}
              checked={data.featureToggles.aiSummaries}
              onChange={(v) => updateFeatureToggle("aiSummaries", v)}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("sermonNotes")}
              description={t("sermonNotesDescription")}
              checked={data.featureToggles.sermonNotes}
              onChange={(v) => updateFeatureToggle("sermonNotes", v)}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("aiAssistant")}
              description={t("aiAssistantDescription")}
              checked={data.featureToggles.aiAssistant}
              onChange={(v) => updateFeatureToggle("aiAssistant", v)}
            />
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("providerLimits")}
            description={t("providerLimitsDescription")}
            icon={<Sparkles className="w-4 h-4" />}
          />
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Select
                label={t("aiProvider")}
                value={data.provider}
                onChange={(e) => update({ provider: e.target.value })}
                options={[
                  { value: "openai", label: t("openai") },
                  { value: "anthropic", label: t("anthropic") },
                  { value: "google", label: t("googleGemini") },
                ]}
              />
              <Input
                label={t("dailyAILimit")}
                type="number"
                min={0}
                value={data.dailyRequestLimit}
                onChange={(e) =>
                  update({ dailyRequestLimit: Number(e.target.value) })
                }
                placeholder={t("unlimitedHint")}
              />
            </div>
          </div>
          <div className="px-6 py-4">
            <Input
              label={t("maxTranslationMinutes")}
              type="number"
              min={0}
              value={data.maximumTranslationMinutes}
              onChange={(e) =>
                update({ maximumTranslationMinutes: Number(e.target.value) })
              }
              placeholder={t("unlimitedHint")}
            />
          </div>
          <div className="px-6 py-4">
            <p className="text-sm font-medium text-slate-900 mb-2">{t("supportedLanguages")}</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {data.supportedLanguages.map((lang) => (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700"
                >
                  {lang}
                  <button
                    type="button"
                    onClick={() => removeLanguage(lang)}
                    className="ml-0.5 hover:text-blue-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {data.supportedLanguages.length === 0 && (
                <span className="text-xs text-slate-400">{t("noLanguagesConfigured")}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLanguage}
                onChange={(e) => setNewLanguage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLanguage()}
                placeholder={t("languagePlaceholder")}
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Button size="sm" onClick={addLanguage} icon={<Plus className="w-3.5 h-3.5" />}>
                {t("add")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
