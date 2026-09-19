import type { MVSettings } from "../multiview/mvStore";

export function applyBrandingSettingsToDom(settings: Pick<MVSettings, "brandColor" | "churchName">) {
  // Branding metadata must not clear the shared app/Dock appearance tokens.
  // Those variables are owned by useAppTheme and remain active across routes.
  const churchName = settings.churchName.trim();
  document.title = churchName ? `${churchName} · MakeChurchEasy` : "MakeChurchEasy";
}
