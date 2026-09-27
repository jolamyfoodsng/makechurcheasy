/**
 * searchShortcut.ts — Universal Ctrl+F / Cmd+F search input trigger.
 *
 * Handles conventional search keyboard shortcuts (Cmd+F on macOS, Ctrl+F on Windows/Linux)
 * to locate, focus, and select the search input in the active tab, panel, modal, or page.
 */

export function isSearchKeyboardShortcut(event: KeyboardEvent): boolean {
  const hasPrimaryModifier = Boolean(event.metaKey || event.ctrlKey);
  if (!hasPrimaryModifier) return false;
  if (event.altKey) return false;

  const key = event.key ? event.key.toLowerCase() : "";
  const code = event.code;
  return key === "f" || code === "KeyF";
}

export function focusAndSelectSearchInput(input: HTMLInputElement | HTMLTextAreaElement): void {
  input.focus();
  try {
    input.select();
  } catch {
    // Some elements may not support select()
  }
  try {
    input.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } catch {
    // ignore scroll errors
  }
}

function isElementVisible(el: HTMLElement): boolean {
  if (typeof el.hasAttribute === "function" && (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true")) {
    return false;
  }
  if (typeof el.closest === "function" && el.closest("[hidden]")) {
    return false;
  }
  if ("disabled" in el && Boolean((el as any).disabled)) {
    return false;
  }

  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    try {
      const style = window.getComputedStyle(el);
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
        return false;
      }
    } catch {
      // ignore
    }
  }

  if (typeof el.getBoundingClientRect === "function") {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    } catch {
      // ignore
    }
  }
  return (el.offsetWidth ?? 0) > 0 || (el.offsetHeight ?? 0) > 0;
}

const SEARCH_SELECTORS = [
  // Specific MCE search classes
  "input.dock_search__input",
  "input.dock-media-search__input",
  "input.worship-search-input",
  "input.lib-media-search-input",
  "input.dock-sermon-theme-search__input",
  "input.bible-history-search__input",
  "input.search-input",
  "input[data-search-input]",
  // Semantic search input type
  'input[type="search"]',
  // Placeholder matches
  'input[placeholder*="Search" i]',
  'input[aria-label*="Search" i]',
  'input[placeholder*="search" i]',
  'input[aria-label*="search" i]',
  // Name/id/class matches
  'input[name*="search" i]',
  'input[id*="search" i]',
  'input[class*="search" i]',
];

export function findSearchInputElement(container: ParentNode): HTMLInputElement | HTMLTextAreaElement | null {
  for (const selector of SEARCH_SELECTORS) {
    try {
      const candidates = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector);
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (isElementVisible(candidate)) {
          return candidate;
        }
      }
    } catch {
      // Ignore querySelector syntax errors in case of legacy selectors
    }
  }
  return null;
}

export function triggerTabSearchInput(container?: HTMLElement | Document | null): boolean {
  if (typeof document === "undefined") return false;
  const root = container || document;

  // 1. Prioritize open modal, dialog, or popover with a search input
  const activeModal = document.querySelector<HTMLElement>(
    '.dock-modal:not([hidden]), [role="dialog"]:not([hidden]), .dock-overlay:not([hidden]), .bible-history-modal'
  );
  if (activeModal && isElementVisible(activeModal)) {
    const modalInput = findSearchInputElement(activeModal);
    if (modalInput) {
      focusAndSelectSearchInput(modalInput);
      return true;
    }
  }

  // 2. Active Dock tab panel
  const activeDockPanel = document.querySelector<HTMLElement>(
    '.dock-tab-panel:not([hidden]), [role="tabpanel"]:not([hidden]):not(.hidden)'
  );
  if (activeDockPanel) {
    // If media tab has collapsed search, expand it
    const mediaInput = activeDockPanel.querySelector<HTMLInputElement>(".dock-media-search__input");
    if (!mediaInput) {
      const collapsedMediaSearch = activeDockPanel.querySelector<HTMLElement>(".dock-media-search");
      if (collapsedMediaSearch) {
        window.dispatchEvent(new CustomEvent("dock-trigger-media-search"));
        collapsedMediaSearch.click();
        requestAnimationFrame(() => {
          const input = activeDockPanel.querySelector<HTMLInputElement>(".dock-media-search__input");
          if (input) focusAndSelectSearchInput(input);
        });
        return true;
      }
    }

    const panelInput = findSearchInputElement(activeDockPanel);
    if (panelInput) {
      focusAndSelectSearchInput(panelInput);
      return true;
    }
  }

  // 3. Active main page / resources content
  const activeContent = document.querySelector<HTMLElement>(
    '.resources-tab-content, .worship-resources-container, .library-tab-content, [role="main"], main, .app-page__inner, .app-main-content'
  );
  if (activeContent) {
    const contentInput = findSearchInputElement(activeContent);
    if (contentInput) {
      focusAndSelectSearchInput(contentInput);
      return true;
    }
  }

  // 4. Any visible search input anywhere in the document/root
  const anyInput = findSearchInputElement(root);
  if (anyInput) {
    focusAndSelectSearchInput(anyInput);
    return true;
  }

  return false;
}
