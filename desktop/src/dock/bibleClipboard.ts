export interface BibleClipboardVerse {
  reference: string;
  translation?: string;
  text: string;
}

export function buildBibleVerseClipboardText(verses: BibleClipboardVerse[]): string {
  return verses
    .filter((verse) => verse.text.trim().length > 0)
    .map(({ reference, translation, text }) => {
      const translationLabel = translation?.trim() ? ` (${translation.trim()})` : "";
      return `${reference}${translationLabel}\n${text.trim()}`;
    })
    .join("\n\n");
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text.trim()) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue with the textarea fallback used by OBS's embedded browser.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
