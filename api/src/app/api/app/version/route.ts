import { NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getEnforcementWindow } from "@/lib/versionGate";

/**
 * GET /api/app/version
 *
 * Public endpoint — returns version gate settings for the desktop app.
 * No authentication required. Used by client startup to decide whether
 * to block access or show an update prompt.
 *
 * Reads from platform_settings (single source of truth for admin config).
 */
export async function GET() {
  try {
    const settings = await getPlatformSettings();
    const window = getEnforcementWindow(settings.appUpdates);
    return NextResponse.json({
      forceUpdatesEnabled: settings.appUpdates.forceUpdatesEnabled,
      emergencyLock: settings.appUpdates.emergencyLock,
      maintenanceMode: settings.security.maintenanceMode,
      maintenanceMessage: settings.security.maintenanceMessage || "",
      emergencyLockDelay: settings.appUpdates.emergencyLockDelay ?? 0,
      minimumSupportedVersion: settings.appUpdates.minimumSupportedVersion,
      gracePeriodHours: settings.appUpdates.gracePeriodHours,
      updateMessage: settings.appUpdates.updateMessage,
      latestVersion: settings.appUpdates.latestVersion,
      emergencyLockMessage: settings.appUpdates.emergencyLockMessage,
      windowsDownloadUrl: settings.appUpdates.windowsDownloadUrl,
      macDownloadUrl: settings.appUpdates.macDownloadUrl,
      linuxDownloadUrl: settings.appUpdates.linuxDownloadUrl,
      releaseNotesUrl: settings.appUpdates.releaseNotesUrl,
      policyPublishedAt: settings.appUpdates.policyPublishedAt,
      enforcementStartedAt: settings.appUpdates.enforcementStartedAt ?? null,
      enforcementDeadlineAt:
        settings.appUpdates.forceUpdatesEnabled && window.deadlineAtMs
          ? new Date(window.deadlineAtMs).toISOString()
          : null,
      serverTime: new Date().toISOString(),
      emergencyLockEnabledAt: settings.appUpdates.emergencyLockEnabledAt,
      emergencyLockEffectiveAt: settings.appUpdates.emergencyLockEffectiveAt,
    });
  } catch (error) {
    console.error("Get app version error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
