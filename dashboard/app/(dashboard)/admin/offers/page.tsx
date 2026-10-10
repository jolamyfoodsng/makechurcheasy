"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Search, X } from "lucide-react";
import { LadderEditor } from "./LadderEditor";
import {
  type LadderResults,
  type OfferLadder,
  type OffersPayload,
  type OfferSettings,
  type RunReport,
  type UserJourneyRow,
  type UserOfferRow,
  describeRung,
} from "./types";

type Tab = "ladders" | "results" | "people" | "limits";
type Toast = { type: "success" | "error"; message: string };

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error || `Request failed (${response.status})`);
  return payload as T;
}

export default function AdminOffersPage() {
  const [data, setData] = useState<OffersPayload | null>(null);
  const [settings, setSettings] = useState<OfferSettings | null>(null);
  const [ladders, setLadders] = useState<OfferLadder[]>([]);
  const [tab, setTab] = useState<Tab>("ladders");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<RunReport | null>(null);

  const apply = useCallback((payload: OffersPayload) => {
    setData(payload);
    setSettings(payload.settings);
    setLadders(payload.ladders);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      apply(await api<OffersPayload>("/api/admin/offers"));
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Could not load offers" });
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const dirty = useMemo(
    () => Boolean(data) && (JSON.stringify(data?.settings) !== JSON.stringify(settings) || JSON.stringify(data?.ladders) !== JSON.stringify(ladders)),
    [data, settings, ladders],
  );

  const save = async (override?: { settings?: Partial<OfferSettings> }) => {
    if (!settings) return;
    setSaving(true);
    try {
      const body = { settings: { ...settings, ...(override?.settings || {}) }, ladders };
      apply(await api<OffersPayload>("/api/admin/offers", { method: "PUT", body: JSON.stringify(body) }));
      setPreview(null);
      setToast({ type: "success", message: "Saved" });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Could not save" });
    } finally {
      setSaving(false);
      setConfirmingSwitch(false);
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const { report } = await api<{ report: RunReport }>("/api/admin/offers/dry-run", { method: "POST", body: "{}" });
      setPreview(report);
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "Preview failed" });
    } finally {
      setPreviewing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="adm-page">
        <div className="adm-empty"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading offers…</div>
      </div>
    );
  }
  if (!data || !settings) {
    return (
      <div className="adm-page">
        <div className="adm-empty">Offers could not be loaded.</div>
      </div>
    );
  }

  const enabledLadders = ladders.filter((ladder) => ladder.enabled).length;
  const savedOn = data.settings.enabled;

  return (
    <div className="adm-page">
      {toast && (
        <div
          role="status"
          className="adm-card fixed right-5 top-5 z-50 flex items-center gap-2 px-4 py-3 text-[13px] shadow-lg"
        >
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4 text-[var(--mce-admin-success)]" /> : <X className="h-4 w-4 text-[var(--mce-admin-danger)]" />}
          <span className="text-[var(--mce-admin-text)]">{toast.message}</span>
        </div>
      )}

      <header className="adm-header">
        <div>
          <h1 className="adm-title">Win-back offers</h1>
          <p className="adm-subtitle">
            Offers that get better each time someone ignores one. They show as a pop-up when the person comes back, and by
            email if they don&apos;t. Free time is always the Basic plan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="adm-icon-btn" onClick={() => void load()} disabled={loading} aria-label="Refresh" title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </button>
        </div>
      </header>

      {/* Master switch */}
      <section className="adm-card mb-6 px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`adm-badge ${savedOn ? "adm-badge--success" : "adm-badge--warning"}`}>
                <span className="adm-badge__dot" />
                {savedOn ? "Offers are ON" : "Offers are OFF"}
              </span>
              <span className="text-[13px] text-[var(--mce-admin-text-secondary)]">
                {savedOn
                  ? `${data.settings.maxNewOffersPerRun} new offers at most per day. ${data.openOffers.toLocaleString()} open right now.`
                  : "Nothing is sent or shown while this is off."}
              </span>
            </div>
            {!savedOn && (
              <p className="adm-hint">
                Turn on a ladder below, run a preview to see who would get an offer, then turn offers on. The first day starts at
                04:15 UTC (05:15 in Lagos).
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void runPreview()} disabled={previewing || dirty}>
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Preview next run
            </button>
            {savedOn ? (
              <button type="button" className="adm-btn adm-btn--danger" onClick={() => void save({ settings: { enabled: false } })} disabled={saving}>
                Turn off
              </button>
            ) : confirmingSwitch ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[var(--mce-admin-text-secondary)]">
                  {enabledLadders === 0 ? "No ladder is on yet." : `${enabledLadders} ladder${enabledLadders === 1 ? "" : "s"} will start tomorrow.`}
                </span>
                <button type="button" className="adm-btn adm-btn--primary" onClick={() => void save({ settings: { enabled: true } })} disabled={saving}>
                  Yes, turn on
                </button>
                <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setConfirmingSwitch(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="adm-btn adm-btn--primary" onClick={() => setConfirmingSwitch(true)} disabled={dirty}>
                Turn on offers
              </button>
            )}
          </div>
        </div>
        {dirty && <p className="adm-hint">Save your changes before previewing or switching offers on.</p>}
      </section>

      {preview && <PreviewPanel report={preview} ladders={ladders} onClose={() => setPreview(null)} />}

      <div className="adm-tabs mb-5" role="tablist">
        {(
          [
            ["ladders", "Ladders"],
            ["results", "Results"],
            ["people", "People"],
            ["limits", "Safety limits"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`adm-tab ${tab === key ? "adm-tab--active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "ladders" && (
        <div className="space-y-6">
          {ladders.map((ladder, index) => (
            <section key={ladder.id} className="adm-card">
              <div className="adm-card__head">
                <div>
                  <div className="adm-card__title">{ladder.name}</div>
                  <div className="text-[12px] text-[var(--mce-admin-text-muted)]">{ladder.description}</div>
                </div>
                <label className="inline-flex items-center gap-2 text-[13px] text-[var(--mce-admin-text)]">
                  <input
                    type="checkbox"
                    checked={ladder.enabled}
                    onChange={(event) => setLadders(ladders.map((item, i) => (i === index ? { ...item, enabled: event.target.checked } : item)))}
                  />
                  Ladder is on
                </label>
              </div>
              <div className="p-4">
                <LadderEditor ladder={ladder} onChange={(next) => setLadders(ladders.map((item, i) => (i === index ? next : item)))} />
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "results" && <ResultsTab results={data.results} ladders={data.ladders} holdoutPercent={data.settings.holdoutPercent} />}

      {tab === "people" && <PeopleTab ladders={data.ladders} onToast={setToast} />}

      {tab === "limits" && (
        <section className="adm-card">
          <div className="adm-card__head">
            <div className="adm-card__title">Safety limits</div>
          </div>
          <div className="grid gap-5 p-4 md:grid-cols-2">
            {(
              [
                ["maxNewOffersPerRun", "New offers per day", "The most new offers one daily run will send. Stops a big backlog from going out all at once when you first turn a ladder on.", 1, 5000],
                ["holdoutPercent", "Hold back for comparison (%)", "This share of eligible people get no offers, so Results can show what the offers add. 10 is a good start.", 0, 50],
                ["maxOffersPer90Days", "Offers per person in 90 days", "No one gets more than this many offers across all ladders in any 90 days.", 1, 20],
                ["maxFreeDaysPerUser", "Free days per person, ever", "Free Basic days and extra trial days added together. A step that would go past this is skipped.", 0, 365],
                ["weeklyFreeGrantBudget", "Free offers per week, all people (0 = no limit)", "Caps how many free-time offers go out in any 7 days, so free time can never grow faster than you intend.", 0, 100000],
                ["maxEmailsPer7Days", "Offer emails per person per week", "Pop-ups still show; this only limits email.", 1, 7],
              ] as Array<[keyof OfferSettings, string, string, number, number]>
            ).map(([key, label, hint, min, max]) => (
              <div key={key}>
                <label className="adm-label">{label}</label>
                <input
                  type="number"
                  className="adm-input"
                  min={min}
                  max={max}
                  value={Number(settings[key])}
                  onChange={(event) => setSettings({ ...settings, [key]: Math.min(max, Math.max(min, Number(event.target.value) || 0)) })}
                />
                <p className="adm-hint">{hint}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PreviewPanel({ report, ladders, onClose }: { report: RunReport; ladders: OfferLadder[]; onClose: () => void }) {
  const label = (key: string) => {
    const [ladderId, rungId] = key.split(":");
    const ladder = ladders.find((item) => item.id === ladderId);
    const rung = ladder?.rungs.find((item) => item.id === rungId);
    return `${ladder?.name ?? ladderId}, ${rung ? describeRung(rung) : rungId}`;
  };
  return (
    <section className="adm-card mb-6">
      <div className="adm-card__head">
        <div className="adm-card__title">Preview of the next run (nothing was sent or changed)</div>
        <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close preview">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        {[
          ["People looked at", report.evaluated],
          ["Would get an offer today", report.issued],
          ["Qualify in total", report.eligibleNow],
          ["Held back for comparison", report.holdout],
          ["Waiting for their turn", report.waiting],
          ["Left for tomorrow (daily limit)", report.deferredByRunLimit],
          ["Steps skipped by limits", report.skippedRungs],
          ["Finished or closed", report.sunset + report.closed],
        ].map(([name, value]) => (
          <div key={String(name)} className="adm-card px-4 py-3">
            <div className="adm-stat__label">{name}</div>
            <div className="adm-stat__value">{Number(value).toLocaleString()}</div>
          </div>
        ))}
      </div>
      {Object.keys(report.byRung).length > 0 && (
        <div className="px-4 pb-2">
          <div className="adm-label">Who would get what</div>
          <ul className="mb-3 space-y-1 text-[13px] text-[var(--mce-admin-text-secondary)]">
            {Object.entries(report.byRung).map(([key, count]) => (
              <li key={key}>
                {count.toLocaleString()} × {label(key)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.samples.length > 0 && (
        <div className="overflow-x-auto">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Example recipients</th>
                <th>Offer</th>
              </tr>
            </thead>
            <tbody>
              {report.samples.map((sample) => (
                <tr key={`${sample.userId}-${sample.rungId}`}>
                  <td>{sample.email || sample.userId}</td>
                  <td>{label(`${sample.ladderId}:${sample.rungId}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report.issued === 0 && <p className="adm-hint px-4 pb-4">No one would get an offer today with the saved settings.</p>}
    </section>
  );
}

function ResultsTab({ results, ladders, holdoutPercent }: { results: LadderResults[]; ladders: OfferLadder[]; holdoutPercent: number }) {
  return (
    <div className="space-y-6">
      {results.map((result) => {
        const ladder = ladders.find((item) => item.id === result.ladderId);
        const offeredRate = result.offered.people ? result.offered.converted / result.offered.people : 0;
        const holdoutRate = result.holdout.people ? result.holdout.converted / result.holdout.people : 0;
        const enough = result.holdout.people >= 30 && result.offered.people >= 30;
        const lift = (offeredRate - holdoutRate) * 100;
        return (
          <section key={result.ladderId} className="adm-card">
            <div className="adm-card__head">
              <div className="adm-card__title">{ladder?.name ?? result.ladderId}</div>
              <div className="text-[12px] text-[var(--mce-admin-text-muted)]">
                {result.open.toLocaleString()} in progress, {result.waiting.toLocaleString()} waiting for a first offer, {result.sunset.toLocaleString()} finished
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th className="adm-num">Sent</th>
                    <th className="adm-num">Emailed</th>
                    <th className="adm-num">Seen</th>
                    <th className="adm-num">Clicked</th>
                    <th className="adm-num">Claimed</th>
                    <th className="adm-num">Paid with offer</th>
                    <th className="adm-num">Ended unused</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rungs.map((rung, index) => (
                    <tr key={rung.rungId}>
                      <td>
                        {index + 1}. {rung.label}
                      </td>
                      <td className="adm-num">{rung.issued.toLocaleString()}</td>
                      <td className="adm-num">{rung.emailed.toLocaleString()}</td>
                      <td className="adm-num">{rung.seen.toLocaleString()}</td>
                      <td className="adm-num">{rung.clicked.toLocaleString()}</td>
                      <td className="adm-num">{rung.claimed.toLocaleString()}</td>
                      <td className="adm-num">
                        {rung.redeemed.toLocaleString()} <span className="text-[var(--mce-admin-text-muted)]">({pct(rung.redeemed, rung.issued)})</span>
                      </td>
                      <td className="adm-num">{rung.expired.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-3">
              <div className="adm-card px-4 py-3">
                <div className="adm-stat__label">Eligible people who could get offers</div>
                <div className="adm-stat__value">{pct(result.offered.converted, result.offered.people)}</div>
                <div className="text-[12px] text-[var(--mce-admin-text-muted)]">
                  {result.offered.converted.toLocaleString()} of {result.offered.people.toLocaleString()} became paying customers
                </div>
              </div>
              <div className="adm-card px-4 py-3">
                <div className="adm-stat__label">Held back (no offers)</div>
                <div className="adm-stat__value">{pct(result.holdout.converted, result.holdout.people)}</div>
                <div className="text-[12px] text-[var(--mce-admin-text-muted)]">
                  {result.holdout.converted.toLocaleString()} of {result.holdout.people.toLocaleString()} became paying customers
                </div>
              </div>
              <div className="adm-card px-4 py-3">
                <div className="adm-stat__label">What the offers added</div>
                <div className="adm-stat__value">{enough ? `${lift >= 0 ? "+" : ""}${Math.round(lift * 10) / 10} pts` : "Not enough yet"}</div>
                <div className="text-[12px] text-[var(--mce-admin-text-muted)]">
                  {enough
                    ? "Difference in how many became paying customers"
                    : `Needs at least 30 people in each group. ${holdoutPercent}% are held back.`}
                </div>
              </div>
            </div>
          </section>
        );
      })}
      <p className="adm-hint">
        Revenue is not totalled here because payments come in different currencies. Use Discounts and Subscriptions for amounts.
        Free periods that end on their own are not counted as paying customers.
      </p>
    </div>
  );
}

interface FoundUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  emailVerified: boolean;
}

function PeopleTab({ ladders, onToast }: { ladders: OfferLadder[]; onToast: (toast: Toast) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoundUser | null>(null);
  const [history, setHistory] = useState<{ journeys: UserJourneyRow[]; offers: UserOfferRow[] } | null>(null);
  const [busy, setBusy] = useState("");

  const search = async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const { users } = await api<{ users: FoundUser[] }>(`/api/admin/offers/lookup?q=${encodeURIComponent(query.trim())}`);
      setFound(users);
    } catch (error) {
      onToast({ type: "error", message: error instanceof Error ? error.message : "Search failed" });
    } finally {
      setSearching(false);
    }
  };

  const open = async (user: FoundUser) => {
    setSelected(user);
    try {
      setHistory(await api(`/api/admin/offers/users/${user.id}`));
    } catch (error) {
      onToast({ type: "error", message: error instanceof Error ? error.message : "Could not load history" });
    }
  };

  const act = async (action: "issue" | "suppress", ladderId: string) => {
    if (!selected) return;
    setBusy(`${action}:${ladderId}`);
    try {
      await api(`/api/admin/offers/users/${selected.id}`, { method: "POST", body: JSON.stringify({ action, ladderId }) });
      onToast({ type: "success", message: action === "issue" ? "Offer issued" : "Offers stopped for this person" });
      await open(selected);
    } catch (error) {
      onToast({ type: "error", message: error instanceof Error ? error.message : "Could not do that" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6">
      <section className="adm-card p-4">
        <label className="adm-label" htmlFor="offer-user-search">Find a person by email</label>
        <div className="flex gap-2">
          <input
            id="offer-user-search"
            className="adm-input"
            placeholder="name@church.org"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void search();
            }}
          />
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => void search()} disabled={searching || query.trim().length < 3}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </div>
        {found.length > 0 && (
          <ul className="mt-3 divide-y divide-[var(--mce-admin-border)]">
            {found.map((user) => (
              <li key={user.id}>
                <button type="button" className="flex w-full items-center justify-between py-2 text-left text-[13px] text-[var(--mce-admin-text)] hover:underline" onClick={() => void open(user)}>
                  <span>
                    {user.name ? `${user.name} · ` : ""}
                    {user.email}
                  </span>
                  <span className="text-[var(--mce-admin-text-muted)]">{user.plan}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && history && (
        <section className="adm-card">
          <div className="adm-card__head">
            <div>
              <div className="adm-card__title">{selected.email}</div>
              <div className="text-[12px] text-[var(--mce-admin-text-muted)]">
                Plan: {selected.plan}. Email {selected.emailVerified ? "verified" : "not verified"}.
              </div>
            </div>
          </div>
          <div className="space-y-5 p-4">
            {ladders.map((ladder) => {
              const journey = history.journeys.find((item) => item.ladderId === ladder.id);
              const offers = history.offers.filter((offer) => offer.ladderId === ladder.id);
              return (
                <div key={ladder.id}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold text-[var(--mce-admin-text)]">
                      {ladder.name}{" "}
                      <span className="ml-2 font-normal text-[var(--mce-admin-text-muted)]">
                        {journey
                          ? `${journey.state}${journey.holdout ? " (held back for comparison)" : ""}${journey.closedReason ? `, ${journey.closedReason}` : ""}${journey.nextEvaluateAt ? `, next check ${fmt(journey.nextEvaluateAt)}` : ""}`
                          : "not on this ladder yet"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" disabled={busy !== ""} onClick={() => void act("issue", ladder.id)}>
                        {busy === `issue:${ladder.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Give next offer now
                      </button>
                      <button type="button" className="adm-btn adm-btn--danger adm-btn--sm" disabled={busy !== "" || journey?.state === "closed"} onClick={() => void act("suppress", ladder.id)}>
                        Stop offers
                      </button>
                    </div>
                  </div>
                  {offers.length === 0 ? (
                    <p className="adm-hint">No offers on this ladder yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="adm-table">
                        <thead>
                          <tr>
                            <th>Step</th>
                            <th>Status</th>
                            <th>Sent</th>
                            <th>Closes</th>
                            <th>Email</th>
                            <th>Seen</th>
                            <th>Claimed</th>
                            <th>Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {offers.map((offer) => {
                            const rung = ladder.rungs[offer.rungIndex];
                            return (
                              <tr key={offer._id}>
                                <td>{rung ? describeRung(rung) : offer.rungId}</td>
                                <td>{offer.status}{offer.note ? ` (${offer.note})` : ""}</td>
                                <td>{fmt(offer.issuedAt)}</td>
                                <td>{fmt(offer.closesAt)}</td>
                                <td>{offer.channels?.email?.sentAt ? fmt(offer.channels.email.sentAt) : offer.channels?.email?.skippedReason ?? "—"}</td>
                                <td>{fmt(offer.seenAt)}</td>
                                <td>{fmt(offer.claimedAt)}</td>
                                <td>{fmt(offer.redeemedAt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
