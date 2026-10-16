export type PreferredWorkspace = "studio" | "obs";

export const PREFERRED_WORKSPACE_KEY = "mce-preferred-workspace-v1";
export const ONBOARDING_COMPLETED_KEY = "mce-onboarding-completed-v1";
const LEGACY_ONBOARDING_COMPLETED_KEY = "mce-onboarding-complete";

export function getPreferredWorkspace(): PreferredWorkspace | null {
  const value = localStorage.getItem(PREFERRED_WORKSPACE_KEY);
  return value === "studio" || value === "obs" ? value : null;
}

export function setPreferredWorkspace(workspace: PreferredWorkspace): void {
  localStorage.setItem(PREFERRED_WORKSPACE_KEY, workspace);
}

export function isOnboardingCompleted(): boolean {
  if (localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "true") return true;
  if (localStorage.getItem(LEGACY_ONBOARDING_COMPLETED_KEY) !== "true") return false;

  // Existing installs completed the original OBS onboarding. Preserve that path.
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
  if (!getPreferredWorkspace()) setPreferredWorkspace("obs");
  return true;
}

export function completeWorkspaceOnboarding(): void {
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
  // Keep older consumers that still read the original completion flag working.
  localStorage.setItem(LEGACY_ONBOARDING_COMPLETED_KEY, "true");
}

export function shouldAutoConnectObs(): boolean {
  const workspace = getPreferredWorkspace();
  if (workspace) return workspace === "obs";
  return isOnboardingCompleted();
}

export function resetWorkspaceOnboarding(): void {
  localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  localStorage.removeItem(LEGACY_ONBOARDING_COMPLETED_KEY);
  localStorage.removeItem(PREFERRED_WORKSPACE_KEY);
}
