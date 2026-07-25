"use client";

import { Monitor, Save } from "lucide-react";
import { Card, CardHeader, Button, Input, Toggle } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["obs"];
  onChange: (data: PlatformSettings["obs"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function OBSSettingsSection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.obsIntegration");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["obs"]>) =>
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
            icon={<Monitor className="w-4 h-4" />}
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
              label={t("enableOBS")}
              description={t("enableOBSDescription")}
              checked={data.enableOBSIntegration}
              onChange={(v) => update({ enableOBSIntegration: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("requireAuth")}
              description={t("requireAuthDescription")}
              checked={data.requireOBSAuthentication}
              onChange={(v) => update({ requireOBSAuthentication: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("allowAutoDiscovery")}
              description={t("allowAutoDiscoveryDescription")}
              checked={data.allowAutoDiscovery}
              onChange={(v) => update({ allowAutoDiscovery: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("enableDock")}
              description={t("enableDockDescription")}
              checked={data.enableOBSDock}
              onChange={(v) => update({ enableOBSDock: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label={t("enableMultiview")}
              description={t("enableMultiviewDescription")}
              checked={data.enableMultiview}
              onChange={(v) => update({ enableMultiview: v })}
            />
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("connection")}
            description={t("connectionDescription")}
            icon={<Monitor className="w-4 h-4" />}
          />
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t("websocketPort")}
                type="number"
                min={1024}
                max={65535}
                value={data.websocketPort}
                onChange={(e) =>
                  update({ websocketPort: Number(e.target.value) })
                }
              />
              <Input
                label={t("reconnectInterval")}
                type="number"
                min={1000}
                max={30000}
                value={data.reconnectIntervalMs}
                onChange={(e) =>
                  update({ reconnectIntervalMs: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t("minOBSVersion")}
                value={data.minSupportedOBSVersion}
                onChange={(e) => update({ minSupportedOBSVersion: e.target.value })}
                placeholder="e.g. 28.0.0"
              />
              <Input
                label={t("minWebSocketVersion")}
                value={data.minSupportedWebSocketVersion}
                onChange={(e) => update({ minSupportedWebSocketVersion: e.target.value })}
                placeholder="e.g. 5.0.0"
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
