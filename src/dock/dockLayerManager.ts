export type DockLayerKind = "owner" | "overlay" | "surface" | "card";

const DOCK_CLASS_PREFIX = /^(?:dock-|dtb-|ssm-|bible-)/;
const DOCK_OWNER_CLASS_NAMES = new Set([
  "bible-version-library",
  "dock-auto-advance",
  "dock-bible-actions__compare-group",
  "dock-bible-reader__quick-actions",
  "dock-bible-reference-trigger",
  "dock-bible-compare-trigger",
  "dock-btm-overflow",
  "dock-lt-panel-bottom",
  "dock-notes-text-tools__autosplit",
  "dock-scene-routing-control",
  "dock-theme-quick",
  "dock-translation",
  "dock-worship-summary__overflow-wrap",
]);

const DOCK_SURFACE_CLASS = /(?:^|[-_])(?:modal|popover|dropdown|menu|dialog|panel|card|quick-actions|quick|pane)(?:$|--|-(?:list|wrap|content|panel))/;
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

/**
 * Classify the rendered Dock surfaces without requiring every tab to thread
 * another prop through its component tree. This also covers portaled menus,
 * which are mounted outside the Dock root but retain their Dock class names.
 */
export function getDockLayerKind(element: Element): DockLayerKind | null {
  if (hasDockNamedClass(element, (className) => DOCK_OWNER_CLASS_NAMES.has(className))) {
    return "owner";
  }

  if (hasDockNamedClass(element, (className) => DOCK_OVERLAY_CLASS.test(className))) {
    return "overlay";
  }

  if (hasDockNamedClass(element, (className) => DOCK_CARD_CLASS.test(className))) {
    return "card";
  }

  if (hasDockRole(element) || hasDockNamedClass(element, (className) => DOCK_SURFACE_CLASS.test(className))) {
    return "surface";
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

  element.setAttribute("data-dock-layer-surface", "true");
  element.setAttribute("data-dock-layer-kind", kind);
  if (kind === "overlay") {
    element.setAttribute("data-dock-layer-overlay", "true");
    element.removeAttribute("data-dock-scroll-surface");
  } else if (kind === "owner") {
    element.removeAttribute("data-dock-layer-overlay");
    element.removeAttribute("data-dock-scroll-surface");
  } else {
    element.removeAttribute("data-dock-layer-overlay");
    element.setAttribute("data-dock-scroll-surface", "true");
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
 * Raise every layer owner between a clicked control and its surface. Raising
 * the ancestors as well as the menu itself is important for absolute/fixed
 * popovers that otherwise remain trapped below a sibling stacking context.
 */
export function raiseDockLayerAtTarget(target: EventTarget | null, zIndex: number): boolean {
  let element: Element | null = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  const layers: Element[] = [];

  while (element) {
    const kind = getDockLayerKind(element);
    if (kind) {
      setDockLayerAttributes(element, kind);
      layers.push(element);
    }
    element = element.parentElement;
  }

  for (const layer of layers) {
    layer.setAttribute("data-dock-layer-active", "true");
    if (layer instanceof HTMLElement) {
      layer.style.setProperty("--dock-layer-z-index", String(zIndex));
    }
  }

  return layers.length > 0;
}
