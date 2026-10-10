"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Checked with the palette validator against the admin surface (#151618).
export const VIEWS_COLOR = "#3b82f6";
export const CLICKS_COLOR = "#cf7a2e";

export interface ViewsClicksPoint {
  label: string;
  views: number;
  clicks: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const views = payload.find((item) => item.dataKey === "views")?.value ?? 0;
  const clicks = payload.find((item) => item.dataKey === "clicks")?.value ?? 0;
  return (
    <div className="rounded-lg border border-[var(--mce-admin-border-strong)] bg-[var(--mce-admin-surface-raised)] px-3 py-2 text-[12px] shadow-xl">
      <div className="mb-1 font-medium text-[var(--mce-admin-text)]">{label}</div>
      <div className="flex items-center justify-between gap-6 text-[var(--mce-admin-text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: VIEWS_COLOR }} />
          Views
        </span>
        <span className="tabular-nums text-[var(--mce-admin-text)]">{views.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between gap-6 text-[var(--mce-admin-text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: CLICKS_COLOR }} />
          Clicks
        </span>
        <span className="tabular-nums text-[var(--mce-admin-text)]">{clicks.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function ViewsClicksChart({ data, height = 240 }: { data: ViewsClicksPoint[]; height?: number }) {
  const hasData = data.some((point) => point.views > 0 || point.clicks > 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[12px] text-[var(--mce-admin-text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: VIEWS_COLOR }} />
          Views
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: CLICKS_COLOR }} />
          Clicks
        </span>
      </div>
      <div style={{ height }} role="img" aria-label="Views and clicks over time">
        {!hasData ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[var(--mce-admin-text-muted)]">
            No views or clicks in this period yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={1}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="transparent"
                tick={{ fill: "#77777f", fontSize: 11 }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                stroke="transparent"
                tick={{ fill: "#77777f", fontSize: 11 }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.18)" }} />
              <Line type="monotone" dataKey="views" stroke={VIEWS_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#151618", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="clicks" stroke={CLICKS_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#151618", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
