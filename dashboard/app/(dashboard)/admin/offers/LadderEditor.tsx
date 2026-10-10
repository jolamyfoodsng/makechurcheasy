"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  type OfferLadder,
  type OfferPlan,
  type OfferRung,
  type RewardMode,
  describeRung,
  newRung,
  rewardModeOf,
  withRewardMode,
} from "./types";

const MODES: Array<{ value: RewardMode; label: string; hint: string }> = [
  { value: "discount", label: "Discount", hint: "Percent off when they subscribe" },
  { value: "free", label: "Free Basic", hint: "Free days of Basic, no card" },
  { value: "free_then_discount", label: "Free, then discount", hint: "Free Basic days, then a discount to keep it" },
  { value: "trial", label: "Trial days", hint: "Extra days added to the free trial" },
];

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="adm-label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="adm-input"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || 0)))}
        />
        {suffix ? <span className="whitespace-nowrap text-[12px] text-[var(--mce-admin-text-muted)]">{suffix}</span> : null}
      </div>
      {hint ? <p className="adm-hint">{hint}</p> : null}
    </div>
  );
}

function RungEditor({
  index,
  rung,
  ladder,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  rung: OfferRung;
  ladder: OfferLadder;
  canRemove: boolean;
  onChange: (rung: OfferRung) => void;
  onRemove: () => void;
}) {
  const mode = rewardModeOf(rung);
  const set = (patch: Partial<OfferRung>) => onChange({ ...rung, ...patch });
  const hasDiscount = mode === "discount" || mode === "free_then_discount";
  const hasFree = mode === "free" || mode === "free_then_discount";
  const togglePlan = (plan: OfferPlan) => {
    const next = rung.plans.includes(plan) ? rung.plans.filter((item) => item !== plan) : [...rung.plans, plan];
    set({ plans: next.length > 0 ? next : rung.plans });
  };

  return (
    <div className="rounded-lg border border-[var(--mce-admin-border)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-[var(--mce-admin-text)]">
            Step {index + 1}: {describeRung(rung)}
          </div>
          <div className="text-[12px] text-[var(--mce-admin-text-muted)]">
            {index === 0
              ? ladder.trigger === "trial_expired"
                ? `${rung.waitDays} day${rung.waitDays === 1 ? "" : "s"} after the trial ends`
                : "As soon as someone qualifies"
              : `${rung.waitDays} day${rung.waitDays === 1 ? "" : "s"} after the previous offer closes`}
            , open for {rung.openDays} day{rung.openDays === 1 ? "" : "s"}
          </div>
        </div>
        {canRemove ? (
          <button type="button" className="adm-icon-btn" onClick={onRemove} aria-label={`Remove step ${index + 1}`} title="Remove this step">
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="adm-label">Name (only you see this)</label>
          <input className="adm-input" value={rung.label} maxLength={80} onChange={(event) => set({ label: event.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Wait" value={rung.waitDays} min={0} max={365} suffix="days" onChange={(value) => set({ waitDays: value })} />
          <NumberField label="Open for" value={rung.openDays} min={1} max={60} suffix="days" onChange={(value) => set({ openDays: value })} />
        </div>
      </div>

      <div className="mt-4">
        <label className="adm-label">What they get</label>
        <div className="adm-seg flex-wrap" role="group" aria-label="What they get">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              title={item.hint}
              className={`adm-seg__item ${mode === item.value ? "adm-seg__item--active" : ""}`}
              onClick={() => onChange(withRewardMode(rung, item.value))}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="adm-hint">{MODES.find((item) => item.value === mode)?.hint}. Free time is always the Basic plan.</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {mode === "trial" ? (
          <NumberField label="Extra trial days" value={rung.trialExtensionDays} min={1} max={60} suffix="days" onChange={(value) => set({ trialExtensionDays: value })} />
        ) : null}
        {hasFree ? (
          <NumberField label="Free Basic days" value={rung.freeDays} min={1} max={90} suffix="days" onChange={(value) => set({ freeDays: value })} />
        ) : null}
        {hasDiscount ? (
          <>
            <NumberField label="Percent off" value={rung.percentOff} min={1} max={90} suffix="%" onChange={(value) => set({ percentOff: value })} />
            <NumberField
              label="For how many months"
              value={rung.discountMonths}
              min={1}
              max={12}
              suffix="months"
              onChange={(value) => set({ discountMonths: value })}
              hint={rung.billingCycle === "yearly" ? "Yearly checkouts get the discount on the first payment only." : undefined}
            />
          </>
        ) : null}
      </div>

      {hasDiscount ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="adm-label">Applies to</label>
            <div className="flex gap-5 text-[13px] text-[var(--mce-admin-text)]">
              {(["basic", "growth"] as OfferPlan[]).map((plan) => (
                <label key={plan} className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={rung.plans.includes(plan)} onChange={() => togglePlan(plan)} />
                  {plan === "basic" ? "Basic" : "Growth"}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="adm-label">Billing</label>
            <select
              className="adm-input"
              value={rung.billingCycle}
              onChange={(event) => set({ billingCycle: event.target.value === "yearly" ? "yearly" : "monthly" })}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="adm-label">Pop-up and email headline</label>
          <input className="adm-input" value={rung.title} maxLength={120} onChange={(event) => set({ title: event.target.value })} />
        </div>
        <div>
          <label className="adm-label">Button text</label>
          <input className="adm-input" value={rung.ctaLabel} maxLength={40} onChange={(event) => set({ ctaLabel: event.target.value })} />
        </div>
      </div>
      <div className="mt-4">
        <label className="adm-label">Message</label>
        <textarea className="adm-input" rows={3} value={rung.message} maxLength={600} onChange={(event) => set({ message: event.target.value })} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label className="adm-label">Email subject</label>
          <input className="adm-input" value={rung.emailSubject} maxLength={120} onChange={(event) => set({ emailSubject: event.target.value })} />
        </div>
        <label className="inline-flex items-center gap-2 pb-2 text-[13px] text-[var(--mce-admin-text)]">
          <input type="checkbox" checked={rung.emailEnabled} onChange={(event) => set({ emailEnabled: event.target.checked })} />
          Send this by email
        </label>
      </div>
      <p className="adm-hint">
        The pop-up wording can also be edited in Announcements once the offers are on; the email always uses the text above.
      </p>
    </div>
  );
}

export function LadderEditor({ ladder, onChange }: { ladder: OfferLadder; onChange: (ladder: OfferLadder) => void }) {
  const updateRung = (index: number, rung: OfferRung) =>
    onChange({ ...ladder, rungs: ladder.rungs.map((item, i) => (i === index ? rung : item)) });

  return (
    <div className="space-y-4">
      {ladder.trigger === "light_use_trial" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="adm-label">Counts as light use when they used the app on at most</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="adm-input"
                min={1}
                max={10}
                value={ladder.lightUseMaxDays}
                onChange={(event) => onChange({ ...ladder, lightUseMaxDays: Math.min(10, Math.max(1, Number(event.target.value) || 1)) })}
              />
              <span className="whitespace-nowrap text-[12px] text-[var(--mce-admin-text-muted)]">day(s)</span>
            </div>
          </div>
          <div>
            <label className="adm-label">and have been quiet for at least</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="adm-input"
                min={1}
                max={30}
                value={ladder.idleDays}
                onChange={(event) => onChange({ ...ladder, idleDays: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })}
              />
              <span className="whitespace-nowrap text-[12px] text-[var(--mce-admin-text-muted)]">days</span>
            </div>
          </div>
        </div>
      ) : null}

      {ladder.rungs.map((rung, index) => (
        <RungEditor
          key={rung.id}
          index={index}
          rung={rung}
          ladder={ladder}
          canRemove={ladder.rungs.length > 1 && index === ladder.rungs.length - 1}
          onChange={(next) => updateRung(index, next)}
          onRemove={() => onChange({ ...ladder, rungs: ladder.rungs.slice(0, -1) })}
        />
      ))}

      {ladder.rungs.length < 10 ? (
        <button
          type="button"
          className="adm-btn adm-btn--ghost adm-btn--sm"
          onClick={() => onChange({ ...ladder, rungs: [...ladder.rungs, newRung(ladder.rungs.length)] })}
        >
          <Plus className="h-4 w-4" />
          Add another step
        </button>
      ) : null}
      <p className="adm-hint">
        After the last step is ignored, the ladder stops and that person gets no more offers from it. Wording edits show right
        away. Free days already offered keep the amount they were offered; a discount follows the current percent at checkout.
      </p>
    </div>
  );
}
