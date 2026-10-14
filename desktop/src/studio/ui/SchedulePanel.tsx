/**
 * SchedulePanel.tsx — today's service order on the right. Click an item to open it.
 * It reads the same schedule the Dock and the planner use.
 */
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { DOCK_SCHEDULE_CHANGED_EVENT, getOrCreateActiveSchedule } from "../../dock/dockScheduleService";
import type { ServicePlan, ServicePlanItem } from "../../service-planner/types";

interface SchedulePanelProps {
  onOpen: (item: ServicePlanItem) => void;
  /** Label of what is on the screen now, to mark the matching item. */
  liveLabel: string;
}

function readPlan(): ServicePlan | null {
  try {
    return getOrCreateActiveSchedule().activePlan;
  } catch {
    return null;
  }
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const TYPE_LABEL: Record<ServicePlanItem["type"], string> = {
  bible: "Bible",
  worship: "Worship",
  sermon: "Notes",
  media: "Media",
};

export default function SchedulePanel({ onOpen, liveLabel }: SchedulePanelProps) {
  const [plan, setPlan] = useState<ServicePlan | null>(readPlan);

  const refresh = useCallback(() => setPlan(readPlan()), []);

  useEffect(() => {
    window.addEventListener(DOCK_SCHEDULE_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(DOCK_SCHEDULE_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const items = plan?.items ?? [];
  const done = new Set(plan?.completedItemIds ?? []);

  return (
    <aside className="sx-schedule" aria-label="Schedule">
      <div className="sx-schedule__head">
        <strong>Schedule</strong>
        {plan && <span>{plan.title} · {formatDate(plan.serviceDate)}</span>}
      </div>
      <div className="sx-schedule__list">
        {items.length === 0 && (
          <div className="sx-empty">Nothing scheduled yet. Add songs, verses and notes to the schedule from the Dock or the Planner.</div>
        )}
        {items.map((item) => {
          const isDone = done.has(item.id);
          const isLive = Boolean(liveLabel) && (item.label === liveLabel || item.label.startsWith(`${liveLabel} ·`));
          return (
            <button key={item.id} type="button" className={`sx-sched${isDone ? " is-done" : ""}${isLive ? " is-live" : ""}`} onClick={() => onOpen(item)}>
              <span className="sx-sched__mark">
                {isLive ? <span className="sx-sched__tag">LIVE</span> : isDone ? <Check size={12} /> : null}
              </span>
              <span className="sx-sched__text">
                <span className="sx-sched__title">{item.label}</span>
                <span className="sx-sched__sub">{TYPE_LABEL[item.type]}{item.subtitle ? ` · ${item.subtitle}` : ""}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
