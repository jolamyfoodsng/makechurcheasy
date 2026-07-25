/**
 * GrowthBadge.tsx — Inline "Growth+" badge for dock UI.
 * Shows a small badge indicating a feature requires Growth plan.
 * Clicking opens the upgrade modal via dockEntitlement.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

interface GrowthBadgeProps {
  /** Feature label shown in tooltip */
  feature?: string;
  /** Optional: override the click handler */
  onClick?: () => void;
  /** Optional: show as locked (greyed out) */
  locked?: boolean;
}

export function GrowthBadge({ feature, onClick, locked = false }: GrowthBadgeProps) {
  const { t } = useTranslation();
  const label = feature ?? t('growth.defaultFeature');
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onClick) {
        onClick();
      } else {
        // Trigger the upgrade modal with a Growth-specific message
        const event = new CustomEvent("dock-upgrade", {
          detail: { message: `${label} ${t('growth.requiresGrowthPlan')}` },
        });
        window.dispatchEvent(event);
      }
    },
    [label, onClick, t]
  );

  return (
    <span
      className={`dock-growth-badge ${locked ? "dock-growth-badge--locked" : ""}`}
      onClick={handleClick}
      title={`${label} ${t('growth.requiresGrowthPlan')}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick(e as any);
      }}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ marginRight: 3 }}>
        <path d="M8 1L10 6L15 7L11.5 11L12.5 16L8 13.5L3.5 16L4.5 11L1 7L6 6L8 1Z" fill="currentColor" />
      </svg>
      {t('growth.tier')}
    </span>
  );
}
