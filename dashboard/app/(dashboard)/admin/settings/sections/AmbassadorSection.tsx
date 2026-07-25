"use client";

import { Award, Save } from "lucide-react";
import { Card, CardHeader, Button, Input, Toggle } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["ambassador"];
  onChange: (data: PlatformSettings["ambassador"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function AmbassadorSection({
  data,
  onChange,
  onSave,
  saving,
}: Props) {
  const t = useTranslations("admin.settings.ambassador");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["ambassador"]>) =>
    onChange({ ...data, ...fields });

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
            title={t("ambassadorConfig")}
            description={t("ambassadorConfigDescription")}
            icon={<Award className="w-4 h-4" />}
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
              label={t("enableProgram")}
              description={t("enableProgramDescription")}
              checked={data.enabled}
              onChange={(v) => update({ enabled: v })}
            />
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t("creditsPerAmbassador")}
                type="number"
                min={0}
                value={data.creditsPerAmbassador}
                onChange={(e) =>
                  update({ creditsPerAmbassador: Number(e.target.value) })
                }
              />
              <Input
                label={t("ambassadorDuration")}
                type="number"
                min={0}
                value={data.defaultAmbassadorDurationDays}
                onChange={(e) =>
                  update({ defaultAmbassadorDurationDays: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <Toggle
              label={t("autoExpiry")}
              description={t("autoExpiryDescription")}
              checked={data.autoExpiry}
              onChange={(v) => update({ autoExpiry: v })}
            />
          </div>

          <div className="px-6 py-4">
            <Toggle
              label={t("sendWelcomeEmail")}
              description={t("sendWelcomeEmailDescription")}
              checked={data.sendWelcomeEmail}
              onChange={(v) => update({ sendWelcomeEmail: v })}
            />
          </div>

          <div className="px-6 py-4">
            <Input
              label={t("badgeText")}
              value={data.badgeText}
              onChange={(e) => update({ badgeText: e.target.value })}
              placeholder="e.g. Ambassador"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
