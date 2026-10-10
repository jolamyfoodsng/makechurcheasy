"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Lock, Save, AlertTriangle, Info, Users } from "lucide-react";
import { Card, CardHeader, Button, Input, Textarea, Toggle } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { PlatformSettings } from "../types";

interface Props {
  data: PlatformSettings["appUpdates"];
  onChange: (data: PlatformSettings["appUpdates"]) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

/** "v3.4" -> "3.4.0". Anything that is not a plain version is returned trimmed. */
function normalizeVersion(value: string): string {
  const trimmed = value.trim().replace(/^v/i, "");
  if (!/^\d+(\.\d+){0,2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split(".");
  while (parts.length < 3) parts.push("0");
  return parts.join(".");
}

function isValidVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value.trim());
}

interface DeviceVersionRow {
  version: string;
  deviceCount: number;
}

function versionParts(value: string): [number, number, number] | null {
  const match = value.trim().replace(/^v/i, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/** negative when a < b, 0 when equal, positive when a > b; null when unreadable */
function compareVersions(a: string, b: string): number | null {
  const pa = versionParts(a);
  const pb = versionParts(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function formatDays(hours: number): string {
  if (hours <= 0) return "no grace period";
  const days = hours / 24;
  if (Number.isInteger(days)) return `${days} day${days === 1 ? "" : "s"}`;
  return `${Math.round(days * 10) / 10} days`;
}

function formatDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AppUpdatesSection({ data, onChange, onSave, saving }: Props) {
  const t = useTranslations("admin.settings.appUpdates");
  const tc = useTranslations("common");
  const update = (fields: Partial<PlatformSettings["appUpdates"]>) =>
    onChange({ ...data, ...fields });

  // What computers are actually running, so the admin can see who a minimum hits.
  const [deviceVersions, setDeviceVersions] = useState<DeviceVersionRow[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/device-versions", { credentials: "include" });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled && Array.isArray(body.versions)) {
          setDeviceVersions(
            body.versions.map((row: DeviceVersionRow) => ({
              version: String(row.version || ""),
              deviceCount: Number(row.deviceCount) || 0,
            })),
          );
        }
      } catch {
        // The preview is optional; settings still work without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const minimum = data.minimumSupportedVersion.trim();

  const reach = useMemo(() => {
    if (!deviceVersions || !isValidVersion(normalizeVersion(minimum))) return null;
    const min = normalizeVersion(minimum);
    const known = deviceVersions.filter((row) => versionParts(row.version));
    const total = known.reduce((sum, row) => sum + row.deviceCount, 0);
    const affected = known.filter((row) => (compareVersions(row.version, min) ?? 0) < 0);
    const affectedCount = affected.reduce((sum, row) => sum + row.deviceCount, 0);
    return { total, affectedCount, affected, min };
  }, [deviceVersions, minimum]);

  const newestInUse = useMemo(() => {
    if (!deviceVersions) return "";
    return (
      deviceVersions
        .map((row) => row.version)
        .filter((v) => versionParts(v))
        .sort((x, y) => compareVersions(y, x) ?? 0)[0] ?? ""
    );
  }, [deviceVersions]);

  const blockingErrors: string[] = [];
  if (data.forceUpdatesEnabled && !minimum) {
    blockingErrors.push("Enter the version users must update to.");
  }
  if (minimum && !isValidVersion(normalizeVersion(minimum))) {
    blockingErrors.push("The version must look like 3.34.0.");
  }

  const handleSave = async () => {
    if (blockingErrors.length > 0) {
      setSaveError(blockingErrors[0]);
      return;
    }
    setSaveError(null);
    await onSave();
  };

  const warnings: string[] = [];
  if (reach && data.forceUpdatesEnabled && reach.affectedCount === 0 && reach.total > 0) {
    warnings.push(
      `Nobody is below ${reach.min}, so nobody will be asked to update.${newestInUse ? ` Your users' newest version is ${newestInUse}; the version you enter has to be higher than the one they run.` : ""} Versions compare number by number: 3.7.0 and 3.14.0 are both OLDER than 3.33.0.`,
    );
  }
  if (data.forceUpdatesEnabled) {
    const missing = [
      !data.windowsDownloadUrl.trim() && "Windows",
      !data.macDownloadUrl.trim() && "Mac",
      !data.linuxDownloadUrl.trim() && "Linux",
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      warnings.push(
        `No download link for ${missing.join(", ")}. "Update now" will send those users to makechurcheazy.com/download instead of the installer.`,
      );
    }
  }

  const grace = data.gracePeriodHours;
  const summary = grace > 0
    ? `Anyone on a version below ${minimum || "the minimum"} sees "N days left · Update now" at the top of the desktop app and on their web dashboard. They have ${formatDays(grace)}. The last 24 hours show in red, the update window cannot be closed in the last 30 minutes, and when the time is up the old version stops working.`
    : `Anyone on a version below ${minimum || "the minimum"} is blocked straight away and has to update.`;
  const startedText = data.enforcementStartedAt ? formatDateTime(data.enforcementStartedAt) : "";
  const deadlineText = grace > 0 && data.enforcementStartedAt
    ? `Countdown started ${startedText}; old versions stop working ${formatDateTime(
        new Date(Date.parse(data.enforcementStartedAt) + grace * 3_600_000).toISOString(),
      )}. Changing Force Updates, the minimum version or the grace period restarts the countdown; editing messages or links does not.`
    : grace > 0
      ? `The countdown starts when you save (${formatDays(grace)} from then).`
      : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{t("title")}</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          {t("description")}
        </p>
      </div>

      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("versionPolicy")}
            description={t("versionPolicyDescription")}
            icon={<RefreshCw className="w-4 h-4" />}
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

        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4">
            <Toggle
              label={t("forceUpdates")}
              description={t("forceUpdatesDescription")}
              checked={data.forceUpdatesEnabled}
              onChange={(v) => update({ forceUpdatesEnabled: v })}
            />
          </div>

          <div className="px-6 py-4">
            <Toggle
              label={t("emergencyLock")}
              description={t("emergencyLockDescription")}
              checked={data.emergencyLock}
              onChange={(v) => update({ emergencyLock: v })}
              destructive
            />
          </div>

          {data.emergencyLock && (
            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{t("lockDelay")}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t("lockDelayDescription")}
                </p>
              </div>
              <select
                value={data.emergencyLockDelay}
                onChange={(e) =>
                  update({ emergencyLockDelay: Number(e.target.value) })
                }
                className="h-11 px-3 py-1.5 text-sm border border-slate-700 rounded-xl bg-slate-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              >
                <option value={0}>{t("immediate")}</option>
                <option value={12}>12 {t("hours")}</option>
                <option value={24}>24 {t("hours")}</option>
                <option value={48}>48 {t("hours")}</option>
                <option value={72}>72 {t("hours")}</option>
              </select>
            </div>
          )}

          {data.emergencyLock && (
            <div className="mx-6 my-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {data.emergencyLockDelay > 0
                ? t("emergencyLockActive", { hours: data.emergencyLockDelay })
                : t("emergencyLockActiveImmediate")}
            </div>
          )}

          {(warnings.length > 0 || data.forceUpdatesEnabled) && (
            <div className="space-y-2 px-6 py-4">
              {data.forceUpdatesEnabled && (
                <div className="flex items-start gap-2 rounded-xl border border-[#2f2f33] bg-[#18181b] px-4 py-3 text-xs leading-relaxed text-[#d4d4d8]">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a1a1aa]" />
                  <div>
                    <p>{summary}</p>
                    {deadlineText && <p className="mt-1 text-[#a1a1aa]">{deadlineText}</p>}
                  </div>
                </div>
              )}
              {warnings.map((warning) => (
                <div
                  key={warning}
                  className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          <div className="px-6 py-4">
            <Input
              label="Version users must update to"
              required
              value={data.minimumSupportedVersion}
              onChange={(e) => {
                const next = e.target.value;
                // Keep "Latest" from falling behind the required version.
                const behind =
                  !data.latestVersion.trim() ||
                  (isValidVersion(normalizeVersion(next)) &&
                    (compareVersions(data.latestVersion, normalizeVersion(next)) ?? 0) < 0);
                update({
                  minimumSupportedVersion: next,
                  ...(behind ? { latestVersion: normalizeVersion(next) } : {}),
                });
              }}
              onBlur={() =>
                update({ minimumSupportedVersion: normalizeVersion(data.minimumSupportedVersion) })
              }
              placeholder="e.g. 3.34.0"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              Type the version you want everyone on, then Save. Anyone running an older version
              gets the countdown. Use a version that is already released
              {newestInUse ? ` (the newest version your users have is ${newestInUse})` : ""}.
            </p>
          </div>

          {(reach || saveError) && (
            <div className="space-y-2 px-6 py-4">
              {reach && (
                <div className="flex items-start gap-2 rounded-xl border border-[#2f2f33] bg-[#18181b] px-4 py-3 text-xs leading-relaxed text-[#d4d4d8]">
                  <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a1a1aa]" />
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold text-white">
                        {reach.affectedCount} of {reach.total}
                      </span>{" "}
                      computers are below {reach.min}
                      {data.forceUpdatesEnabled ? " and will be asked to update." : " (Force Updates is off, so nobody is asked yet)."}
                    </p>
                    {reach.affected.length > 0 && (
                      <p className="mt-1 text-[#a1a1aa]">
                        {reach.affected
                          .slice(0, 6)
                          .map((row) => `v${row.version}: ${row.deviceCount}`)
                          .join("  ·  ")}
                        {reach.affected.length > 6 ? "  ·  …" : ""}
                      </p>
                    )}
                    <p className="mt-1 text-[#a1a1aa]">
                      Only computers running an older version are affected. Everyone already on this version or newer sees nothing.
                    </p>
                  </div>
                </div>
              )}
              {saveError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
            </div>
          )}

          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Grace period (days)"
                  type="number"
                  min={0}
                  max={90}
                  step={0.5}
                  value={Math.round((data.gracePeriodHours / 24) * 100) / 100}
                  onChange={(e) =>
                    update({
                      gracePeriodHours: Math.round(
                        Math.min(90, Math.max(0, Number(e.target.value) || 0)) * 24,
                      ),
                    })
                  }
                />
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  How long users can keep the old version. 0 blocks it straight away. Users see a
                  countdown, and the update window cannot be closed in the last 30 minutes.
                </p>
              </div>
              <Textarea
                label={t("updateMessage")}
                value={data.updateMessage}
                onChange={(e) => update({ updateMessage: e.target.value })}
                placeholder={t("updateMessagePlaceholder")}
                rows={4}
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Textarea
                label="Emergency Lock Message"
                value={data.emergencyLockMessage}
                onChange={(e) => update({ emergencyLockMessage: e.target.value })}
                placeholder="MakeChurchEasy is temporarily unavailable due to emergency maintenance."
                rows={4}
              />
              <Input
                label="Release Notes URL"
                value={data.releaseNotesUrl}
                onChange={(e) => update({ releaseNotesUrl: e.target.value })}
                placeholder="https://makechurcheazy.com/downloads/release-notes"
              />
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Windows Download URL"
                value={data.windowsDownloadUrl}
                onChange={(e) => update({ windowsDownloadUrl: e.target.value })}
                placeholder="https://makechurcheazy.com/downloads/windows"
              />
              <Input
                label="Mac Download URL"
                value={data.macDownloadUrl}
                onChange={(e) => update({ macDownloadUrl: e.target.value })}
                placeholder="https://makechurcheazy.com/downloads/mac"
              />
              <Input
                label="Linux Download URL"
                value={data.linuxDownloadUrl}
                onChange={(e) => update({ linuxDownloadUrl: e.target.value })}
                placeholder="https://makechurcheazy.com/downloads/linux"
              />
            </div>
          </div>

        </div>
      </Card>
    </div>
  );
}
