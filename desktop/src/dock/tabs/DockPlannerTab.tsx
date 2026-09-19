import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { dockClient, type DockStateMessage } from "../../services/dockBridge";
import { dockObsClient } from "../dockObsClient";
import type { DockStagedItem } from "../dockTypes";
import Icon from "../DockIcon";
import {
  createServicePlanItem,
  isServicePlan,
  isServicePlannerSnapshot,
  type ServicePlan,
  type ServicePlanItem,
  type ServicePlannerSnapshot,
} from "../../service-planner/types";

interface DockPlannerTabProps {
  staged: DockStagedItem | null;
  onStage: (item: DockStagedItem | null) => void;
  initialSnapshot?: ServicePlannerSnapshot | null;
}

interface LegacyDockPlanItem {
  id?: string;
  type?: string;
  label?: string;
  details?: string;
  completed?: boolean;
  meta?: Record<string, unknown>;
}

interface LegacyDockPlan {
  id?: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  items?: LegacyDockPlanItem[];
}

function legacyPlanToSnapshot(plans: LegacyDockPlan[]): ServicePlannerSnapshot {
  const now = Date.now();
  const nextPlans: ServicePlan[] = plans.map((plan, planIndex) => {
    const items = Array.isArray(plan.items) ? plan.items.map((item, itemIndex) => {
      const type = item.type === "bible" || item.type === "worship" || item.type === "media" || item.type === "sermon"
        ? item.type
        : "sermon";
      return createServicePlanItem({
        id: item.id ?? `legacy-cue-${planIndex}-${itemIndex}`,
        type,
        sourceKind: "manual",
        label: item.label?.trim() || type,
        subtitle: item.details?.trim() || "",
        payloadSnapshot: {
          ...(item.meta ?? {}),
          ...(type === "sermon" ? { text: item.details || item.label || "", itemType: "point", overlayMode: "lower-third" } : {}),
          ...(type === "worship" ? { sectionText: item.details || "", sectionLabel: item.label || "Worship", songTitle: item.label || "Worship", overlayMode: "lower-third" } : {}),
          ...(type === "bible" ? { referenceLabel: item.label || "Bible", verseText: item.details || "", translation: "KJV", overlayMode: "fullscreen" } : {}),
        },
      });
    }) : [];

    return {
      id: plan.id ?? `legacy-plan-${planIndex}`,
      title: plan.name?.trim() || i18next.t("planner.legacyPlanTitle"),
      serviceDate: plan.createdAt ? plan.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: planIndex === 0 ? "active" : "draft",
      items,
      selectedItemId: items[0]?.id,
      completedItemIds: items
        .filter((_, itemIndex) => Boolean(plan.items?.[itemIndex]?.completed))
        .map((item) => item.id),
      createdAt: plan.createdAt ? new Date(plan.createdAt).getTime() : now,
      updatedAt: plan.updatedAt ? new Date(plan.updatedAt).getTime() : now,
    };
  });

  return {
    plans: nextPlans,
    activePlan: nextPlans.find((plan) => plan.status === "active") ?? nextPlans[0] ?? null,
  };
}

function normalizePlannerPayload(value: unknown): ServicePlannerSnapshot | null {
  if (isServicePlannerSnapshot(value)) {
    return {
      plans: value.plans.filter(isServicePlan),
      activePlan: value.activePlan && isServicePlan(value.activePlan) ? value.activePlan : value.plans[0] ?? null,
    };
  }
  if (Array.isArray(value)) {
    return legacyPlanToSnapshot(value as LegacyDockPlan[]);
  }
  return null;
}

async function loadPlannerSnapshotFromUploads(): Promise<ServicePlannerSnapshot | null> {
  try {
    const response = await fetch(`/uploads/dock-service-plans.json?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    return normalizePlannerPayload(payload);
  } catch {
    return null;
  }
}

function planDateLabel(date: string, t: (key: string) => string): string {
  if (!date) return t("planner.noDate");
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function cueKindLabel(type: ServicePlanItem["type"], t: (key: string) => string): string {
  if (type === "bible") return t("planner.typeBible");
  if (type === "worship") return t("planner.typeSong");
  if (type === "sermon") return t("planner.typeSermon");
  return t("planner.typeMedia");
}

function mediaPayload(payload: Record<string, unknown>): { filePath: string; fileName: string } | null {
  const filePath = typeof payload.filePath === "string" ? payload.filePath : "";
  const fileName = typeof payload.fileName === "string" ? payload.fileName : "";
  if (!filePath || !fileName) return null;
  return { filePath, fileName };
}

export default function DockPlannerTab({ staged: _staged, onStage, initialSnapshot }: DockPlannerTabProps) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<ServicePlannerSnapshot | null>(initialSnapshot ?? null);
  const [activePlanId, setActivePlanId] = useState(initialSnapshot?.activePlan?.id ?? "");
  const [filter, setFilter] = useState("");
  const [editingCueId, setEditingCueId] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftSubtitle, setDraftSubtitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [quickPoint, setQuickPoint] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!initialSnapshot) return;
    setSnapshot(initialSnapshot);
    setActivePlanId((current) => current || initialSnapshot.activePlan?.id || "");
  }, [initialSnapshot]);

  useEffect(() => {
    dockClient.sendCommand({ type: "request-service-plans", timestamp: Date.now() });
    void loadPlannerSnapshotFromUploads().then((payload) => {
      if (!payload) return;
      setSnapshot(payload);
      setActivePlanId((current) => current || payload.activePlan?.id || payload.plans[0]?.id || "");
    });
    const unsub = dockClient.onState((msg: DockStateMessage) => {
      if (msg.type !== "state:service-plans") return;
      const payload = normalizePlannerPayload(msg.payload);
      if (!payload) return;
      setSnapshot(payload);
      setActivePlanId((current) => current || payload.activePlan?.id || payload.plans[0]?.id || "");
    });
    return unsub;
  }, []);

  const plans = snapshot?.plans ?? [];
  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? snapshot?.activePlan ?? plans[0] ?? null,
    [activePlanId, plans, snapshot?.activePlan],
  );
  const selectedCue = activePlan?.items.find((item) => item.id === activePlan.selectedItemId) ?? activePlan?.items[0] ?? null;
  const selectedIndex = activePlan && selectedCue ? activePlan.items.findIndex((item) => item.id === selectedCue.id) : -1;
  const liveCue = activePlan?.items.find((item) => item.id === activePlan.lastSentItemId) ?? null;
  const liveIndex = activePlan && liveCue ? activePlan.items.findIndex((item) => item.id === liveCue.id) : -1;
  const navigationIndex = liveIndex >= 0 ? liveIndex : selectedIndex;
  const previousCue = activePlan && navigationIndex > 0 ? activePlan.items[navigationIndex - 1] ?? null : null;
  const nextCue = activePlan && navigationIndex >= 0 ? activePlan.items[navigationIndex + 1] ?? null : null;
  const filteredItems = useMemo(() => {
    if (!activePlan) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return activePlan.items;
    return activePlan.items.filter((item) =>
      [item.type, item.label, item.subtitle, item.notes].some((value) => String(value ?? "").toLowerCase().includes(q)),
    );
  }, [activePlan, filter]);

  const savePlan = useCallback((plan: ServicePlan) => {
    setSnapshot((current) => {
      const plans = current?.plans ?? [];
      const nextPlans = plans.some((candidate) => candidate.id === plan.id)
        ? plans.map((candidate) => candidate.id === plan.id ? plan : candidate)
        : [plan, ...plans];
      return {
        plans: nextPlans,
        activePlan: plan.status === "active" ? plan : current?.activePlan ?? plan,
      };
    });
    dockClient.sendCommand({
      type: "service-plan:save",
      commandId: `planner-${Date.now()}`,
      payload: plan,
      timestamp: Date.now(),
    });
  }, []);

  const patchCue = useCallback((cueId: string, patch: Partial<ServicePlanItem>) => {
    if (!activePlan) return;
    savePlan({
      ...activePlan,
      items: activePlan.items.map((item) =>
        item.id === cueId ? { ...item, ...patch, updatedAt: Date.now() } : item,
      ),
      updatedAt: Date.now(),
    });
  }, [activePlan, savePlan]);

  const startEditCue = useCallback((cue: ServicePlanItem) => {
    setEditingCueId(cue.id);
    setDraftLabel(cue.label);
    setDraftSubtitle(cue.subtitle ?? "");
    setDraftNotes(cue.notes ?? "");
  }, []);

  const commitEditCue = useCallback(() => {
    if (!editingCueId) return;
    patchCue(editingCueId, {
      label: draftLabel.trim() || t("planner.untitledCue"),
      subtitle: draftSubtitle.trim(),
      notes: draftNotes.trim(),
    });
    setEditingCueId("");
  }, [draftLabel, draftNotes, draftSubtitle, editingCueId, patchCue]);

  const sendCue = useCallback(async (cue: ServicePlanItem, action: "preview" | "live") => {
    setActionError("");
    setActionNotice("");
    setSending(true);
    try {
      if (!dockObsClient.isConnected) {
        await dockObsClient.connect();
      }
      const payload = cue.payloadSnapshot ?? {};
      if (cue.type === "bible") {
        await dockObsClient.pushBible(payload as unknown as Parameters<typeof dockObsClient.pushBible>[0]);
      } else if (cue.type === "worship") {
        await dockObsClient.pushWorshipLyrics(payload as unknown as Parameters<typeof dockObsClient.pushWorshipLyrics>[0]);
      } else if (cue.type === "sermon") {
        await dockObsClient.pushSermonCue(payload as Parameters<typeof dockObsClient.pushSermonCue>[0]);
      } else {
        const media = mediaPayload(payload);
        if (!media) throw new Error(t("planner.mediaCueMissingFile"));
        await dockObsClient.pushMedia(media.filePath, media.fileName);
      }

      const outputTab = cue.type === "worship"
        ? "worship"
        : cue.type === "media"
          ? "media"
          : cue.type === "bible"
            ? "bible"
            : "lower-third";
      const output = await dockObsClient.preparePlannerOutput(outputTab, action === "live");

      onStage({
        type: cue.type,
        label: cue.label,
        subtitle: cue.subtitle,
        data: {
          ...payload,
          plannerCueId: cue.id,
          plannerAction: action,
        },
      });

      if (activePlan) {
        savePlan({
          ...activePlan,
          selectedItemId: cue.id,
          ...(action === "live"
            ? {
              completedItemIds: Array.from(new Set([...(activePlan.completedItemIds ?? []), cue.id])),
              lastSentItemId: cue.id,
            }
            : {}),
          updatedAt: Date.now(),
        });
      }

      if (action === "preview" && output.outputMode === "program") {
        setActionNotice(t(
          "planner.previewRequiresStudio",
          "OBS Studio Mode is off, so Preview was sent to Program.",
        ));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /scene item|create.*input|create.*scene|failed to create/i.test(message);
      if (!isTransient) {
        setActionError(message);
        console.warn("[DockPlannerTab] Cue send failed:", err);
      }
    } finally {
      setSending(false);
    }
  }, [activePlan, onStage, savePlan, t]);

  const selectCue = useCallback((cue: ServicePlanItem) => {
    void sendCue(cue, "preview");
  }, [sendCue]);

  const sendRelativeCue = useCallback((cue: ServicePlanItem | null) => {
    if (!cue) return;
    void sendCue(cue, "live");
  }, [sendCue]);

  const addQuickPoint = useCallback(() => {
    if (!activePlan || !quickPoint.trim()) return;
    const cue = createServicePlanItem({
      type: "sermon",
      sourceKind: "sermon-point",
      label: quickPoint.trim().slice(0, 80),
      payloadSnapshot: {
        text: quickPoint.trim(),
        itemType: "point",
        overlayMode: "lower-third",
      },
      lastResolvedAt: Date.now(),
    });
    savePlan({
      ...activePlan,
      items: [...activePlan.items, cue],
      selectedItemId: cue.id,
      updatedAt: Date.now(),
    });
    setQuickPoint("");
  }, [activePlan, quickPoint, savePlan]);

  if (!activePlan) {
    return (
      <div className="dock-module dock-planner">
        <div className="dock-planner-empty">
          <Icon name="event_note" size={22} />
          <div className="dock-planner-empty__title">{t("planner.emptyTitle")}</div>
          <div className="dock-planner-empty__body">
            {t("planner.emptyBody")}
          </div>
          <button
            type="button"
            className="dock-btn dock-btn--preview dock-btn--block"
            onClick={() => {
              dockClient.sendCommand({ type: "request-service-plans", timestamp: Date.now() });
              void loadPlannerSnapshotFromUploads().then((payload) => {
                if (!payload) return;
                setSnapshot(payload);
                setActivePlanId((current) => current || payload.activePlan?.id || payload.plans[0]?.id || "");
              });
            }}
            title={t("common.refresh")}>
            {t("planner.refresh")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dock-module dock-planner">
      <div className="dock-planner-header">
        <div>
          <div className="dock-section-label">{t("planner.title")}</div>
          <div className="dock-section-desc">{t("planner.titleDesc")}</div>
          <div className="dock-planner-title">{activePlan.title}</div>
          <div className="dock-planner-meta">
            {planDateLabel(activePlan.serviceDate, t)} · {t("planner.cueCount", { count: activePlan.items.length })}
          </div>
        </div>
        <select
          className="dock-planner-select"
          value={activePlan.id}
          onChange={(event) => setActivePlanId(event.target.value)}
          aria-label={t("planner.selectPlan")}
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.title}</option>
          ))}
        </select>
      </div>

      <div className="dock-planner-now">
        <div>
          <div className="dock-planner-now__label">{liveCue ? t("planner.onAir", "On air") : t("planner.current")}</div>
          <div className="dock-planner-now__title">{(liveCue ?? selectedCue)?.label ?? t("planner.noCueSelected")}</div>
          <div className="dock-planner-now__meta">
            {(liveCue ?? selectedCue)
              ? `${cueKindLabel((liveCue ?? selectedCue)!.type, t)} · ${(liveCue ?? selectedCue)!.subtitle || t("planner.snapshotCue")}`
              : t("planner.selectCueBelow")}
          </div>
        </div>
        <div className="dock-planner-now__actions">
          <button type="button" onClick={() => selectedCue && void sendCue(selectedCue, "preview")} disabled={!selectedCue || sending} title={t("common.preview")}>
            {t("common.preview")}
          </button>
          <button type="button" onClick={() => selectedCue && void sendCue(selectedCue, "live")} disabled={!selectedCue || sending} title={t("common.sendToObs", "Send to OBS")}>
            {t("common.sendToObs", "Send to OBS")}
          </button>
          <button type="button" onClick={() => sendRelativeCue(previousCue)} disabled={!previousCue || sending} title={t("common.prev")}>
            {t("common.prev")}
          </button>
          <button type="button" onClick={() => sendRelativeCue(nextCue)} disabled={!nextCue || sending} title={t("common.next")}>
            {t("common.next")}
          </button>
        </div>
      </div>

      <div className="dock-search-field dock-planner-search">
        <Icon name="search" size={14} />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("planner.filterCues")}
          aria-label={t("planner.filterCuesAria")}
        />
        {filter && (
          <button type="button" onClick={() => setFilter("")} aria-label={t("planner.clearFilterAria")} title={t("common.close")}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      <div className="dock-planner-cues" aria-label={t("planner.cuesAria")}>
        {filteredItems.length === 0 && (
          <div className="dock-planner-empty dock-planner-empty--compact">{t("planner.noCuesMatch")}</div>
        )}
        {filteredItems.map((cue, index) => {
          const isSelected = activePlan.selectedItemId === cue.id || (!activePlan.selectedItemId && index === 0);
          const isCompleted = activePlan.completedItemIds?.includes(cue.id);
          const isLive = activePlan.lastSentItemId === cue.id;
          return (
            <div
              key={cue.id}
              role="button"
              tabIndex={0}
              className={`dock-planner-cue${isSelected ? " dock-planner-cue--active" : ""}${isCompleted ? " dock-planner-cue--done" : ""}${isLive ? " dock-planner-cue--live" : ""}`}
              onClick={() => selectCue(cue)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectCue(cue);
                }
              }}
            >
              <span className="dock-planner-cue__index">{activePlan.items.findIndex((item) => item.id === cue.id) + 1}</span>
              <span className="dock-planner-cue__body">
                <span className="dock-planner-cue__top">
                  <span className={`dock-planner-cue__type dock-planner-cue__type--${cue.type}`}>
                    {cueKindLabel(cue.type, t)}
                  </span>
                  {isLive && <span className="dock-planner-cue__live">{t("common.live")}</span>}
                  {isCompleted && <span className="dock-planner-cue__done">{t("common.done")}</span>}
                </span>
                <span className="dock-planner-cue__title">{cue.label}</span>
                <span className="dock-planner-cue__subtitle">{cue.subtitle || cue.notes || t("planner.snapshotCue")}</span>
              </span>
              <button
                type="button"
                className="dock-planner-cue__edit"
                aria-label={t("planner.editCueAria", { label: cue.label })}
                onClick={(event) => {
                  event.stopPropagation();
                  startEditCue(cue);
                }}
                title={t("common.edit")}>
                <Icon name="edit" size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="dock-planner-footer">
        <div className="dock-planner-hint">
          {t("planner.hint", "Click a cue to Preview · Send to OBS sends it to the configured OBS destination · Next advances the rundown")}
        </div>
        <div className="dock-planner-quickadd">
          <input
            value={quickPoint}
            onChange={(event) => setQuickPoint(event.target.value)}
            placeholder={t("planner.quickPointPlaceholder")}
            aria-label={t("planner.quickPointAria")}
          />
          <button type="button" onClick={addQuickPoint} disabled={!quickPoint.trim()} title={t("common.add")}>
            {t("common.add")}
          </button>
        </div>
        {actionError && <div className="dock-error-msg">{actionError}</div>}
        {actionNotice && <div className="dock-planner-notice">{actionNotice}</div>}
        {sending && <div className="dock-planner-sending">{t("planner.sendingCue")}</div>}
      </div>

      {editingCueId && (
        <div className="dock-modal-backdrop" role="presentation">
          <div className="dock-modal dock-planner-edit-modal" role="dialog" aria-modal="true" aria-label={t("planner.editCueTitle")}>
            <div className="dock-modal__header">
              <div>
                <div className="dock-section-label">{t("planner.modalSectionLabel")}</div>
                <div className="dock-modal__title">{t("planner.editCueTitle")}</div>
              </div>
              <button type="button" className="dock-modal__close" onClick={() => setEditingCueId("")} aria-label={t("common.close")} title={t("common.close")}>
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="dock-planner-edit-form">
              <label>
                <span>{t("planner.labelField")}</span>
                <input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} />
              </label>
              <label>
                <span>{t("planner.subtitleField")}</span>
                <input value={draftSubtitle} onChange={(event) => setDraftSubtitle(event.target.value)} />
              </label>
              <label>
                <span>{t("planner.notesField")}</span>
                <textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} rows={4} />
              </label>
            </div>
            <div className="dock-modal__actions">
              <button type="button" className="dock-btn dock-btn--ghost" onClick={() => setEditingCueId("")} title={t("common.cancel")}>{t("common.cancel")}</button>
              <button type="button" className="dock-btn dock-btn--preview" onClick={commitEditCue} title={t("common.save")}>{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
