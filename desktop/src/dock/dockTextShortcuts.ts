function isEditableTextTarget(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return !target.disabled && !target.readOnly;
  if (target instanceof HTMLInputElement) {
    if (target.disabled || target.readOnly) return false;
    return [
      "",
      "email",
      "number",
      "password",
      "search",
      "tel",
      "text",
      "url",
    ].includes(target.type);
  }
  return target.isContentEditable;
}

function dispatchEditableInput(element: HTMLInputElement | HTMLTextAreaElement, inputType: string, data = ""): void {
  const event = typeof InputEvent === "function"
    ? new InputEvent("input", { bubbles: true, inputType, data })
    : new Event("input", { bubbles: true });
  element.dispatchEvent(event);
}

function selectedEditableText(element: HTMLInputElement | HTMLTextAreaElement): string {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? start;
  return element.value.slice(Math.min(start, end), Math.max(start, end));
}

function writeClipboardText(text: string): void {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      document.execCommand("copy");
    });
    return;
  }
  document.execCommand("copy");
}

function selectAllEditable(element: HTMLInputElement | HTMLTextAreaElement | HTMLElement): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.setSelectionRange(0, element.value.length);
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function cutEditableSelection(element: HTMLInputElement | HTMLTextAreaElement): void {
  const text = selectedEditableText(element);
  writeClipboardText(text);
  element.setRangeText("", element.selectionStart ?? 0, element.selectionEnd ?? 0, "start");
  dispatchEditableInput(element, "deleteByCut");
}

/**
 * Read clipboard text. OBS's browser dock has no clipboard-read permission
 * (navigator.clipboard.readText rejects) and execCommand("paste") is a no-op
 * for web pages, so fall back to the desktop app's local clipboard endpoint.
 */
async function readClipboardText(): Promise<string | null> {
  if (navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      // Permission denied inside OBS — use the desktop app instead.
    }
  }
  try {
    const res = await fetch("/api/dock/clipboard-text", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: unknown };
    return typeof data.text === "string" ? data.text : null;
  } catch {
    return null;
  }
}

function insertIntoContentEditable(text: string): void {
  // insertText keeps undo history and fires input events in contenteditable.
  if (!document.execCommand("insertText", false, text)) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
  }
}

async function pasteIntoEditable(element: HTMLInputElement | HTMLTextAreaElement | HTMLElement): Promise<void> {
  const text = await readClipboardText();
  if (text === null) {
    document.execCommand("paste");
    return;
  }
  if (!text) return;

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    // execCommand keeps the field's undo history; fall back to setRangeText.
    if (!document.execCommand("insertText", false, text)) {
      element.setRangeText(text, element.selectionStart ?? 0, element.selectionEnd ?? 0, "end");
      dispatchEditableInput(element, "insertFromPaste", text);
    }
    return;
  }
  element.focus();
  insertIntoContentEditable(text);
}

export function installDockTextShortcuts(): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isEditableTextTarget(event.target)) return;
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

    const key = event.key.toLowerCase();
    if (!["a", "c", "x", "v"].includes(key)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const target = event.target;
    if (!isEditableTextTarget(target)) return;

    if (key === "a") {
      selectAllEditable(target);
      return;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (key === "c") {
        writeClipboardText(selectedEditableText(target));
        return;
      }
      if (key === "x") {
        cutEditableSelection(target);
        return;
      }
      if (key === "v") {
        void pasteIntoEditable(target).catch(() => undefined);
        return;
      }
    }

    if (key === "c") document.execCommand("copy");
    if (key === "x") document.execCommand("cut");
    if (key === "v") void pasteIntoEditable(target).catch(() => undefined);
  };

  window.addEventListener("keydown", handleKeyDown, true);
  return () => window.removeEventListener("keydown", handleKeyDown, true);
}
