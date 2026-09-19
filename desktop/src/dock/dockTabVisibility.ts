/** Return whether a Dock tab is currently visible in its shell panel. */
export function isDockTabVisible(element: Element | null): boolean {
  const panel = element?.closest<HTMLElement>(".dock-tab-panel");
  return !panel || !panel.hidden;
}
