/**
 * StudioTip.tsx — one short tip that changes every minute (a different one each time, in order).
 * Used under the camera, in the search box, in Docs and in Broadcast graphics.
 * The tip changes softly; with "reduce motion" on the system, it just changes.
 */
import { useEffect, useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";
import { isMacPlatform } from "../shortcuts";

/** How often the tip changes. */
export const TIP_EVERY_MS = 60_000;

const mod = () => (isMacPlatform() ? "⌘" : "Ctrl");

/** Tips for the whole Studio. Keys are written for the computer in use (⌘ on a Mac, Ctrl on Windows). */
export function generalTips(): string[] {
  const m = mod();
  return [
    `Press ${m}+K, or just start typing, to search verses, songs, notes, media and documents.`,
    `Press ${m}+/ to see every keyboard shortcut. You can change any of them in Settings.`,
    "Space shows what is in Preview and moves to the next one. Page Up goes back.",
    "Alt+B shows a black screen and Alt+L shows the church logo. Press it again to bring the words back.",
    "Alt+1 is Full screen words, Alt+2 is Lower third, Alt+3 is Camera only, Alt+4 is Camera + lower third.",
    "Right-click a verse, song, picture or page and choose Add to Schedule to plan the service ahead.",
    `Press ${m}+G to open Broadcast graphics, ${m}+J to open Verse AI.`,
    "Preview first lets you check a slide before the congregation sees it. Turn it off in the menu next to Send to Screen.",
    `${m}+= and ${m}+- change the text size. ${m}+0 puts it back.`,
    "Alt+O flips the monitor between Preview and the live Output.",
  ];
}

export const SEARCH_TIPS = (): string[] => {
  const m = mod();
  return [
    "Type a reference like “j316” or “Psalm 23” to jump straight to a verse.",
    "Type a few words you remember from a verse, like “God so loved”, to find it.",
    "Add @kjv, @niv… after a reference to see it in another translation.",
    "Start with > to see only commands, like Black screen or Clear.",
    `Enter shows the result, ${m}+Enter does the opposite of your Preview setting, Shift+Enter adds it to the Schedule.`,
  ];
};

export const DOCS_TIPS = (): string[] => [
  "Pick Fill to make a page fill the screen, then scroll it with the bar on the screen or the mouse wheel.",
  "Click a page to preview it. Double-click to project it.",
  "PDF, Word, PowerPoint, text, RTF, web pages and OpenDocument files can be imported. Programs and renamed files are refused.",
  "Google Docs or Slides: File → Download → PDF, then import the file here.",
];

export const GRAPHICS_TIPS = (): string[] => [
  "Edit changes the words, colours and pictures. Position, size and time are at the bottom.",
  "Save to My graphics (the three dots) keeps your version to use again.",
  "Alt+G closes the graphic on the screen with its Out animation.",
  "Project shows a graphic on top of whatever is on the screen.",
];

interface Props {
  tips: string[];
  className?: string;
  /** Change every this many milliseconds (default: one minute). */
  everyMs?: number;
}

export default function StudioTip({ tips, className, everyMs = TIP_EVERY_MS }: Props) {
  const list = useMemo(() => tips.filter(Boolean), [tips]);
  // Start at a different tip each time the Studio opens.
  const [index, setIndex] = useState(() => (list.length ? Math.floor(Math.random() * list.length) : 0));

  useEffect(() => {
    if (list.length < 2) return undefined;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % list.length), everyMs);
    return () => window.clearInterval(timer);
  }, [list.length, everyMs]);

  if (list.length === 0) return null;
  return (
    <p className={`st-tip${className ? ` ${className}` : ""}`} role="note" aria-live="off">
      <Lightbulb size={12} className="st-tip__icon" aria-hidden="true" />
      <span key={index % list.length} className="st-tip__text">{list[index % list.length]}</span>
    </p>
  );
}
