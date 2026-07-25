"use client";

import { Shield, Save } from "lucide-react";
import { Card, CardHeader, Button, Input } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["authentication"];
  onChange: (data: PlatformSettings["authentication"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function AuthenticationSection({
  data,
  onChange,
  onSave,
  saving,
}: Props) {
  const t = useTranslations("admin.settings.authentication");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["authentication"]>) =>
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
            title={t("deviceLimits")}
            description={t("deviceLimitsDescription")}
            icon={<Shield className="w-4 h-4" />}
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
        <div className="px-6 py-4">
          <Input
            label={t("maxDevices")}
            type="number"
            min={1}
            max={20}
            value={data.maxDevicesPerUser}
            onChange={(e) =>
              update({
                maxDevicesPerUser: Number(e.target.value),
              })
            }
          />
        </div>
      </Card>
    </div>
  );
}
