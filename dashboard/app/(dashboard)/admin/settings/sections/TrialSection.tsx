"use client";

import { FlaskConical, Save } from "lucide-react";
import { Card, CardHeader, Button, Input, Toggle } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["trial"];
  onChange: (data: PlatformSettings["trial"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function TrialSection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.trial");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["trial"]>) =>
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
            title={t("trialConfig")}
            description={t("trialConfigDescription")}
            icon={<FlaskConical className="w-4 h-4" />}
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
              label={t("enableTrial")}
              description={t("enableTrialDescription")}
              checked={data.enabled}
              onChange={(v) => update({ enabled: v })}
            />
          </div>

          <div className="px-6 py-4">
            <Input
              label={t("trialDuration")}
              type="number"
              min={1}
              max={90}
              value={data.defaultDurationDays}
              onChange={(e) =>
                update({ defaultDurationDays: Number(e.target.value) })
              }
            />
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("emailNotifications")}
            description={t("emailNotificationsDescription")}
            icon={<FlaskConical className="w-4 h-4" />}
          />
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <Toggle
              label={t("extensionEmails")}
              description={t("extensionEmailsDescription")}
              checked={data.sendExtensionEmails}
              onChange={(v) => update({ sendExtensionEmails: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("restartEmails")}
              description={t("restartEmailsDescription")}
              checked={data.sendRestartEmails}
              onChange={(v) => update({ sendRestartEmails: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("stopEmails")}
              description={t("stopEmailsDescription")}
              checked={data.sendStopEmails}
              onChange={(v) => update({ sendStopEmails: v })}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
