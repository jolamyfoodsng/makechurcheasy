"use client";

import { useEffect, useState } from "react";
import { Coins, Save, Loader2 } from "lucide-react";
import { Card, CardHeader, Button, Input } from "@/components/ui";
import { useTranslations } from "next-intl";

interface PlanConfig {
  plans: Record<string, { credits: number }>;
  creditCosts: Array<{ name: string; cost: number; unit: string; description?: string }>;
}

const COST_NAME_MAP: Record<string, string> = {
  translation: "Live Translation",
  speechToScripture: "Speech-to-Scripture",
  aiSummary: "AI Summary",
};

export function CreditsSection() {
  const t = useTranslations("admin.settings.credits");
  const tc = useTranslations("common");
  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPlanConfig();
  }, []);

  const fetchPlanConfig = async () => {
    try {
      const res = await fetch("/api/admin/plan-config");
      if (res.ok) {
        const data = await res.json();
        setPlanConfig(data);
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const updatePlanCredit = (tier: string, value: number) => {
    if (!planConfig) return;
    setPlanConfig({
      ...planConfig,
      plans: {
        ...planConfig.plans,
        [tier]: { ...planConfig.plans[tier], credits: value },
      },
    });
  };

  const updateCreditCost = (key: string, value: number) => {
    if (!planConfig) return;
    const costName = COST_NAME_MAP[key];
    if (!costName) return;
    setPlanConfig({
      ...planConfig,
      creditCosts: planConfig.creditCosts.map((c) =>
        c.name === costName ? { ...c, cost: value } : c
      ),
    });
  };

  const getCost = (key: string): number => {
    if (!planConfig) return 0;
    const costName = COST_NAME_MAP[key];
    return planConfig.creditCosts.find((c) => c.name === costName)?.cost ?? 0;
  };

  const handleSave = async () => {
    if (!planConfig) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/plan-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plans: planConfig.plans,
          creditCosts: planConfig.creditCosts,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      // Show error toast in future
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const plans = planConfig?.plans || {};

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
            title={t("planCredits")}
            description={t("planCreditsDescription")}
            icon={<Coins className="w-4 h-4" />}
            action={
              <Button
                size="sm"
                loading={saving}
                onClick={handleSave}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                {tc("save")}
              </Button>
            }
          />
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t("freePlanCredits")}
              type="number"
              min={0}
              value={plans.free?.credits ?? 0}
              onChange={(e) => updatePlanCredit("free", Number(e.target.value))}
            />
            <Input
              label={t("trialCredits")}
              type="number"
              min={0}
              value={plans.trial?.credits ?? 0}
              onChange={(e) => updatePlanCredit("trial", Number(e.target.value))}
            />
            <Input
              label={t("basicPlanCredits")}
              type="number"
              min={0}
              value={plans.basic?.credits ?? 0}
              onChange={(e) => updatePlanCredit("basic", Number(e.target.value))}
            />
            <Input
              label={t("growthPlanCredits")}
              type="number"
              min={0}
              value={plans.growth?.credits ?? 0}
              onChange={(e) => updatePlanCredit("growth", Number(e.target.value))}
            />
            <Input
              label={t("proPlanCredits")}
              type="number"
              value={plans.pro?.credits ?? -1}
              onChange={(e) => updatePlanCredit("pro", Number(e.target.value))}
              placeholder={t("unlimitedHint")}
            />
          </div>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("featureCosts")}
            description={t("featureCostsDescription")}
            icon={<Coins className="w-4 h-4" />}
          />
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-3 gap-4">
            <Input
              label={t("translationCost")}
              type="number"
              min={0}
              value={getCost("translation")}
              onChange={(e) => updateCreditCost("translation", Number(e.target.value))}
            />
            <Input
              label={t("speechToScriptureCost")}
              type="number"
              min={0}
              value={getCost("speechToScripture")}
              onChange={(e) => updateCreditCost("speechToScripture", Number(e.target.value))}
            />
            <Input
              label={t("aiSummaryCost")}
              type="number"
              min={0}
              value={getCost("aiSummary")}
              onChange={(e) => updateCreditCost("aiSummary", Number(e.target.value))}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
