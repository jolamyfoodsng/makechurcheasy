"use client";

import { BarChart3, Save } from "lucide-react";
import { Card, CardHeader, Button, Toggle } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["analytics"];
  onChange: (data: PlatformSettings["analytics"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function AnalyticsSection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.analytics");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["analytics"]>) =>
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
            title={t("trackingTelemetry")}
            description={t("trackingTelemetryDescription")}
            icon={<BarChart3 className="w-4 h-4" />}
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
              label={t("usageAnalytics")}
              description={t("usageAnalyticsDescription")}
              checked={data.usageAnalytics}
              onChange={(v) => update({ usageAnalytics: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("crashReporting")}
              description={t("crashReportingDescription")}
              checked={data.crashReporting}
              onChange={(v) => update({ crashReporting: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("errorTracking")}
              description={t("errorTrackingDescription")}
              checked={data.errorTracking}
              onChange={(v) => update({ errorTracking: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("performanceMonitoring")}
              description={t("performanceMonitoringDescription")}
              checked={data.performanceMonitoring}
              onChange={(v) => update({ performanceMonitoring: v })}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
