/**
 * BibleWorkspace.tsx — the Bible reader in the middle of the Studio.
 *
 *  Top     Search (a reference like "John 3:16", "j316", "Psalm 23", "Genesis 1:1-5", or words
 *          like "God so loved"), translation, book, chapter, ‹ ›.
 *  Verses  the chapter as a list. Click = select and Preview, double-click = Project,
 *          Shift-click = several verses on one screen, right-click = more.
 *          Blue = selected / in Preview. Red LIVE = on the screen (they are independent).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Columns2, Copy, Eye, ListPlus, MoreHorizontal, Monitor, Play, Search, X } from "../../components/icons/NativeIcons";
import { BIBLE_BOOKS } from "../../bible/types";
import { parseBibleSearch } from "../../dock/bibleSearchParser";
import { formatBiblePassageReference, parseBiblePassageReference } from "../../dock/bibleMultiPassage";
import { warmQuoteIndex } from "../../bible/quoteIndexStore";
import { searchQuoteIndex } from "../../bible/quoteIndex";
import type { StudioBible } from "../useStudioBible";
import StudioMenu, { menuAt, type StudioMenuState } from "./StudioMenu";
import StudioModal from "./StudioModal";
import { getChapter, searchBible } from "../../bible/bibleData";
import { detectActiveTranslationPrompt, getTranslationDirectiveSuggestions } from "../../dock/dockBibleCatalog";

export interface BibleWorkspaceProps {
  bible: StudioBible;
  /** Selected verses in this chapter (one, or a run like 16–18). */
  selected: number[];
  /** Verses in Preview (same chapter), and verses on the screen (same chapter). */
  previewVerses: number[];
  liveVerses: number[];
  onGoTo: (book: string, chapter: number, verse?: number, endVerse?: number) => void;
  /** Search + Enter: open the verse(s) and put them straight on the screen (push if already live). */
  onGoToScreen: (book: string, chapter: number, verse?: number, endVerse?: number) => void;
  /** Click: select and preview. `extend` = Shift/Ctrl-click (several verses). */
  onPick: (verse: number, extend: boolean) => void;
  onProject: (verses: number[]) => void;
  onQueue: (verses: number[]) => void;
  onSchedule: (verses: number[]) => void;
  onStep: (delta: 1 | -1) => void;
  /** The Bible verse on the screen now (any chapter), for the "Live: … ↑" bar. */
  live: { label: string; book: string; chapter: number; verse: number } | null;
  /** Open the live verse's chapter (without previewing anything). */
  onShowLive: () => void;
  /** Second translation shown beside the first on the screen ("" = off). */
  compareWith: string;
  onCompareWith: (translation: string) => void;
  /** Line by line (one translation under the other) or side by side (columns), like the Dock. */
  compareLayout: "line-by-line" | "side-by-side";
  onCompareLayout: (value: "line-by-line" | "side-by-side") => void;
  /** The chapter in the second translation, and whether it could be read. */
  compareVerses: Array<{ verse: number; text: string }>;
  compareStatus: "off" | "loading" | "ready" | "missing";
  /** Passages tab: two different references, each with its own translation (empty = not chosen yet). */
  passagesOn: boolean;
  passages: Array<{ reference: string; translation: string }>;
  onPassagesOn: (on: boolean) => void;
  /** Read both passages and put them in Preview. Resolves to the problems found (empty = all good). */
  onPassagesSave: (drafts: Array<{ reference: string; translation: string }>) => Promise<string[]>;
  /** The Schedule is open, so there is less room: books fold into an accordion with the chapter numbers inside. */
  compact?: boolean;
  /** How many verses one click puts on the screen (1 to 4). */
  versesPerSlide: number;
  onVersesPerSlide: (count: number) => void;
}

interface Hit {
  key: string;
  label: string;
  sub?: string;
  book: string;
  chapter: number;
  verse?: number;
  endVerse?: number;
  /** "@KJV" style choice: switch to this translation (or compare with it for "//"). */
  translation?: string;
  installed?: boolean;
  trigger?: string;
}

export default function BibleWorkspace(props: BibleWorkspaceProps) {
  const { bible, selected, previewVerses, liveVerses } = props;
  const [query, setQuery] = useState("");
  const [phraseHits, setPhraseHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState<StudioMenuState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Wide (Schedule closed): Books, then chapter numbers, then verses, side by side.
  // Narrow (Schedule open, or a small window): books are an accordion with the chapter numbers inside.
  const [tight, setTight] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    // With the Schedule open there is less room, but a big window still gets the full book list.
    const update = () => setTight(el.clientWidth < 700);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [roomy, setRoomy] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => setRoomy(el.clientWidth >= 1000);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const compact = tight || (Boolean(props.compact) && !roomy);
  // Side by side popover: the two translations, with a dropdown for the second one.
  const [cmpOpen, setCmpOpen] = useState(false);
  // Right-click > Compare: the same compare box, as a window, with every translation listed.
  const [cmpModal, setCmpModal] = useState(false);
  const [cmpVerses, setCmpVerses] = useState<number[]>([]);
  const [allTexts, setAllTexts] = useState<Record<string, string | null>>({});
  const closeCmp = () => { setCmpOpen(false); setCmpModal(false); };
  const [cmpPos, setCmpPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const cmpBtnRef = useRef<HTMLButtonElement>(null);
  const cmpPopRef = useRef<HTMLDivElement>(null);
  const otherTranslations = bible.translations.filter((t) => t !== bible.translation);
  const [cmpLast, setCmpLast] = useState(() => {
    try { return localStorage.getItem("mce.studio.compareLast") || ""; } catch { return ""; }
  });
  const cmpSecond = props.compareWith || (otherTranslations.includes(cmpLast) ? cmpLast : otherTranslations[0] ?? "");
  const [cmpTab, setCmpTab] = useState<"translations" | "passages">("translations");
  const [drafts, setDrafts] = useState<Array<{ reference: string; translation: string }>>([]);
  const [passErrors, setPassErrors] = useState<string[]>([]);
  const [passSaving, setPassSaving] = useState(false);
  /** Start the Passages tab from what was saved, filling blanks with the chosen verse and translation. */
  const seedDrafts = (nums: number[]) => {
    const open = nums.length ? formatBiblePassageReference({ book: bible.book, chapter: bible.chapter, verse: nums[0], endVerse: nums.length > 1 ? nums[nums.length - 1] : null }) : `${bible.book} ${bible.chapter}:1`;
    setDrafts([0, 1].map((i) => ({
      reference: props.passages[i]?.reference || (i === 0 ? open : ""),
      translation: props.passages[i]?.translation || bible.translation,
    })));
    setPassErrors([]);
  };
  const openCompare = () => {
    if (!cmpOpen) {
      // Start the Passages tab from what was saved, filling blanks with the open verse and translation.
      const nums = selected.length ? selected : bible.verses.length ? [bible.verses[0].verse] : [];
      const open = nums.length ? formatBiblePassageReference({ book: bible.book, chapter: bible.chapter, verse: nums[0], endVerse: nums.length > 1 ? nums[nums.length - 1] : null }) : `${bible.book} ${bible.chapter}:1`;
      setDrafts([0, 1].map((i) => ({
        reference: props.passages[i]?.reference || (i === 0 ? open : ""),
        translation: props.passages[i]?.translation || bible.translation,
      })));
      setPassErrors([]);
      setCmpTab("translations");
    }
    const rect = cmpBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(480, window.innerWidth - 24);
      setCmpPos({ top: rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width });
    }
    setCmpOpen((open) => !open);
  };
  useEffect(() => {
    if (!cmpOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cmpPopRef.current?.contains(target) || cmpBtnRef.current?.contains(target)) return;
      setCmpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCmpOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [cmpOpen]);
  useEffect(() => {
    if (!cmpModal) return undefined;
    let cancelled = false;
    const nums = cmpVerses.length ? cmpVerses : selected;
    setAllTexts({});
    for (const t of bible.translations) {
      void getChapter(bible.book, bible.chapter, t).then((passage) => {
        if (cancelled) return;
        const text = nums
          .map((n) => passage.verses.find((v) => v.verse === n))
          .filter((v): v is NonNullable<typeof v> => Boolean(v))
          .map((v) => (nums.length > 1 ? `[${v.verse}] ${v.text}` : v.text))
          .join(" ");
        setAllTexts((cur) => ({ ...cur, [t]: text }));
      }).catch(() => { if (!cancelled) setAllTexts((cur) => ({ ...cur, [t]: null })); });
    }
    return () => { cancelled = true; };
  }, [cmpModal, cmpVerses, bible.book, bible.chapter, bible.translations]);
  const pickSecond = (translation: string) => {
    setCmpLast(translation);
    try { localStorage.setItem("mce.studio.compareLast", translation); } catch { /* not remembered */ }
    props.onCompareWith(translation);
  };

  const refHits = useMemo<Hit[]>(() => {
    if (!query.trim()) return [];
    try {
      return parseBibleSearch(query, { context: { currentBook: bible.book, currentChapter: bible.chapter } })
        .filter((r) => r.book && r.chapter !== null && r.action !== "clear")
        .slice(0, 6)
        .map((r, i) => ({
          key: `ref-${i}-${r.label}`,
          label: r.label,
          book: r.book,
          chapter: r.chapter as number,
          verse: r.verse ?? undefined,
          endVerse: r.endVerse ?? undefined,
          translation: r.translationOverride && bible.translations.includes(r.translationOverride) ? r.translationOverride : undefined,
          installed: true,
        }));
    } catch {
      return [];
    }
  }, [query, bible.book, bible.chapter, bible.translations]);

  // "@kjv", "john 3:16 @amp", "ps 23 //" : offer the translations, like the Dock does.
  const dirHits = useMemo<Hit[]>(() => {
    try {
      const prompt = detectActiveTranslationPrompt(query, { context: { currentBook: bible.book, currentChapter: bible.chapter } });
      if (!prompt) return [];
      const options = bible.translations.map((t) => ({ value: t, label: t }));
      return getTranslationDirectiveSuggestions(prompt, options, 8).map((sug) => ({
        key: `dir-${sug.abbr}`,
        label: sug.label,
        sub: sug.isInstalled
          ? `${sug.name}${sug.trigger === "//" || sug.trigger === "||" ? " (compare)" : ""}`
          : `${sug.name} — not installed on this computer`,
        book: sug.baseReference?.book ?? "",
        chapter: sug.baseReference?.chapter ?? 0,
        verse: sug.baseReference?.verse ?? undefined,
        endVerse: sug.baseReference?.endVerse ?? undefined,
        translation: sug.abbr,
        installed: sug.isInstalled,
        trigger: sug.trigger,
      }));
    } catch {
      return [];
    }
  }, [query, bible.book, bible.chapter, bible.translations]);

  // Words, not a reference: search the verses (the fast keyword index, no AI).
  useEffect(() => {
    const text = query.trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || /\d/.test(text) || /^[@~/]|[@~/][a-z]*$/i.test(text)) {
      setPhraseHits([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void warmQuoteIndex(bible.translation).then(async (index) => {
        if (cancelled) return;
        let found: Hit[] = [];
        if (index) {
          found = searchQuoteIndex(index, text, { limit: 8 }).map((h, i) => ({
            key: `txt-${i}-${h.book}-${h.chapter}-${h.verse}`,
            label: `${h.book} ${h.chapter}:${h.verse}`,
            sub: h.text,
            book: h.book,
            chapter: h.chapter,
            verse: h.verse,
          }));
        }
        // Nothing close as a phrase: fall back to the word search, the same one the Dock uses.
        if (found.length === 0) {
          const loose = await searchBible(text, bible.translation, 8).catch(() => []);
          found = loose.map((h, i) => ({
            key: `kw-${i}-${h.book}-${h.chapter}-${h.verse}`,
            label: `${h.book} ${h.chapter}:${h.verse}`,
            sub: h.text,
            book: h.book,
            chapter: h.chapter,
            verse: h.verse,
          }));
        }
        if (!cancelled) setPhraseHits(found);
      }).catch(() => undefined);
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, bible.translation]);

  const hits = useMemo(() => {
    const seen = new Set<string>();
    const list = dirHits.length ? dirHits : [...refHits, ...phraseHits];
    return list.filter((h) => {
      const k = `${h.book}|${h.chapter}|${h.verse ?? ""}|${h.endVerse ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [refHits, phraseHits, dirHits]);

  useEffect(() => setActive(0), [hits.length]);

  const [focused, setFocused] = useState(false);
  /** Enter / click: open it and put it on the screen. Shift+Enter: only open it (Preview). */
  const go = (hit: Hit | undefined, toScreen = true) => {
    if (!hit) return;
    if (hit.translation) {
      if (hit.installed === false) return;
      if (hit.trigger === "//" || hit.trigger === "||") props.onCompareWith(hit.translation);
      else if (hit.translation !== bible.translation) bible.setTranslation(hit.translation);
    }
    if (hit.book && hit.chapter) {
      if (toScreen) props.onGoToScreen(hit.book, hit.chapter, hit.verse, hit.endVerse);
      else props.onGoTo(hit.book, hit.chapter, hit.verse, hit.endVerse);
    }
    setQuery("");
    inputRef.current?.blur();
  };
  const tips: Array<{ label: string; hint: string; fill: string }> = [
    { label: "John 3:16", hint: "a verse (j316 works too)", fill: "John 3:16" },
    { label: "God so loved", hint: "words from the verse", fill: "God so loved" },
    { label: "@KJV", hint: "pick a translation", fill: "@" },
    { label: "John 3:16 //", hint: "compare two translations", fill: "John 3:16 //" },
  ];

  // "Live: John 3:16 ↑" when the verse on the screen is out of view (or in another chapter).
  const [liveVisible, setLiveVisible] = useState(true);
  const liveHere = Boolean(props.live && props.live.book === bible.book && props.live.chapter === bible.chapter);
  useEffect(() => {
    if (!liveHere) return undefined;
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-verse='${props.live?.verse}']`);
    if (!box || !el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => setLiveVisible(entries.some((e) => e.isIntersecting)), { root: box, threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [liveHere, props.live?.verse, bible.verses.length]);
  const showLiveBar = Boolean(props.live) && (!liveHere || !liveVisible);
  const liveAbove = (() => {
    if (!liveHere) return false;
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-verse='${props.live?.verse}']`);
    return Boolean(box && el && el.offsetTop < box.scrollTop);
  })();

  // Keep the selected verse in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-selected='true']");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected, bible.book, bible.chapter, bible.verses.length]);

  const chapters = Math.max(1, bible.chapterCount);
  const selectedSet = new Set(selected);
  const previewSet = new Set(previewVerses);
  const liveSet = new Set(liveVerses);

  // Side by side on: every verse shows both translations, the way the Dock does.
  const cmpOn = Boolean(props.compareWith) && props.compareStatus === "ready";
  const secondOf = (verse: number) => props.compareVerses.find((x) => x.verse === verse)?.text ?? "";
  const versesFor = (verse: number) => (selectedSet.has(verse) && selected.length > 1 ? selected : [verse]);

  const versesCount = (
    <label className="st-minisel" title="How many verses one click puts on the screen. The arrow keys follow it too.">
      <span>Verses per slide</span>
      <select value={props.versesPerSlide} onChange={(e) => props.onVersesPerSlide(Number(e.target.value))} aria-label="Verses per slide">
        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? "1 verse" : `${n} verses`}</option>)}
      </select>
    </label>
  );
  const stepper = (
    <div className="st-stepper">
      <button type="button" className="st-iconbtn" onClick={() => props.onStep(-1)} aria-label="Previous chapter" title="Previous chapter"><ChevronLeft size={16} /></button>
      <button type="button" className="st-iconbtn" onClick={() => props.onStep(1)} aria-label="Next chapter" title="Next chapter"><ChevronRight size={16} /></button>
    </div>
  );

  /** The same choices as right-click, for the "…" button on a verse. */
  const verseMenu = (verse: number) => {
    const verses = versesFor(verse);
    const ref = verses.length > 1 ? `${bible.book} ${bible.chapter}:${verses[0]}-${verses[verses.length - 1]}` : `${bible.book} ${bible.chapter}:${verse}`;
    return [
      { label: "Preview", icon: <Eye size={14} />, onSelect: () => props.onPick(verse, false) },
      { label: "Project", icon: <Play size={14} />, onSelect: () => props.onProject(verses) },
      { label: "Compare…", icon: <Columns2 size={14} />, hint: "Two translations", onSelect: () => { setCmpVerses(verses); seedDrafts(verses); setCmpTab("translations"); setCmpModal(true); } },
      { label: "Add to Queue", icon: <ListPlus size={14} />, divider: true, onSelect: () => props.onQueue(verses) },
      { label: "Add to Schedule", icon: <CalendarPlus size={14} />, onSelect: () => props.onSchedule(verses) },
      { label: `Copy ${ref}`, icon: <Copy size={14} />, divider: true, onSelect: () => void navigator.clipboard?.writeText(`${ref} (${bible.translation})`).catch(() => undefined) },
    ];
  };
  const copyVerse = (verse: number, text: string) => {
    void navigator.clipboard?.writeText(`${text} — ${bible.book} ${bible.chapter}:${verse} (${bible.translation})`).catch(() => undefined);
  };

  const bookSelect = (
    <select className="st-sel st-bsel" value={bible.book} onChange={(e) => { props.onGoTo(e.target.value, 1); e.currentTarget.blur(); }} aria-label="Book">
      {(BIBLE_BOOKS as readonly string[]).map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  );
  const chapterSelect = (
    <select className="st-sel st-bsel st-bsel--ch" value={bible.chapter} onChange={(e) => { props.onGoTo(bible.book, Number(e.target.value)); e.currentTarget.blur(); }} aria-label="Chapter">
      {Array.from({ length: chapters }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Chapter {n}</option>)}
    </select>
  );

  return (
    <section className="st-bible" aria-label="Bible" ref={sectionRef}>
      <div className={`st-bible__bar${compact ? " is-compact" : ""}`}>
        <div className={`st-searchbox${compact ? "" : " st-searchbox--big"}`}>
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go(hits[active], !e.shiftKey);
              else if (e.key === "Escape") setQuery("");
              else if (e.key === "ArrowDown") { e.preventDefault(); setActive((v) => Math.min(hits.length - 1, v + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((v) => Math.max(0, v - 1)); }
            }}
            placeholder='John 3:16  ·  "God so loved"  ·  @KJV'
            aria-label="Search the Bible"
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>}
          {hits.length > 0 && (
            <ul className="st-hits" role="listbox">
              {hits.map((h, i) => (
                <li key={h.key}>
                  <button type="button" role="option" aria-selected={i === active} className={`${i === active ? "is-on" : ""}${h.installed === false ? " is-off" : ""}`} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(h)}>
                    <strong>{h.label}</strong>
                    {h.sub && <span>{h.sub}</span>}
                  </button>
                </li>
              ))}
              <li className="st-hits__foot" aria-hidden="true">↵ Enter shows it on the screen · Shift+↵ Preview only · ↑↓ choose · Esc close</li>
            </ul>
          )}
          {hits.length === 0 && !query && focused && (
            <ul className="st-hits st-hits--tips" role="presentation">
              <li className="st-hits__head">Try typing</li>
              {tips.map((t) => (
                <li key={t.label}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(t.fill); inputRef.current?.focus(); }}>
                    <strong>{t.label}</strong><span>{t.hint}</span>
                  </button>
                </li>
              ))}
              <li className="st-hits__foot" aria-hidden="true">Press Enter on any result to show it on the screen</li>
            </ul>
          )}
        </div>
        <select value={bible.translation} onChange={(e) => bible.setTranslation(e.target.value)} aria-label="Translation" className="st-sel st-sel--trans">
          {bible.translations.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          ref={cmpBtnRef}
          type="button"
          className={`st-comparebtn${props.compareWith ? " is-on" : ""}`}
          onClick={openCompare}
          aria-expanded={cmpOpen}
          title="Compare two translations, or two different passages, on the screen"
        >
          <Columns2 size={14} /> <span>{props.compareWith ? `Compare · ${props.compareWith}` : "Compare"}</span> <ChevronDown size={13} />
        </button>
        {stepper}
      </div>
      <div className="st-bible__main">
        {!compact && (
          <nav className="st-bnav st-bnav--grid" aria-label="Book and chapter">
            {bookSelect}
            {chapterSelect}
            <div className="st-chaps" role="group" aria-label="Chapters">
              {Array.from({ length: chapters }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === bible.chapter ? "is-on" : ""}
                  onClick={() => props.onGoTo(bible.book, n)}
                  aria-label={`Chapter ${n}`}
                  aria-current={n === bible.chapter ? "true" : undefined}
                >{n}</button>
              ))}
            </div>
          </nav>
        )}
        <div className="st-bible__read">
        {compact ? (
          <div className="st-bible__pick">{bookSelect}{chapterSelect}{versesCount}</div>
        ) : (
          <div className="st-bible__title">
            <h2>{bible.book} {bible.chapter}</h2>
            <span>{bible.translation}</span>
            <div className="st-bible__titletools">{versesCount}</div>
          </div>
        )}

        {showLiveBar && props.live && (
          <button
            type="button"
            className="st-livebar"
            onClick={() => {
              if (liveHere) listRef.current?.querySelector<HTMLElement>(`[data-verse='${props.live?.verse}']`)?.scrollIntoView({ block: "center", behavior: "smooth" });
              else props.onShowLive();
            }}
            title="Go to the verse on the screen"
          >
            <span className="st-tag st-tag--live">LIVE</span>
            <span className="st-livebar__ref">{props.live.label}</span>
            <span className="st-livebar__go">{liveHere ? (liveAbove ? "↑ Show" : "↓ Show") : "Open"}</span>
          </button>
        )}

        <div className="st-verses" ref={listRef}>
          {bible.loading && bible.verses.length === 0 && <div className="st-empty">Loading…</div>}
          {!bible.loading && bible.verses.length === 0 && (
            <div className="st-empty">This chapter isn't in {bible.translation}. Pick another translation.</div>
          )}
          {bible.verses.map((v) => {
            const isSelected = selectedSet.has(v.verse);
            const isPreview = previewSet.has(v.verse);
            const isLive = liveSet.has(v.verse);
            return (
              <div
                key={v.verse}
                role="button"
                tabIndex={0}
                data-selected={isSelected && v.verse === selected[0] ? "true" : undefined}
                data-verse={v.verse}
                className={`st-verse${isSelected ? " is-selected" : ""}${isPreview && !isSelected ? " is-preview" : ""}${isLive ? " is-live" : ""}${compact ? " is-compact" : ""}`}
                onClick={(e) => props.onPick(v.verse, e.shiftKey || e.metaKey || e.ctrlKey)}
                onDoubleClick={() => props.onProject(versesFor(v.verse))}
                onKeyDown={(e) => { if (e.key === "Enter") props.onPick(v.verse, e.shiftKey); }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu(menuAt(e, verseMenu(v.verse)));
                }}
              >
                <span className="st-verse__num">{v.verse}</span>
                {cmpOn ? (
                  <div className={`st-verse__cmp ${props.compareLayout === "side-by-side" ? "is-side" : "is-stack"}${compact ? " is-compact" : ""}`}>
                    <div className="st-verse__blk">
                      <span className="st-verse__tr">{bible.translation}</span>
                      <span className="st-verse__text">{v.text}</span>
                    </div>
                    <div className="st-verse__blk">
                      <span className="st-verse__tr">{props.compareWith}</span>
                      <span className="st-verse__text">{secondOf(v.verse) || <em>Not in this translation.</em>}</span>
                    </div>
                  </div>
                ) : (
                  <span className="st-verse__text">{v.text}</span>
                )}
                {isLive && <span className="st-tag st-tag--live">LIVE</span>}
                <div className={`st-verse__acts${compact ? " is-compact" : ""}`} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                  {!compact && (
                    <button type="button" className={`st-verse__send${isSelected || isPreview ? " is-primary" : ""}`} onClick={() => props.onProject(versesFor(v.verse))} title="Show this on the screen (double-click)">
                      <Monitor size={13} /> Send
                    </button>
                  )}
                  <span className="st-verse__icons">
                    {compact && <button type="button" onClick={() => props.onProject(versesFor(v.verse))} aria-label="Send to screen" title="Send to screen"><Monitor size={14} /></button>}
                    <button type="button" onClick={() => copyVerse(v.verse, v.text)} aria-label="Copy the verse" title="Copy the verse"><Copy size={14} /></button>
                    {!compact && <button type="button" onClick={() => props.onQueue(versesFor(v.verse))} aria-label="Add to Queue" title="Add to Queue"><Bookmark size={14} /></button>}
                    {!compact && <button type="button" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu(menuAt({ clientX: r.left, clientY: r.bottom + 4 }, verseMenu(v.verse))); }} aria-label="More" title="More"><MoreHorizontal size={14} /></button>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>
      {((cmpOpen && cmpPos) || cmpModal) && (() => {
        const nums = cmpModal && cmpVerses.length ? cmpVerses : selected.length ? selected : bible.verses.length ? [bible.verses[0].verse] : [];
        const first = nums[0];
        const last = nums[nums.length - 1];
        const ref = nums.length ? `${bible.book} ${bible.chapter}:${nums.length > 1 ? `${first}-${last}` : first}` : `${bible.book} ${bible.chapter}`;
        const textOf = (list: Array<{ verse: number; text: string }>) => nums
          .map((n) => list.find((v) => v.verse === n))
          .filter((v): v is { verse: number; text: string } => Boolean(v))
          .map((v) => (nums.length > 1 ? `[${v.verse}] ${v.text}` : v.text))
          .join(" ");
        const textA = textOf(bible.verses);
        const textB = textOf(props.compareVerses);
        const on = Boolean(props.compareWith);
        let bodyB = textB;
        if (!on) bodyB = "Switch on to see it here.";
        else if (props.compareStatus === "loading") bodyB = "Loading…";
        else if (!textB) bodyB = `${cmpSecond} has no ${ref} on this computer. Pick another translation, or download it in the Bible settings.`;
        const setDraft = (i: number, patch: Partial<{ reference: string; translation: string }>) => {
          setPassErrors([]);
          setDrafts((list) => list.map((d, n) => (n === i ? { ...d, ...patch } : d)));
        };
        const savePassages = async () => {
          setPassSaving(true);
          try {
            const errors = await props.onPassagesSave(drafts);
            setPassErrors(errors);
            // Saved: close the box so it is clear something happened (Preview now holds both passages).
            if (errors.length === 0) closeCmp();
          } catch (err) {
            setPassErrors([err instanceof Error ? `Could not save the passages: ${err.message}` : "Could not save the passages."]);
          } finally {
            setPassSaving(false);
          }
        };
        const hintOf = (reference: string) => {
          if (!reference.trim()) return { text: "Type a reference, like John 3:16 or Psalm 23:1-3.", warn: false };
          const parsed = parseBiblePassageReference(reference);
          return parsed ? { text: formatBiblePassageReference(parsed), warn: false } : { text: "That is not a Bible reference yet.", warn: true };
        };
        const body = (
          <>
            {cmpTab === "translations" ? (
              <>
                <div className={`st-cmp__banner${on ? " is-on" : ""}`}>
                  <span>Translation compare is <strong>{on ? "ON" : "OFF"}</strong></span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    className={`st-switch${on ? " is-on" : ""}`}
                    onClick={() => (on ? props.onCompareWith("") : pickSecond(cmpSecond))}
                    disabled={!on && !cmpSecond}
                    title={on ? "Turn translation compare off" : "Turn translation compare on"}
                  ><span /></button>
                </div>
                <div className="st-cmp__layout">
                  <span>Layout</span>
                  <select className="st-cmp__sel st-cmp__sel--auto" value={props.compareLayout} onChange={(e) => props.onCompareLayout(e.target.value as "line-by-line" | "side-by-side")} aria-label="Layout">
                    <option value="line-by-line">Line By Line</option>
                    <option value="side-by-side">Side By Side</option>
                  </select>
                </div>
                <div className="st-cmp__cards">
                  <div className="st-cmp__card">
                    <span className="st-cmp__lab">Translation A</span>
                    <select className="st-cmp__sel" value={bible.translation} onChange={(e) => bible.setTranslation(e.target.value)} aria-label="Translation A">
                      {bible.translations.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="st-cmp__ref">{ref}</div>
                    <p>{textA || "Pick a verse."}</p>
                  </div>
                  <div className={`st-cmp__card${on ? "" : " is-off"}`}>
                    <span className="st-cmp__lab">Translation B</span>
                    <select className="st-cmp__sel" value={cmpSecond} onChange={(e) => pickSecond(e.target.value)} aria-label="Translation B">
                      {otherTranslations.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="st-cmp__ref">{ref}</div>
                    <p className={on && !textB && props.compareStatus !== "loading" ? "st-cmp__warn" : undefined}>{bodyB}</p>
                  </div>
                </div>
                <p className="st-cmp__hint">Every verse you pick shows in both translations. Press Go Live to send them to the screen.</p>
                {cmpModal && (
                  <div className="st-cmp__all">
                    <span className="st-cmp__lab">Every translation · {ref}</span>
                    {bible.translations.map((t) => (
                      <div key={t} className={`st-cmp__row${t === bible.translation ? " is-a" : ""}`}>
                        <div className="st-cmp__rowhead">
                          <strong>{t}</strong>
                          {t === bible.translation ? <em>Translation A</em> : (
                            <button type="button" className="st-chip" onClick={() => pickSecond(t)} title={`Show ${t} next to ${bible.translation} on the screen`}>{props.compareWith === t ? "Comparing" : "Compare with this"}</button>
                          )}
                        </div>
                        <p>{allTexts[t] === undefined ? "Loading…" : allTexts[t] || <em>Not in this translation.</em>}</p>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" className="st-cmp__save" onClick={closeCmp}>Done</button>
              </>
            ) : (
              <>
                <div className={`st-cmp__banner${props.passagesOn ? " is-on" : ""}`}>
                  <span>Passage compare is <strong>{props.passagesOn ? "ON" : "OFF"}</strong><em> · show different Bible references together</em></span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={props.passagesOn}
                    className={`st-switch${props.passagesOn ? " is-on" : ""}`}
                    onClick={() => props.onPassagesOn(!props.passagesOn)}
                    title={props.passagesOn ? "Turn passage compare off" : "Turn passage compare on"}
                  ><span /></button>
                </div>
                <div className="st-cmp__cards">
                  {drafts.map((d, i) => {
                    const hint = hintOf(d.reference);
                    return (
                      <div className="st-cmp__card" key={i}>
                        <span className="st-cmp__lab">Passage {i + 1}</span>
                        <input
                          className="st-cmp__in"
                          value={d.reference}
                          onChange={(e) => setDraft(i, { reference: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") void savePassages(); }}
                          placeholder={i === 0 ? "John 3:16" : "Psalm 23:1-3"}
                          aria-label={`Passage ${i + 1} reference`}
                          spellCheck={false}
                        />
                        <select className="st-cmp__sel" value={d.translation} onChange={(e) => setDraft(i, { translation: e.target.value })} aria-label={`Passage ${i + 1} translation`}>
                          {bible.translations.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <div className={`st-cmp__ref${hint.warn ? " st-cmp__warn" : ""}`}>{hint.text}</div>
                      </div>
                    );
                  })}
                </div>
                {passErrors.length > 0 && <p className="st-cmp__warn st-cmp__errs">{passErrors.join(" ")}</p>}
                <p className="st-cmp__hint">The two passages always show in columns. Save puts them in Preview; press Go Live to send them to the screen.</p>
                <button type="button" className="st-cmp__save" onClick={() => void savePassages()} disabled={passSaving}>{passSaving ? "Reading…" : "Save"}</button>
              </>
            )}
          </>
        );
        if (cmpModal) {
          return (
            <StudioModal wide title={`Compare · ${ref}`} onClose={closeCmp}>
              <div className="st-cmp__modal">{body}</div>
            </StudioModal>
          );
        }
        if (!cmpPos) return null;
        return (
          <div className="st-cmp__pop" ref={cmpPopRef} role="dialog" aria-label="Compare" style={{ top: cmpPos.top, left: cmpPos.left, width: cmpPos.width, maxHeight: `calc(100vh - ${cmpPos.top + 12}px)`, overflowY: "auto" }}>
            {body}
          </div>
        );
      })()}
      <StudioMenu menu={menu} onClose={() => setMenu(null)} />
    </section>
  );
}
