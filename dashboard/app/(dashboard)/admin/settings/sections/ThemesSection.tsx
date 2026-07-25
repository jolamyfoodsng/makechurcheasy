"use client";

import { Palette, Save } from "lucide-react";
import { Card, CardHeader, Button, Input, Select, Toggle } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["themes"];
  onChange: (data: PlatformSettings["themes"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function ThemesSection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.themes");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["themes"]>) =>
    onChange({ ...data, ...fields });

  const updateBible = (fields: Partial<PlatformSettings["themes"]["bibleDefaults"]>) =>
    update({ bibleDefaults: { ...data.bibleDefaults, ...fields } });

  const updateWorship = (fields: Partial<PlatformSettings["themes"]["worshipDefaults"]>) =>
    update({ worshipDefaults: { ...data.worshipDefaults, ...fields } });

  const updateLowerThird = (
    fields: Partial<PlatformSettings["themes"]["lowerThirdDefaults"]>
  ) => update({ lowerThirdDefaults: { ...data.lowerThirdDefaults, ...fields } });

  const updateBrandColours = (fields: Partial<PlatformSettings["themes"]["defaultBrandColours"]>) =>
    update({ defaultBrandColours: { ...data.defaultBrandColours, ...fields } });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {t("description")}
        </p>
      </div>

      {/* ── Platform Theme Defaults ── */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("platformDefaults")}
            description={t("platformDefaultsDescription")}
            icon={<Palette className="w-4 h-4" />}
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
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("defaultBibleTheme")}
              value={data.defaultBibleTheme}
              onChange={(e) => update({ defaultBibleTheme: e.target.value })}
              placeholder="e.g. bible-classic-dark"
            />
            <Input
              label={t("defaultWorshipTheme")}
              value={data.defaultWorshipTheme}
              onChange={(e) => update({ defaultWorshipTheme: e.target.value })}
              placeholder="e.g. worship-modern"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("defaultLowerThirdTheme")}
              value={data.defaultLowerThirdTheme}
              onChange={(e) => update({ defaultLowerThirdTheme: e.target.value })}
              placeholder="e.g. lt-clean-white"
            />
            <Input
              label={t("defaultAnnouncementTheme")}
              value={data.defaultAnnouncementTheme}
              onChange={(e) => update({ defaultAnnouncementTheme: e.target.value })}
              placeholder="e.g. announce-bold"
            />
          </div>
          <Input
            label={t("defaultPlatformFont")}
            value={data.defaultFont}
            onChange={(e) => update({ defaultFont: e.target.value })}
            placeholder="e.g. Inter"
          />
        </div>
      </Card>

      {/* ── Brand Colours ── */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("brandColours")}
            description={t("brandColoursDescription")}
            icon={<Palette className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1.5">
                {t("primary")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={data.defaultBrandColours.primary}
                  onChange={(e) => updateBrandColours({ primary: e.target.value })}
                  className="w-9 h-9 rounded border border-slate-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={data.defaultBrandColours.primary}
                  onChange={(e) => updateBrandColours({ primary: e.target.value })}
                  placeholder="#3b82f6"
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1.5">
                {t("secondary")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={data.defaultBrandColours.secondary}
                  onChange={(e) => updateBrandColours({ secondary: e.target.value })}
                  className="w-9 h-9 rounded border border-slate-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={data.defaultBrandColours.secondary}
                  onChange={(e) => updateBrandColours({ secondary: e.target.value })}
                  placeholder="#6366f1"
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1.5">
                {t("accent")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={data.defaultBrandColours.accent}
                  onChange={(e) => updateBrandColours({ accent: e.target.value })}
                  className="w-9 h-9 rounded border border-slate-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={data.defaultBrandColours.accent}
                  onChange={(e) => updateBrandColours({ accent: e.target.value })}
                  placeholder="#10b981"
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Bible Mode Defaults ── */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("bibleModeDefaults")}
            description={t("bibleModeDefaultsDescription")}
            icon={<Palette className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t("defaultFont")}
              value={data.bibleDefaults.font}
              onChange={(e) => updateBible({ font: e.target.value })}
              options={[
                { value: "Inter", label: t("fonts.inter") },
                { value: "Georgia", label: t("fonts.georgia") },
                { value: "Arial", label: t("fonts.arial") },
                { value: "Times New Roman", label: t("fonts.timesNewRoman") },
              ]}
            />
            <Input
              label={t("textSize")}
              type="number"
              min={12}
              max={120}
              value={data.bibleDefaults.textSize}
              onChange={(e) =>
                updateBible({ textSize: Number(e.target.value) })
              }
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label={t("textColor")}
              value={data.bibleDefaults.textColor}
              onChange={(e) => updateBible({ textColor: e.target.value })}
              placeholder="#ffffff"
            />
            <Input
              label={t("backgroundColor")}
              value={data.bibleDefaults.backgroundColor}
              onChange={(e) =>
                updateBible({ backgroundColor: e.target.value })
              }
              placeholder="#000000"
            />
            <Input
              label={t("accentColor")}
              value={data.bibleDefaults.accentColor}
              onChange={(e) => updateBible({ accentColor: e.target.value })}
              placeholder="#3b82f6"
            />
          </div>
        </div>
      </Card>

      {/* ── Worship Mode Defaults ── */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("worshipModeDefaults")}
            description={t("worshipModeDefaultsDescription")}
            icon={<Palette className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t("defaultFont")}
              value={data.worshipDefaults.font}
              onChange={(e) => updateWorship({ font: e.target.value })}
              options={[
                { value: "Inter", label: t("fonts.inter") },
                { value: "Georgia", label: t("fonts.georgia") },
                { value: "Arial", label: t("fonts.arial") },
              ]}
            />
            <Input
              label={t("textSize")}
              type="number"
              min={12}
              max={120}
              value={data.worshipDefaults.textSize}
              onChange={(e) =>
                updateWorship({ textSize: Number(e.target.value) })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("textColor")}
              value={data.worshipDefaults.textColor}
              onChange={(e) => updateWorship({ textColor: e.target.value })}
              placeholder="#ffffff"
            />
            <Input
              label={t("backgroundColor")}
              value={data.worshipDefaults.backgroundColor}
              onChange={(e) =>
                updateWorship({ backgroundColor: e.target.value })
              }
              placeholder="#000000"
            />
          </div>
          <Toggle
            label={t("enableAnimation")}
            description={t("animateDescription")}
            checked={data.worshipDefaults.animationEnabled}
            onChange={(v) => updateWorship({ animationEnabled: v })}
          />
        </div>
      </Card>

      {/* ── Lower-Third Defaults ── */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("lowerThirdDefaults")}
            description={t("lowerThirdDefaultsDescription")}
            icon={<Palette className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Input
              label={t("nameColor")}
              value={data.lowerThirdDefaults.nameColor}
              onChange={(e) =>
                updateLowerThird({ nameColor: e.target.value })
              }
              placeholder="#ffffff"
            />
            <Input
              label={t("titleColor")}
              value={data.lowerThirdDefaults.titleColor}
              onChange={(e) =>
                updateLowerThird({ titleColor: e.target.value })
              }
              placeholder="#a3a3a3"
            />
            <Input
              label={t("backgroundColor")}
              value={data.lowerThirdDefaults.backgroundColor}
              onChange={(e) =>
                updateLowerThird({ backgroundColor: e.target.value })
              }
              placeholder="#000000"
            />
          </div>
          <Input
            label={t("nameSize")}
            type="number"
            min={12}
            max={120}
            value={data.lowerThirdDefaults.nameSize}
            onChange={(e) =>
              updateLowerThird({ nameSize: Number(e.target.value) })
            }
          />
        </div>
      </Card>
    </div>
  );
}
