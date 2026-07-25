"use client";

import { RefreshCw, Lock, Save, AlertTriangle } from "lucide-react";
import { Card, CardHeader, Button, Input, Textarea, Toggle } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["appUpdates"];
  onChange: (data: PlatformSettings["appUpdates"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function AppUpdatesSection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.appUpdates");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["appUpdates"]>) =>
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
            title={t("versionPolicy")}
            description={t("versionPolicyDescription")}
            icon={<RefreshCw className="w-4 h-4" />}
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
              label={t("forceUpdates")}
              description={t("forceUpdatesDescription")}
              checked={data.forceUpdatesEnabled}
              onChange={(v) => update({ forceUpdatesEnabled: v })}
            />
          </div>

          <div className="px-6 py-4">
            <Toggle
              label={t("emergencyLock")}
              description={t("emergencyLockDescription")}
              checked={data.emergencyLock}
              onChange={(v) => update({ emergencyLock: v })}
              destructive
            />
          </div>

          {data.emergencyLock && (
            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">{t("lockDelay")}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("lockDelayDescription")}
                </p>
              </div>
              <select
                value={data.emergencyLockDelay}
                onChange={(e) =>
                  update({ emergencyLockDelay: Number(e.target.value) })
                }
                className="h-11 px-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value={0}>{t("immediate")}</option>
                <option value={12}>12 {t("hours")}</option>
                <option value={24}>24 {t("hours")}</option>
                <option value={48}>48 {t("hours")}</option>
                <option value={72}>72 {t("hours")}</option>
              </select>
            </div>
          )}

          {data.emergencyLock && (
            <div className="mx-6 my-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {data.emergencyLockDelay > 0
                ? t("emergencyLockActive", { hours: data.emergencyLockDelay })
                : t("emergencyLockActiveImmediate")}
            </div>
          )}

          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t("latestVersion")}
                value={data.latestVersion}
                onChange={(e) => update({ latestVersion: e.target.value })}
                placeholder="e.g. 2.6.0"
              />
              <Input
                label={t("minimumVersion")}
                value={data.minimumSupportedVersion}
                onChange={(e) =>
                  update({ minimumSupportedVersion: e.target.value })
                }
                placeholder="e.g. 2.0.0"
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t("gracePeriod")}
                type="number"
                min={0}
                max={720}
                value={data.gracePeriodHours}
                onChange={(e) =>
                  update({ gracePeriodHours: Number(e.target.value) })
                }
              />
              <Textarea
                label={t("updateMessage")}
                value={data.updateMessage}
                onChange={(e) => update({ updateMessage: e.target.value })}
                placeholder={t("updateMessagePlaceholder")}
                rows={4}
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Textarea
                label="Emergency Lock Message"
                value={data.emergencyLockMessage}
                onChange={(e) => update({ emergencyLockMessage: e.target.value })}
                placeholder="MakeChurchEasy is temporarily unavailable due to emergency maintenance."
                rows={4}
              />
              <Input
                label="Release Notes URL"
                value={data.releaseNotesUrl}
                onChange={(e) => update({ releaseNotesUrl: e.target.value })}
                placeholder="https://makechurcheasy.creatorstudioslabs.stream/downloads/release-notes"
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Windows Download URL"
                value={data.windowsDownloadUrl}
                onChange={(e) => update({ windowsDownloadUrl: e.target.value })}
                placeholder="https://makechurcheasy.creatorstudioslabs.stream/downloads/windows"
              />
              <Input
                label="Mac Download URL"
                value={data.macDownloadUrl}
                onChange={(e) => update({ macDownloadUrl: e.target.value })}
                placeholder="https://makechurcheasy.creatorstudioslabs.stream/downloads/mac"
              />
              <Input
                label="Linux Download URL"
                value={data.linuxDownloadUrl}
                onChange={(e) => update({ linuxDownloadUrl: e.target.value })}
                placeholder="https://makechurcheasy.creatorstudioslabs.stream/downloads/linux"
              />
            </div>
          </div>

        </div>
      </Card>
    </div>
  );
}
