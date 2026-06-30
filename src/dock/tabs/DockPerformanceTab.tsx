/**
 * DockPerformanceTab.tsx — Performance dashboard for the OBS Dock
 *
 * Shows real-time heap usage, frame timing, DOM node counts,
 * and provides the performance mode toggle with sub-settings.
 *
 * Designed for low-end hardware operators to self-diagnose
 * and tune the dock for their system.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePerformanceMode, type UsePerformanceMode } from "../usePerformanceMode";
import { usePerformanceMonitor } from "../usePerformanceMonitor";
import Icon from "../DockIcon";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMB(mb: number): string {
  if (mb === 0) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function heapColor(fraction: number): string {
  if (fraction >= 0.85) return "var(--dock-red, #EF4444)";
  if (fraction >= 0.65) return "var(--dock-yellow, #F59E0B)";
  return "var(--dock-green, #22C55E)";
}

function fpsColor(fps: number): string {
  if (fps < 24) return "var(--dock-red, #EF4444)";
  if (fps < 45) return "var(--dock-yellow, #F59E0B)";
  return "var(--dock-green, #22C55E)";
}

// ---------------------------------------------------------------------------
// Sparkline — tiny inline chart for history
// ---------------------------------------------------------------------------

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Section: Metric Card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="dock-perf-metric">
      <div className="dock-perf-metric__label">{label}</div>
      <div className="dock-perf-metric__value" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="dock-perf-metric__sub">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Performance Mode Toggle
// ---------------------------------------------------------------------------

function PerfModeSection({ perf }: { perf: UsePerformanceMode }) {
  const { t } = useTranslation();
  const { raw, active, update, toggle } = perf;

  return (
    <div className="dock-perf-section">
      <div className="dock-perf-section__header">
        <Icon name="speed" size={14} />
        <span className="dock-perf-section__title">{t("dock.performanceTab.performanceMode")}</span>
        <label className="dock-perf-toggle">
          <input
            type="checkbox"
            checked={active}
            onChange={toggle}
          />
          <span className="dock-perf-toggle__track" />
        </label>
      </div>

      {active && (
        <div className="dock-perf-section__body">
          <label className="dock-perf-check">
            <input
              type="checkbox"
              checked={!raw.animations}
              onChange={(e) => update({ animations: !e.target.checked })}
            />
            <span>{t("dock.performanceTab.disableAnimations")}</span>
          </label>
          <label className="dock-perf-check">
            <input
              type="checkbox"
              checked={!raw.livePreviews}
              onChange={(e) => update({ livePreviews: !e.target.checked })}
            />
            <span>{t("dock.performanceTab.disableLivePreviews")}</span>
          </label>
          <div className="dock-perf-row">
            <span className="dock-perf-row__label">{t("dock.performanceTab.pollingSpeed")}</span>
            <select
              className="dock-perf-select"
              value={raw.pollingMultiplier}
              onChange={(e) => update({ pollingMultiplier: Number(e.target.value) })}
            >
              <option value={1}>{t("dock.performanceTab.normal")}</option>
              <option value={2}>{t("dock.performanceTab.slower")}</option>
              <option value={3}>{t("dock.performanceTab.lowPower")}</option>
              <option value={5}>{t("dock.performanceTab.minimum")}</option>
            </select>
          </div>
          <div className="dock-perf-hint">
            {t("dock.performanceTab.reducesCpuHint")}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: System Metrics
// ---------------------------------------------------------------------------

function MetricsSection({ monitor }: { monitor: ReturnType<typeof usePerformanceMonitor> }) {
  const { t } = useTranslation();
  const { current, history, memorySupported } = monitor;

  const heapHistory = useMemo(() => history.map((s) => s.heapFraction * 100), [history]);
  const fpsHistory = useMemo(() => history.map((s) => s.fps), [history]);

  return (
    <div className="dock-perf-section">
      <div className="dock-perf-section__header">
        <Icon name="monitoring" size={14} />
        <span className="dock-perf-section__title">{t("dock.performanceTab.systemMetrics")}</span>
      </div>
      <div className="dock-perf-metrics-grid">
        <MetricCard
          label={t("dock.performanceTab.heapUsed")}
          value={formatMB(current.heapUsedMB)}
          sub={current.heapLimitMB > 0 ? t("dock.performanceTab.of", { value: formatMB(current.heapLimitMB) }) : undefined}
          color={heapColor(current.heapFraction)}
        />
        <MetricCard
          label={t("dock.performanceTab.fps")}
          value={String(current.fps)}
          sub={`avg ${current.avgFrameMs}ms`}
          color={fpsColor(current.fps)}
        />
        <MetricCard
          label={t("dock.performanceTab.domNodes")}
          value={String(current.domNodes)}
        />
        <MetricCard
          label={t("dock.performanceTab.reactRoots")}
          value={String(current.reactRoots)}
        />
      </div>

      {/* Heap sparkline */}
      {memorySupported && heapHistory.length >= 2 && (
        <div className="dock-perf-sparkline">
          <span className="dock-perf-sparkline__label">{t("dock.performanceTab.heapTrend")}</span>
          <Sparkline data={heapHistory} color={heapColor(current.heapFraction)} />
        </div>
      )}

      {/* FPS sparkline */}
      {fpsHistory.length >= 2 && (
        <div className="dock-perf-sparkline">
          <span className="dock-perf-sparkline__label">{t("dock.performanceTab.fpsTrend")}</span>
          <Sparkline data={fpsHistory} color={fpsColor(current.fps)} />
        </div>
      )}

      {!memorySupported && (
        <div className="dock-perf-hint">
          {t("dock.performanceTab.memoryStatsUnavailable")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Resource Consumers
// ---------------------------------------------------------------------------

function ConsumersSection() {
  const { t } = useTranslation();
  const consumers = useMemo(() => {
    const items: Array<{ label: string; description: string; severity: "low" | "medium" | "high" }> = [];

    // Check if large number of DOM nodes
    const domCount = document.getElementsByTagName("*").length;
    if (domCount > 3000) {
      items.push({
        label: t("dock.performanceTab.domNodeCount"),
        description: t("dock.performanceTab.domNodeCountDesc", { count: domCount }),
        severity: domCount > 5000 ? "high" : "medium",
      });
    }

    // Check interval count (rough heuristic)
    items.push({
      label: t("dock.performanceTab.backgroundPolling"),
      description: t("dock.performanceTab.backgroundPollingDesc"),
      severity: "medium",
    });

    items.push({
      label: t("dock.performanceTab.bibleEmbeddings"),
      description: t("dock.performanceTab.bibleEmbeddingsDesc"),
      severity: "high",
    });

    return items;
  }, [t]);

  if (consumers.length === 0) return null;

  return (
    <div className="dock-perf-section">
      <div className="dock-perf-section__header">
        <Icon name="warning" size={14} />
        <span className="dock-perf-section__title">{t("dock.performanceTab.topResourceConsumers")}</span>
      </div>
      <div className="dock-perf-consumers">
        {consumers.map((item) => (
          <div key={item.label} className="dock-perf-consumer">
            <span
              className="dock-perf-consumer__dot"
              style={{
                background:
                  item.severity === "high"
                    ? "var(--dock-red, #EF4444)"
                    : item.severity === "medium"
                      ? "var(--dock-yellow, #F59E0B)"
                      : "var(--dock-green, #22C55E)",
              }}
            />
            <div className="dock-perf-consumer__info">
              <div className="dock-perf-consumer__label">{item.label}</div>
              <div className="dock-perf-consumer__desc">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Tab Component
// ---------------------------------------------------------------------------

export default function DockPerformanceTab() {
  const { t } = useTranslation();
  const perf = usePerformanceMode();
  const monitor = usePerformanceMonitor(true);

  return (
    <div className="dock-perf-tab">
      <div className="dock-perf-header">
        <Icon name="speed" size={16} />
        <span className="dock-perf-header__title">{t("dock.performanceTab.title")}</span>
        {perf.active && (
          <span className="dock-perf-header__badge">{t("dock.performanceTab.active")}</span>
        )}
      </div>

      <PerfModeSection perf={perf} />
      <MetricsSection monitor={monitor} />
      <ConsumersSection />
    </div>
  );
}
