"use client";

import { HardDrive, Save } from "lucide-react";
import { Card, CardHeader, Button, Input, Toggle } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["storage"];
  onChange: (data: PlatformSettings["storage"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function StorageSection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.storage");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["storage"]>) =>
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
            title={t("platformControls")}
            description={t("platformControlsDescription")}
            icon={<HardDrive className="w-4 h-4" />}
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
              label={t("enableCloudSync")}
              description={t("enableCloudSyncDescription")}
              checked={data.enableCloudSync}
              onChange={(v) => update({ enableCloudSync: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("enableCompression")}
              description={t("enableCompressionDescription")}
              checked={data.compressionEnabled}
              onChange={(v) => update({ compressionEnabled: v })}
            />
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("uploadLimits")}
            description={t("uploadLimitsDescription")}
            icon={<HardDrive className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("maxUploadSize")}
              type="number"
              min={1}
              max={5000}
              value={data.maxUploadSizeMB}
              onChange={(e) =>
                update({ maxUploadSizeMB: Number(e.target.value) })
              }
            />
            <Input
              label={t("maxBackgroundVideo")}
              type="number"
              min={1}
              max={5000}
              value={data.maximumBackgroundVideoSizeMB}
              onChange={(e) =>
                update({ maximumBackgroundVideoSizeMB: Number(e.target.value) })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("churchLogoSize")}
              type="number"
              min={1}
              max={100}
              value={data.churchLogoSizeLimitMB}
              onChange={(e) =>
                update({ churchLogoSizeLimitMB: Number(e.target.value) })
              }
            />
            <Input
              label={t("mediaLibraryQuota")}
              type="number"
              min={0}
              value={data.mediaLibraryQuotaGB}
              onChange={(e) =>
                update({ mediaLibraryQuotaGB: Number(e.target.value) })
              }
              placeholder={t("unlimitedPlaceholder")}
            />
          </div>
          <Input
            label={t("allowedFileTypes")}
            value={data.allowedFileTypes}
            onChange={(e) => update({ allowedFileTypes: e.target.value })}
            placeholder="e.g. jpg,png,mp4,pdf"
          />
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("quotasRetention")}
            description={t("quotasRetentionDescription")}
            icon={<HardDrive className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("defaultQuota")}
              type="number"
              min={0}
              value={data.defaultQuotaGB}
              onChange={(e) =>
                update({ defaultQuotaGB: Number(e.target.value) })
              }
              placeholder={t("unlimitedPlaceholder")}
            />
            <Input
              label={t("retentionDays")}
              type="number"
              min={0}
              value={data.retentionDays}
              onChange={(e) =>
                update({ retentionDays: Number(e.target.value) })
              }
              placeholder={t("indefinitePlaceholder")}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
