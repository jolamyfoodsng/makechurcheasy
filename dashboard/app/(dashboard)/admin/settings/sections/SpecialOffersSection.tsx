"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, Select, Textarea, Toggle } from "@/components/ui";
import type { PlanConfig, SpecialOfferConfig } from "@/lib/planConfigService";

const EMPTY_CONFIG: Partial<PlanConfig> = {
  specialOffers: [],
};

function createOffer(): SpecialOfferConfig {
  const now = new Date().toISOString();
  return {
    id: `offer-${Date.now()}`,
    enabled: false,
    name: "Growth one-time offer",
    description: "A one-time Growth purchase for eligible returning churches.",
    badgeText: "One-time offer",
    ctaText: "Buy Once",
    kind: "one_time",
    plan: "growth",
    billingCycle: "lifetime",
    price: { NGN: 50000, USD: 99 },
    discountPercent: null,
    discountDurationMonths: null,
    startsAt: null,
    endsAt: null,
    eligibility: {
      minAccountAgeDays: 90,
      maxAccountAgeDays: null,
      allowedPlans: ["free", "basic", "trial"],
      eligibleUserIds: [],
      eligibleEmails: [],
      includeTrialUsers: true,
      excludeActivePaidUsers: false,
    },
    sortOrder: 10,
    createdAt: now,
    updatedAt: now,
  };
}

function parseList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listValue(value?: string[]) {
  return (value || []).join("\n");
}

function toDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function clampNumber(value: string, fallback: number | null = null) {
  if (value.trim() === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function SpecialOffersSection() {
  const [config, setConfig] = useState<Partial<PlanConfig>>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const offers = useMemo(() => config.specialOffers || [], [config.specialOffers]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/plan-config", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load special offers");
        if (!cancelled) {
          setConfig(data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load special offers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateOffer = (index: number, patch: Partial<SpecialOfferConfig>) => {
    setSaved(false);
    setConfig((prev) => {
      const nextOffers = [...(prev.specialOffers || [])];
      nextOffers[index] = {
        ...nextOffers[index],
        ...patch,
        updatedAt: new Date().toISOString(),
      } as SpecialOfferConfig;
      return { ...prev, specialOffers: nextOffers };
    });
  };

  const addOffer = () => {
    setSaved(false);
    setConfig((prev) => ({
      ...prev,
      specialOffers: [...(prev.specialOffers || []), createOffer()],
    }));
  };

  const removeOffer = (index: number) => {
    setSaved(false);
    setConfig((prev) => ({
      ...prev,
      specialOffers: (prev.specialOffers || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/plan-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialOffers: offers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save special offers");
      setConfig(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save special offers");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Special Offers</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Create one-time purchases and conditional checkout prices from admin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={addOffer} icon={<Plus className="h-3.5 w-3.5" />}>
            Add Offer
          </Button>
          <Button size="sm" onClick={save} loading={saving} icon={<Save className="h-3.5 w-3.5" />}>
            Save
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-400">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400">
          Special offers saved.
        </div>
      )}

      {offers.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">No special offers yet</h3>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              Add an offer to show eligible users a one-time purchase or a discounted checkout price.
            </p>
            <Button className="mt-5" size="sm" onClick={addOffer} icon={<Plus className="h-3.5 w-3.5" />}>
              Add Offer
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {offers.map((offer, index) => {
            const eligibility = offer.eligibility || {};
            return (
              <Card key={offer.id || index} padding="none">
                <div className="border-b border-slate-100 px-6 py-4">
                  <CardHeader
                    title={offer.name || "Special offer"}
                    description={offer.kind === "one_time" ? "Pay once, grant lifetime access." : "Discount the first checkout and optional renewals."}
                    icon={<Sparkles className="h-4 w-4" />}
                    action={
                      <div className="flex items-center gap-3">
                        <Badge variant={offer.enabled ? "success" : "default"} size="sm">
                          {offer.enabled ? "Enabled" : "Off"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOffer(index)}
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                        >
                          Remove
                        </Button>
                      </div>
                    }
                  />
                </div>

                <div className="divide-y divide-slate-100">
                  <div className="px-6 py-4">
                    <Toggle
                      label="Show this offer"
                      description="When enabled, eligible users can see this offer on the pricing page."
                      checked={offer.enabled}
                      onChange={(value) => updateOffer(index, { enabled: value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
                    <Input
                      label="Offer name"
                      required
                      value={offer.name}
                      onChange={(event) => updateOffer(index, { name: event.target.value })}
                      placeholder="Enter offer name"
                    />
                    <Input
                      label="Offer ID"
                      required
                      value={offer.id}
                      onChange={(event) => updateOffer(index, { id: event.target.value })}
                      placeholder="growth-one-time-returning"
                    />
                    <Input
                      label="Badge text"
                      value={offer.badgeText || ""}
                      onChange={(event) => updateOffer(index, { badgeText: event.target.value })}
                      placeholder="One-time offer"
                    />
                    <Input
                      label="Button text"
                      value={offer.ctaText || ""}
                      onChange={(event) => updateOffer(index, { ctaText: event.target.value })}
                      placeholder="Buy Once"
                    />
                    <div className="md:col-span-2">
                      <Textarea
                        label="Description"
                        value={offer.description}
                        onChange={(event) => updateOffer(index, { description: event.target.value })}
                        placeholder="Tell the user what this offer unlocks"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-3">
                    <Select
                      label="Offer type"
                      value={offer.kind}
                      onChange={(event) => {
                        const kind = event.target.value as SpecialOfferConfig["kind"];
                        updateOffer(index, {
                          kind,
                          billingCycle: kind === "one_time" ? "lifetime" : "monthly",
                        });
                      }}
                      options={[
                        { value: "one_time", label: "One-time purchase" },
                        { value: "discounted_subscription", label: "Discounted subscription" },
                      ]}
                    />
                    <Select
                      label="Plan granted"
                      value={offer.plan}
                      onChange={(event) => updateOffer(index, { plan: event.target.value as "basic" | "growth" })}
                      options={[
                        { value: "basic", label: "Basic" },
                        { value: "growth", label: "Growth" },
                      ]}
                    />
                    <Select
                      label="Billing"
                      value={offer.billingCycle}
                      disabled={offer.kind === "one_time"}
                      onChange={(event) => updateOffer(index, { billingCycle: event.target.value as SpecialOfferConfig["billingCycle"] })}
                      options={[
                        { value: offer.kind === "one_time" ? "lifetime" : "monthly", label: offer.kind === "one_time" ? "Lifetime" : "Monthly" },
                        ...(offer.kind === "one_time" ? [] : [{ value: "yearly", label: "Yearly" }]),
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-4">
                    <Input
                      label="NGN price"
                      type="number"
                      min={0}
                      value={offer.price?.NGN ?? ""}
                      onChange={(event) => updateOffer(index, { price: { ...(offer.price || {}), NGN: clampNumber(event.target.value) ?? undefined } })}
                    />
                    <Input
                      label="USD price"
                      type="number"
                      min={0}
                      value={offer.price?.USD ?? ""}
                      onChange={(event) => updateOffer(index, { price: { ...(offer.price || {}), USD: clampNumber(event.target.value) ?? undefined } })}
                    />
                    <Input
                      label="Discount %"
                      type="number"
                      min={0}
                      max={95}
                      disabled={offer.kind === "one_time"}
                      value={offer.discountPercent ?? ""}
                      onChange={(event) => updateOffer(index, { discountPercent: clampNumber(event.target.value) })}
                    />
                    <Input
                      label="Discount months"
                      type="number"
                      min={1}
                      max={60}
                      disabled={offer.kind === "one_time"}
                      value={offer.discountDurationMonths ?? ""}
                      onChange={(event) => updateOffer(index, { discountDurationMonths: clampNumber(event.target.value, null) })}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-3">
                    <Input
                      label="Starts"
                      type="datetime-local"
                      value={toDateTimeInput(offer.startsAt)}
                      onChange={(event) => updateOffer(index, { startsAt: fromDateTimeInput(event.target.value) })}
                    />
                    <Input
                      label="Ends"
                      type="datetime-local"
                      value={toDateTimeInput(offer.endsAt)}
                      onChange={(event) => updateOffer(index, { endsAt: fromDateTimeInput(event.target.value) })}
                    />
                    <Input
                      label="Sort order"
                      type="number"
                      value={offer.sortOrder ?? index + 1}
                      onChange={(event) => updateOffer(index, { sortOrder: clampNumber(event.target.value, index + 1) || index + 1 })}
                    />
                  </div>

                  <div className="space-y-4 px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      Eligibility Conditions
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <Input
                        label="Minimum account age"
                        type="number"
                        min={0}
                        value={eligibility.minAccountAgeDays ?? ""}
                        onChange={(event) => updateOffer(index, {
                          eligibility: { ...eligibility, minAccountAgeDays: clampNumber(event.target.value) },
                        })}
                      />
                      <Input
                        label="Maximum account age"
                        type="number"
                        min={0}
                        value={eligibility.maxAccountAgeDays ?? ""}
                        onChange={(event) => updateOffer(index, {
                          eligibility: { ...eligibility, maxAccountAgeDays: clampNumber(event.target.value) },
                        })}
                      />
                      <div className="md:col-span-2">
                        <Input
                          label="Allowed plans"
                          value={listValue(eligibility.allowedPlans)}
                          onChange={(event) => updateOffer(index, {
                            eligibility: { ...eligibility, allowedPlans: parseList(event.target.value) },
                          })}
                          placeholder="free, basic, trial"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Toggle
                        label="Include trial users"
                        description="Trial accounts can qualify if the other conditions match."
                        checked={eligibility.includeTrialUsers !== false}
                        onChange={(value) => updateOffer(index, {
                          eligibility: { ...eligibility, includeTrialUsers: value },
                        })}
                      />
                      <Toggle
                        label="Exclude active paid users"
                        description="Hide this from users already on Basic or Growth."
                        checked={Boolean(eligibility.excludeActivePaidUsers)}
                        onChange={(value) => updateOffer(index, {
                          eligibility: { ...eligibility, excludeActivePaidUsers: value },
                        })}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Textarea
                        label="Eligible emails"
                        value={listValue(eligibility.eligibleEmails)}
                        onChange={(event) => updateOffer(index, {
                          eligibility: { ...eligibility, eligibleEmails: parseList(event.target.value) },
                        })}
                        placeholder="name@example.com"
                        rows={4}
                      />
                      <Textarea
                        label="Eligible user IDs"
                        value={listValue(eligibility.eligibleUserIds)}
                        onChange={(event) => updateOffer(index, {
                          eligibility: { ...eligibility, eligibleUserIds: parseList(event.target.value) },
                        })}
                        placeholder="Mongo user ID"
                        rows={4}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
