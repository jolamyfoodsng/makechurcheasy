"use client";

import { Save, ShieldAlert } from "lucide-react";
import { Button, Card, CardHeader, Toggle } from "@/components/ui";
import type { PlatformSettings } from "../types";

interface Props {
  system: PlatformSettings["system"];
  onSystemChange: (data: PlatformSettings["system"]) => void;
  onSaveSystem: () => Promise<void>;
  savingSystem: boolean;
}

export function SystemControlsSection({
  system,
  onSystemChange,
  onSaveSystem,
  savingSystem,
}: Props) {
  const updateSystem = (fields: Partial<PlatformSettings["system"]>) =>
    onSystemChange({ ...system, ...fields });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">System Controls</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Operational controls that immediately affect registration and billing.
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

    </div>
  );
}
