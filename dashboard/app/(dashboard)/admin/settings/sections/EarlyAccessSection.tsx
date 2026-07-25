"use client";

import { Save, Sparkles } from "lucide-react";
import { Button, Card, CardHeader, Input, Textarea, Toggle } from "@/components/ui";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["earlyAccess"];
  onChange: (data: PlatformSettings["earlyAccess"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

function parseList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function EarlyAccessSection({ data, onChange, onSave, saving }: Props) {
  const update = (fields: Partial<PlatformSettings["earlyAccess"]>) =>
    onChange({ ...data, ...fields });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Early Access Lifetime</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure the one-time lifetime Pro offer for selected early users.
        </p>
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title="Lifetime offer"
            description="This controls checkout eligibility. Ambassador gifts stay separate."
            icon={<Sparkles className="w-4 h-4" />}
            action={
              <Button
                size="sm"
                loading={saving}
                onClick={onSave}
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
              label="Enable lifetime offer"
              description="Eligible users will see a one-time lifetime Pro payment option."
              checked={data.enabled}
              onChange={(v) => update({ enabled: v })}
            />
          </div>

          <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Offer name"
              value={data.offerName}
              onChange={(e) => update({ offerName: e.target.value })}
            />
            <Input
              label="Plan granted"
              value="Pro"
              disabled
            />
            <Input
              label="NGN one-time price"
              type="number"
              min={0}
              value={data.priceNGN}
              onChange={(e) => update({ priceNGN: Number(e.target.value) })}
            />
            <Input
              label="USD one-time price"
              type="number"
              min={0}
              value={data.priceUSD}
              onChange={(e) => update({ priceUSD: Number(e.target.value) })}
            />
          </div>

          <div className="px-6 py-4">
            <Textarea
              label="Offer description"
              value={data.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="px-6 py-4">
            <Toggle
              label="Use registration date eligibility"
              description="Allow users whose account creation date falls inside the configured window."
              checked={data.allowRegistrationDateEligibility}
              onChange={(v) => update({ allowRegistrationDateEligibility: v })}
            />
          </div>

          <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Registered on/after"
              type="date"
              value={data.registeredAfter ? data.registeredAfter.slice(0, 10) : ""}
              onChange={(e) => update({ registeredAfter: e.target.value })}
            />
            <Input
              label="Registered on/before"
              type="date"
              value={data.registeredBefore ? data.registeredBefore.slice(0, 10) : ""}
              onChange={(e) => update({ registeredBefore: e.target.value })}
            />
          </div>

          <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label="Eligible user IDs"
              value={(data.eligibleUserIds || []).join("\n")}
              onChange={(e) => update({ eligibleUserIds: parseList(e.target.value) })}
              placeholder="One Mongo user ID per line"
              rows={5}
            />
            <Textarea
              label="Eligible emails"
              value={(data.eligibleEmails || []).join("\n")}
              onChange={(e) => update({ eligibleEmails: parseList(e.target.value) })}
              placeholder="name@example.com"
              rows={5}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
