/**
 * Keep operator-entered line breaks intact across the Dock and OBS overlay.
 *
 * Notes and lyrics are stored as plain text, so convert the common HTML break
 * notation to a newline before the text is split, displayed, or sent to OBS.
 */
export function normalizeDockMultilineText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n");
}
