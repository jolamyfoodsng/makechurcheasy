/**
 * ScheduleDock.tsx — the Schedule / History sidebar docked on the right of the Studio.
 *
 *  Schedule  today's service order (the same plan the Dock and the Planner use): songs, verses,
 *            media, documents and notes. LIVE = on the screen, NEXT = the one after it, ✓ = done.
 *            Click to open it, ▶ to project it, drag or ⋮ to reorder, mark done or remove.
 *  History   what was actually shown on the screen, newest first (previews are never recorded).
 *            Search it and project anything again.
 *
 * It remembers its width and tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Eye,
  FileText,
  GripVertical,
  Image as ImageIcon,
  MoreVertical,
  Music,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  DOCK_HISTORY_CHANGED_EVENT,
  DOCK_SCHEDULE_CHANGED_EVENT,
  clearPresentationHistory,
  createNewSchedulePlan,
  getPresentationHistory,
  readCachedScheduleSnapshot,
  removeHistoryItem,
  setActiveScheduleId,
} from "../../dock/dockScheduleService";
import type { ServicePlan, ServicePlanItem } from "../../service-planner/types";
import type { StudioMode, StudioSlide } from "../studioEngine";
import { planItemMatchesSlide } from "../studioItems";
import {
  clearScheduleDone,
  markScheduleItemDone,
  moveScheduleItem,
  nextScheduleItemId,
  readActivePlan,
  removeScheduleItem,
} from "../studioSchedule";
import StudioMenu, { menuAt, type StudioMenuState } from "./StudioMenu";

interface ScheduleDockProps {
  tab: "schedule" | "history";
  onTab: (tab: "schedule" | "history") => void;
  onClose: () => void;
  liveSlide: StudioSlide | null;
  displayMode: StudioMode;
  /** The schedule item that was last projected from the Schedule (marks LIVE even for a whole song). */
  liveItemId: string | null;
  onOpenItem: (item: ServicePlanItem) => void;
  onProjectItem: (item: ServicePlanItem) => void;
  /** Add what is in Preview now (disabled when nothing is). */
  onAddCurrent: () => void;
  canAddCurrent: boolean;
}

const TYPE_ICON: Record<ServicePlanItem["type"], typeof BookOpen> = {
  bible: BookOpen,
  worship: Music,
  sermon: FileText,
  media: ImageIcon,
};

const TYPE_LABEL: Record<ServicePlanItem["type"], string> = {
  bible: "Bible",
  worship: "Worship",
  sermon: "Notes",
  media: "Media",
};

function typeLabel(item: ServicePlanItem): string {
  if (item.type === "media" && item.payloadSnapshot?.isDocumentPage) return "Document";
  return TYPE_LABEL[item.type];
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function ScheduleDock(props: ScheduleDockProps) {
  const { tab, onTab, onClose, liveSlide, displayMode, liveItemId } = props;
  const [plan, setPlan] = useState<ServicePlan | null>(readActivePlan);
  const [history, setHistory] = useState<ServicePlanItem[]>(() => getPresentationHistory());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ServicePlanItem["type"]>("all");
  const [menu, setMenu] = useState<StudioMenuState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [plans, setPlans] = useState<ServicePlan[]>(() => readCachedScheduleSnapshot()?.plans ?? []);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const refreshPlan = useCallback(() => {
    setPlan(readActivePlan());
    setPlans(readCachedScheduleSnapshot()?.plans ?? []);
  }, []);
  useEffect(() => { if (naming) nameRef.current?.focus(); }, [naming]);

  const openPlanMenu = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu(menuAt({ clientX: rect.left, clientY: rect.bottom + 4 }, [
      ...plans.map((p) => ({
        label: p.title || "Untitled",
        icon: p.id === plan?.id ? <Check size={14} /> : <CalendarDays size={14} />,
        hint: p.serviceDate ? formatDate(p.serviceDate) : undefined,
        onSelect: () => { if (p.id !== plan?.id) setActiveScheduleId(p.id); },
      })),
      { label: "Create new schedule", icon: <Plus size={14} />, divider: plans.length > 0, onSelect: () => { setNewName(""); setNaming(true); } },
    ]));
  };
  const createPlan = () => {
    const title = newName.trim() || "New Schedule";
    const created = createNewSchedulePlan(title);
    setActiveScheduleId(created.id);
    setNaming(false);
    setNewName("");
  };
  const refreshHistory = useCallback(() => setHistory(getPresentationHistory()), []);

  useEffect(() => {
    window.addEventListener(DOCK_SCHEDULE_CHANGED_EVENT, refreshPlan);
    window.addEventListener(DOCK_HISTORY_CHANGED_EVENT, refreshHistory);
    window.addEventListener("focus", refreshPlan);
    return () => {
      window.removeEventListener(DOCK_SCHEDULE_CHANGED_EVENT, refreshPlan);
      window.removeEventListener(DOCK_HISTORY_CHANGED_EVENT, refreshHistory);
      window.removeEventListener("focus", refreshPlan);
    };
  }, [refreshPlan, refreshHistory]);

  const items = plan?.items ?? [];
  const done = useMemo(() => new Set(plan?.completedItemIds ?? []), [plan?.completedItemIds]);

  const liveId = useMemo(() => {
    if (!liveSlide) return null;
    if (liveItemId && items.some((i) => i.id === liveItemId) && planItemMatchesSlide(items.find((i) => i.id === liveItemId) as ServicePlanItem, liveSlide, displayMode)) return liveItemId;
    return items.find((i) => planItemMatchesSlide(i, liveSlide, displayMode))?.id ?? null;
  }, [items, liveSlide, liveItemId, displayMode]);
  const nextId = useMemo(() => nextScheduleItemId(items, liveId, done), [items, liveId, done]);

  const shownHistory = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return history.filter((h) => (filter === "all" || h.type === filter)
      && (!needle || h.label.toLowerCase().includes(needle) || (h.subtitle ?? "").toLowerCase().includes(needle)));
  }, [history, query, filter]);

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragId) moveScheduleItem(dragId, index);
    setDragId(null);
    setDropAt(null);
  };

  const itemMenu = (item: ServicePlanItem, index: number, event: { clientX: number; clientY: number }) => {
    const isDone = done.has(item.id);
    setMenu(menuAt(event, [
      { label: "Open in Preview", icon: <Eye size={14} />, onSelect: () => props.onOpenItem(item) },
      { label: "Project", icon: <Play size={14} />, onSelect: () => props.onProjectItem(item) },
      { label: "Move up", icon: <ArrowUp size={14} />, disabled: index === 0, divider: true, onSelect: () => moveScheduleItem(item.id, index - 1) },
      { label: "Move down", icon: <ArrowDown size={14} />, disabled: index >= items.length - 1, onSelect: () => moveScheduleItem(item.id, index + 1) },
      { label: isDone ? "Mark not done" : "Mark done", icon: isDone ? <RotateCcw size={14} /> : <Check size={14} />, divider: true, onSelect: () => markScheduleItemDone(item.id, !isDone) },
      { label: "Remove from schedule", icon: <Trash2 size={14} />, danger: true, onSelect: () => removeScheduleItem(item.id) },
    ]));
  };

  return (
    <aside className="st-dock" aria-label="Schedule and history">
      <header className="st-dock__head">
        <div className="st-tabs st-tabs--pill" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "schedule"} className={tab === "schedule" ? "is-on" : ""} onClick={() => onTab("schedule")}>Schedule</button>
          <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-on" : ""} onClick={() => onTab("history")}>History</button>
        </div>
        <button type="button" className="st-iconbtn" onClick={onClose} aria-label="Close" title="Close"><X size={16} /></button>
      </header>

      {tab === "schedule" && (
        <>
          <div className="st-dock__sub st-dock__sub--pick">
            <button type="button" className="st-dock__plan" onClick={openPlanMenu} aria-haspopup="menu" title="Switch schedule or create a new one">
              <CalendarDays size={14} />
              <strong>{plan?.title || "Today"}</strong>
              <ChevronDown size={14} />
            </button>
            {plan?.serviceDate && <span className="st-dock__date">{formatDate(plan.serviceDate)}</span>}
            <span className="st-dock__count">{items.length} item{items.length === 1 ? "" : "s"}</span>
          </div>
          {naming && (
            <form className="st-dock__new" onSubmit={(e) => { e.preventDefault(); createPlan(); }}>
              <input ref={nameRef} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name, e.g. Sunday 9am" aria-label="New schedule name" onKeyDown={(e) => { if (e.key === "Escape") setNaming(false); }} />
              <button type="submit" className="studio-btn studio-btn--primary">Create</button>
              <button type="button" className="st-iconbtn st-iconbtn--sm" onClick={() => setNaming(false)} aria-label="Cancel" title="Cancel"><X size={14} /></button>
            </form>
          )}
          <div className="st-dock__list">
            {items.length === 0 && (
              <div className="st-empty">Nothing scheduled yet. Right-click a verse, song, picture or document → Add to Schedule, or press “Add current”.</div>
            )}
            {items.map((item, index) => {
              const Icon = TYPE_ICON[item.type] ?? FileText;
              const isLive = item.id === liveId;
              const isNext = item.id === nextId;
              const isDone = done.has(item.id) && !isLive;
              return (
                <div
                  key={item.id}
                  className={`st-sched${isLive ? " is-live" : ""}${isNext ? " is-next" : ""}${isDone ? " is-done" : ""}${dropAt === index ? " is-drop" : ""}`}
                  draggable
                  onDragStart={(e) => { setDragId(item.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.label); }}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropAt(index); } }}
                  onDragLeave={() => setDropAt((v) => (v === index ? null : v))}
                  onDrop={(e) => onDrop(e, index)}
                  onDragEnd={() => { setDragId(null); setDropAt(null); }}
                  onContextMenu={(e) => { e.preventDefault(); itemMenu(item, index, e); }}
                >
                  <span className="st-sched__num" title="Drag to reorder"><GripVertical size={12} />{index + 1}</span>
                  <button type="button" className="st-sched__main" onClick={() => props.onOpenItem(item)} onDoubleClick={() => props.onProjectItem(item)} title="Click to open · double-click to project">
                    <span className="st-sched__title">
                      <Icon size={13} /> <span>{item.label}</span>
                    </span>
                    <span className="st-sched__sub">
                      {isLive ? <span className="st-tag st-tag--live">LIVE</span> : isNext ? <span className="st-tag st-tag--next">NEXT</span> : isDone ? <span className="st-tag st-tag--done"><Check size={10} /> DONE</span> : null}
                      <span>{typeLabel(item)}{item.subtitle ? ` · ${item.subtitle}` : ""}</span>
                    </span>
                  </button>
                  <div className="st-sched__actions">
                    <button type="button" className="st-iconbtn st-iconbtn--sm" onClick={() => props.onProjectItem(item)} title="Project" aria-label={`Project ${item.label}`}><Play size={13} /></button>
                    <button type="button" className="st-iconbtn st-iconbtn--sm" onClick={(e) => itemMenu(item, index, e)} title="More" aria-label="More"><MoreVertical size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <footer className="st-dock__foot">
            <button type="button" className="studio-btn" onClick={clearScheduleDone} disabled={done.size === 0} title="Clear the ✓ marks for a new service"><RotateCcw size={13} /> Reset done</button>
            <button type="button" className="studio-btn studio-btn--primary" onClick={props.onAddCurrent} disabled={!props.canAddCurrent} title="Add what is in Preview to the schedule"><Plus size={14} /> Add current</button>
          </footer>
        </>
      )}

      {tab === "history" && (
        <>
          <div className="st-dock__search">
            <div className="st-searchbox">
              <Search size={13} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search history" aria-label="Search history" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={12} /></button>}
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Type">
              <option value="all">All</option>
              <option value="bible">Bible</option>
              <option value="worship">Worship</option>
              <option value="media">Media</option>
              <option value="sermon">Notes</option>
            </select>
          </div>
          <div className="st-dock__list">
            {shownHistory.length === 0 && (
              <div className="st-empty">{history.length === 0 ? "What you show on the screen is listed here, with the time." : "Nothing matches."}</div>
            )}
            {shownHistory.map((item) => {
              const Icon = TYPE_ICON[item.type] ?? FileText;
              const isLive = planItemMatchesSlide(item, liveSlide, displayMode);
              return (
                <div key={item.id} className={`st-sched st-sched--hist${isLive ? " is-live" : ""}`}>
                  <button type="button" className="st-sched__main" onClick={() => props.onOpenItem(item)} onDoubleClick={() => props.onProjectItem(item)} title="Click to open · double-click to project again">
                    <span className="st-sched__title"><Icon size={13} /> <span>{item.label}</span></span>
                    <span className="st-sched__sub">
                      {isLive && <span className="st-tag st-tag--live">LIVE</span>}
                      <span className="st-sched__time">{timeOf(item.updatedAt)}</span>
                      <span>{typeLabel(item)}{item.subtitle ? ` · ${item.subtitle}` : ""}</span>
                    </span>
                  </button>
                  <div className="st-sched__actions">
                    <button type="button" className="st-iconbtn st-iconbtn--sm" onClick={() => props.onOpenItem(item)} title="Preview" aria-label="Preview"><Eye size={13} /></button>
                    <button type="button" className="st-iconbtn st-iconbtn--sm" onClick={() => props.onProjectItem(item)} title="Project again" aria-label="Project again"><Play size={13} /></button>
                    <button type="button" className="st-iconbtn st-iconbtn--sm st-hover-only" onClick={() => removeHistoryItem(item.id)} title="Remove from history" aria-label="Remove from history"><X size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <footer className="st-dock__foot">
            <button type="button" className="studio-btn" onClick={clearPresentationHistory} disabled={history.length === 0}><Trash2 size={13} /> Clear history</button>
          </footer>
        </>
      )}
      <StudioMenu menu={menu} onClose={() => setMenu(null)} />
    </aside>
  );
}
