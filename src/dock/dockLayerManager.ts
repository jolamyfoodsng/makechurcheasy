export type DockLayerKind = "owner" | "overlay" | "surface" | "card";

const DOCK_CLASS_PREFIX = /^(?:dock-|dtb-|ssm-|bible-)/;
const DOCK_OWNER_CLASS_NAMES = new Set([
  "bible-version-library",
  "dock-auto-advance",
  "dock-bible-actions__compare-group",
  "dock-bible-search-row",
  "dock-bible-reader__quick-actions",
  "dock-bible-reference-trigger",
  "dock-bible-compare-trigger",
  "dock-bible-topbar",
  "dock-btm-overflow",
  "dock-lt-panel-bottom",
  "dock-notes-text-tools__autosplit",
  "dock-scene-routing-control",
  "dock-theme-quick",
  "dock-translation",
  "dock-worship-summary__overflow-wrap",
]);

// These owners can contain a transient surface that extends beyond their own
// stacking context. Promote the context with the surface so a previously
// active sibling card cannot paint over the open popover.
const DOCK_PROMOTABLE_OWNER_CLASS_NAMES = new Set([
  "dock-bible-search-row",
  "dock-bible-topbar",
]);

// Keep structural panels out of the transient scroll layer. Generic names
// such as "panel" and "pane" are used throughout the Dock for layout
// containers, while these names identify surfaces that may extend over cards.
const DOCK_SURFACE_CLASS = /(?:^|[-_])(?:modal|popover|dropdown|menu|dialog)(?:$|--|-(?:list|wrap|content|panel))/;
const DOCK_SURFACE_CLASS_NAMES = new Set([
  // This surface uses role="region" because it is also embedded in the
  // toolbar, so it needs an explicit transient classification.
  "dock-translation__panel",
]);
const DOCK_OVERLAY_CLASS = /(?:^|[-_])(?:overlay|backdrop)(?:$|--)/;
const DOCK_CARD_CLASS = /(?:^|[-_])card(?:$|--)/;

function hasDockRole(element: Element): boolean {
  const role = element.getAttribute("role");
  return role === "dialog" || role === "menu";
}

function hasDockNamedClass(element: Element, predicate: (className: string) => boolean): boolean {
  return Array.from(element.classList).some((className) => {
    if (!DOCK_CLASS_PREFIX.test(className)) return false;
    return predicate(className);
  });
}

function hasDockOwnerClass(element: Element, ownerNames: Set<string>): boolean {
  return hasDockNamedClass(element, (className) => ownerNames.has(className));
}

/**
 * Classify the rendered Dock surfaces without requiring every tab to thread
 * another prop through its component tree. This also covers portaled menus,
 * which are mounted outside the Dock root but retain their Dock class names.
 */
export function getDockLayerKind(element: Element): DockLayerKind | null {
  if (hasDockOwnerClass(element, DOCK_OWNER_CLASS_NAMES)) {
    return "owner";
  }

  if (hasDockNamedClass(element, (className) => DOCK_OVERLAY_CLASS.test(className))) {
    return "overlay";
  }

  if (
    hasDockRole(element)
    || hasDockNamedClass(element, (className) => DOCK_SURFACE_CLASS_NAMES.has(className) || DOCK_SURFACE_CLASS.test(className))
  ) {
    return "surface";
  }

  if (hasDockNamedClass(element, (className) => DOCK_CARD_CLASS.test(className))) {
    return "card";
  }

  return null;
}

function setDockLayerAttributes(element: Element, kind: DockLayerKind | null): void {
  if (!kind) {
    element.removeAttribute("data-dock-layer-surface");
    element.removeAttribute("data-dock-layer-kind");
    element.removeAttribute("data-dock-scroll-surface");
    element.removeAttribute("data-dock-layer-overlay");
    element.removeAttribute("data-dock-layer-active");
    if (element instanceof HTMLElement) {
      element.style.removeProperty("--dock-layer-z-index");
    }
    return;
  }

  element.setAttribute("data-dock-layer-kind", kind);
  if (kind === "overlay") {
    element.setAttribute("data-dock-layer-surface", "true");
    element.setAttribute("data-dock-layer-overlay", "true");
    element.removeAttribute("data-dock-scroll-surface");
  } else if (kind === "surface") {
    element.setAttribute("data-dock-layer-surface", "true");
    element.removeAttribute("data-dock-layer-overlay");
    element.setAttribute("data-dock-scroll-surface", "true");
  } else {
    // Main cards and their structural owners are not transient layers. Keep
    // them out of the overlay registry so clicking a card cannot promote it
    // above a later modal or popover.
    element.removeAttribute("data-dock-layer-surface");
    element.removeAttribute("data-dock-layer-overlay");
    element.removeAttribute("data-dock-scroll-surface");
    element.removeAttribute("data-dock-layer-active");
    if (element instanceof HTMLElement) {
      element.style.removeProperty("--dock-layer-z-index");
    }
  }
}

export function markDockLayerElement(element: Element): void {
  setDockLayerAttributes(element, getDockLayerKind(element));
}

export function markDockLayerSubtree(node: Node): void {
  if (!(node instanceof Element)) return;
  markDockLayerElement(node);
  node.querySelectorAll("*").forEach((element) => markDockLayerElement(element));
}

/**
 * Raise the transient surface between a clicked control and its surface.
 * Raising transient ancestors as well as the menu itself is important for
 * absolute/fixed popovers that would otherwise remain trapped below a sibling
 * stacking context. Structural cards stay out of this registry; only owners
 * that host an extending transient surface are promoted with it.
 */
export function raiseDockLayerAtTarget(target: EventTarget | null, zIndex: number): boolean {
  let element: Element | null = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  const layers: Array<{ element: Element; kind: DockLayerKind }> = [];

  while (element) {
    const kind = getDockLayerKind(element);
    if (kind) {
      setDockLayerAttributes(element, kind);
      layers.push({ element, kind });
    }
    element = element.parentElement;
  }

  for (const layer of layers) {
    if (layer.kind === "owner" && !hasDockOwnerClass(layer.element, DOCK_PROMOTABLE_OWNER_CLASS_NAMES)) {
      continue;
    }
    if (layer.kind !== "owner" && layer.kind !== "overlay" && layer.kind !== "surface") continue;
    layer.element.setAttribute("data-dock-layer-active", "true");
    if (layer.element instanceof HTMLElement) {
      layer.element.style.setProperty("--dock-layer-z-index", String(zIndex));
    }
  }

  return layers.length > 0;
}
