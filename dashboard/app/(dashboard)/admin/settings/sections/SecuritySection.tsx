"use client";

import { useState } from "react";
import { Lock, Save, Shield } from "lucide-react";
import { Card, CardHeader, Button, Input, Toggle, ConfirmDialog } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["security"];
  onChange: (data: PlatformSettings["security"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function SecuritySection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.security");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["security"]>) =>
    onChange({ ...data, ...fields });

  const [confirmDialog, setConfirmDialog] = useState<string | null>(null);

  const handleToggle = (field: keyof PlatformSettings["security"]) => {
    if (field === "maintenanceMode" && !data.maintenanceMode) {
      setConfirmDialog("maintenanceMode");
    } else {
      update({ [field]: !data[field] });
    }
  };

  const handleForceLogout = () => {
    setConfirmDialog("forceLogout");
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
            title={t("internetVerification")}
            description={t("internetVerificationDescription")}
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
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <Toggle
              label={t("internetVerificationEnabled")}
              description={t("internetVerificationEnabledDescription")}
              checked={data.internetVerificationEnabled}
              onChange={(v) => update({ internetVerificationEnabled: v })}
            />
          </div>
          {data.internetVerificationEnabled && (
            <div className="px-6 py-4">
              <Input
                label={t("maxOfflineDays")}
                type="number"
                min={7}
                max={365}
                value={data.maxOfflineDays}
                onChange={(e) =>
                  update({ maxOfflineDays: Number(e.target.value) })
                }
              />
              <p className="text-xs text-slate-500 mt-1">
                {t("maxOfflineDaysDescription")}
              </p>
            </div>
          )}
          <div className="px-6 py-4">
            <Input
              label={t("verificationInterval")}
              type="number"
              min={1}
              max={168}
              value={data.verificationIntervalHours}
              onChange={(e) =>
                update({ verificationIntervalHours: Number(e.target.value) })
              }
            />
            <p className="text-xs text-slate-500 mt-1">
              {t("verificationIntervalDescription")}
            </p>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("maintenanceSessions")}
            description={t("maintenanceSessionsDescription")}
            icon={<Lock className="w-4 h-4" />}
          />
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <Toggle
              label={t("maintenanceMode")}
              description={t("maintenanceModeDescription")}
              checked={data.maintenanceMode}
              onChange={() => handleToggle("maintenanceMode")}
              destructive
            />
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {t("forceLogout")}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("forceLogoutDescription")}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleForceLogout}
              >
                {t("forceLogoutButton")}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDialog === "maintenanceMode"}
        title={t("enableMaintenanceConfirm")}
        description={t("enableMaintenanceDescription")}
        confirmLabel={tc("yes")}
        destructive
        onConfirm={() => {
          update({ maintenanceMode: true });
          setConfirmDialog(null);
        }}
        onCancel={() => setConfirmDialog(null)}
      />

      <ConfirmDialog
        open={confirmDialog === "forceLogout"}
        title={t("forceLogoutConfirm")}
        description={t("forceLogoutConfirmDescription")}
        confirmLabel={t("forceLogoutButton")}
        destructive
        onConfirm={() => {
          // TODO: API call to force logout
          setConfirmDialog(null);
        }}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
