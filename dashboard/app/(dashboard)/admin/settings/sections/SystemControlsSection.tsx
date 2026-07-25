"use client";

import { Flag, Save, ShieldAlert } from "lucide-react";
import { Button, Card, CardHeader, Toggle } from "@/components/ui";
import type { PlatformSettings } from "../types";

interface Props {
  system: PlatformSettings["system"];
  featureFlags: PlatformSettings["featureFlags"];
  onSystemChange: (data: PlatformSettings["system"]) => void;
  onFeatureFlagsChange: (data: PlatformSettings["featureFlags"]) => void;
  onSaveSystem: () => Promise<void>;
  onSaveFeatureFlags: () => Promise<void>;
  savingSystem: boolean;
  savingFeatureFlags: boolean;
}

export function SystemControlsSection({
  system,
  featureFlags,
  onSystemChange,
  onFeatureFlagsChange,
  onSaveSystem,
  onSaveFeatureFlags,
  savingSystem,
  savingFeatureFlags,
}: Props) {
  const updateSystem = (fields: Partial<PlatformSettings["system"]>) =>
    onSystemChange({ ...system, ...fields });

  const updateFlags = (fields: Partial<PlatformSettings["featureFlags"]>) =>
    onFeatureFlagsChange({ ...featureFlags, ...fields });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">System Controls</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Operational controls that immediately affect registration, billing, and feature access.
        </p>
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title="Platform access"
            description="Disable high-risk entry points without deploying code."
            icon={<ShieldAlert className="w-4 h-4" />}
            action={
              <Button
                size="sm"
                loading={savingSystem}
                onClick={onSaveSystem}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                Save
              </Button>
            }
          />
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <Toggle
              label="Allow registrations"
              description="When disabled, new account creation is rejected by the API."
              checked={system.allowRegistrations}
              onChange={(v) => updateSystem({ allowRegistrations: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label="Allow payments"
              description="When disabled, payment initialization is rejected by the API."
              checked={system.allowPayments}
              onChange={(v) => updateSystem({ allowPayments: v })}
            />
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title="Feature flags"
            description="Runtime flags consumed by apps through /api/system/settings."
            icon={<Flag className="w-4 h-4" />}
            action={
              <Button
                size="sm"
                loading={savingFeatureFlags}
                onClick={onSaveFeatureFlags}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                Save
              </Button>
            }
          />
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <Toggle
              label="Remote Presentation Beta"
              checked={featureFlags.remotePresentationBeta}
              onChange={(v) => updateFlags({ remotePresentationBeta: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label="Cloud Sync Beta"
              checked={featureFlags.cloudSyncBeta}
              onChange={(v) => updateFlags({ cloudSyncBeta: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label="New Translation Engine"
              checked={featureFlags.newTranslationEngine}
              onChange={(v) => updateFlags({ newTranslationEngine: v })}
            />
          </div>
          <div className="px-6 py-4">
            <Toggle
              label="New Mobile App"
              checked={featureFlags.newMobileApp}
              onChange={(v) => updateFlags({ newMobileApp: v })}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
