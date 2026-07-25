/**
 * PremiumContentGate.tsx — Reusable limit gate
 *
 * Renders ALL items via children, but marks items beyond the plan limit as "gated".
 * The consumer decides how to render gated items (e.g. dimmed with upgrade CTA).
 *
 * Usage:
 *   <PremiumContentGate
 *     items={songs}
 *     limit={songLimit}
 *     plan={effectivePlan}
 *     upgradeTarget="songs"
 *     entityName="songs"
 *   >
 *     {({ all, gatedIds }) =>
 *       all.map(s =>
 *         gatedIds.has(s.id)
 *           ? <LockedSongCard key={s.id} song={s} />
 *           : <SongCard key={s.id} song={s} />
 *       )
 *     }
 *   </PremiumContentGate>
 */

import React from "react";
import type { PlanTier } from "../services/licenseService";

interface PremiumContentGateProps<T> {
  items: T[];
  limit: number;
  plan: PlanTier;
  upgradeTarget: string;
  entityName: string;
  children: (ctx: { all: T[]; allowed: T[]; gatedIds: Set<string> }) => React.ReactNode;
  className?: string;
}

function PremiumContentGateInner<T extends { id: string }>({
  items,
  limit,
  children,
  className,
}: PremiumContentGateProps<T>) {
  const isUnlimited = limit <= 0 || limit >= 9999;
  const allowedItems = isUnlimited ? items : items.slice(0, limit);

  const gatedIds = new Set<string>();
  if (!isUnlimited) {
    for (let i = limit; i < items.length; i++) {
      gatedIds.add(items[i].id);
    }
  }

  return (
    <div className={className}>
      {children({ all: items, allowed: allowedItems, gatedIds })}
    </div>
  );
}

export function PremiumContentGate<T extends { id: string }>(props: PremiumContentGateProps<T>) {
  return <PremiumContentGateInner {...props} />;
}

export default PremiumContentGate;
