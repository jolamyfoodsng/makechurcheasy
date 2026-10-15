/**
 * quoteIndex.ts — fast, offline, no-AI verse finder for spoken quotes.
 *
 * Why this exists: a pastor rarely says a verse word for word. He says "God has been so good" and
 * the Bible says "the LORD is good", or he says "you" where the King James says "thee". The older
 * lexical search wanted one verse to win by a wide margin, so those lines produced no suggestion.
 *
 * How it works (plain keyword search, no model, no network):
 *   1. Every verse is reduced to content "stems": lower-case, King James words mapped to modern
 *      ones (thee/thou/ye → you, saith → say, -eth/-est/-ing/-ed/-s trimmed), filler words dropped.
 *   2. An inverted index maps each stem to the verses that contain it, with an idf weight (rare
 *      words count more than "good" or "god").
 *   3. The spoken sentence goes through the same reduction. Candidate verses are scored by how much
 *      of the sentence's weight they cover, how much of the verse the sentence covers, whether the
 *      words come in the same order, and how often that verse is preached.
 *   4. A word that is not in the Bible (a speech-recognition slip) is matched to the closest
 *      Bible word when it is one letter off.
 *
 * Building takes a few hundred ms once; a search is a few ms. Pure TypeScript, no imports with
 * side effects, so it also runs in the Dock and in tests.
 */

import { POPULARITY_DB } from "./data/popularityDb";
import { CONCEPT_INDEX } from "./data/conceptIndex";

export type QuoteBibleData = Record<string, Record<string, Record<string, string>>>;

export interface QuoteHit {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  /** 0-1 overall match quality. */
  score: number;
  /** 0-1: share of the spoken words (by weight) found in this verse. */
  coverage: number;
  /** 0-1: share of the verse (by weight) that the spoken words cover. */
  share: number;
  /** Matched stems, for debugging. */
  matched: string[];
}

export interface QuoteSearchOptions {
  limit?: number;
  /** Lowest score to return. */
  minScore?: number;
  /** Only verses in this book (and chapter, if given). */
  scope?: { book: string; chapter?: number } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Word normalisation
// ─────────────────────────────────────────────────────────────────────────────

/** Words that carry no meaning for matching (applies to Bible text and speech). */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "can", "do", "did", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "if", "in", "into", "is", "it",
  "its", "me", "my", "of", "on", "or", "our", "she", "so", "than", "that", "the", "their", "them",
  "then", "there", "these", "they", "this", "those", "to", "up", "us", "was", "we", "were", "what",
  "when", "which", "who", "whom", "will", "with", "would", "you", "your", "not", "no", "all", "am",
  "may", "also", "out", "upon", "shall", "should", "could", "now", "yet", "even", "ever", "o", "oh",
  "behold", "yea", "verily", "lo", "hath", "doth", "art", "wilt", "shalt", "hast", "wast", "wert",
  "unto", "thee", "thou", "thy", "thine", "ye", "thyself", "himself", "herself", "itself", "such",
  "dont", "cant", "wont", "didnt", "doesnt", "isnt", "arent", "wasnt", "couldnt", "wouldnt", "shouldnt", "havent", "hasnt", "im", "ive", "ill", "youre", "youve", "youll", "hes", "shes", "weve", "theyre", "thats", "its", "lets", "any", "very", "same",
  "how", "why", "where", "about", "because", "too",
]);

/** Spoken-only filler: ignored in the sentence, never in the Bible. */
const SPOKEN_FILLER = new Set([
  "um", "uh", "uhm", "hmm", "much", "like", "just", "really", "gonna", "wanna", "gotta", "yeah", "yes",
  "okay", "ok", "right", "know", "mean", "actually", "basically", "literally", "honestly", "listen",
  "church", "pastor", "sermon", "today", "morning", "turn", "bible", "verse", "chapter", "amen",
  "hallelujah", "somebody", "everybody", "everyone", "let", "get", "got", "going", "gon", "na",
  "sort", "lot", "little", "bit", "see", "look", "come", "say", "says",
  "said", "tell", "told", "want", "need", "think", "way", "make", "made", "let's", "lets", "i'm",
  "it's", "that's", "don't", "doesn't", "didn't", "won't", "can't", "you're", "we're", "they're",
  "thank", "thanks", "time", "times", "anything", "everything", "something", "nothing", "someone", "anyone", "anybody", "nobody", "whatever",
]);

/** Archaic / irregular forms → one modern base. Applied to the Bible and to speech. */
const IRREGULAR: Record<string, string> = {
  saith: "say", spake: "speak", spoken: "speak", gave: "give", given: "give", giveth: "give",
  begat: "beget", begotten: "beget", went: "go", gone: "go", goeth: "go", came: "come", cometh: "come",
  saw: "see", seen: "see", seest: "see", took: "take", taken: "take", brought: "bring", wrought: "work",
  sent: "send", knew: "know", known: "know", knoweth: "know", knowest: "know", made: "make",
  maketh: "make", leadeth: "lead", heard: "hear", hearest: "hear", loved: "love", lovest: "love",
  loveth: "love", hateth: "hate", hated: "hate", wilt: "will", dost: "do", doest: "do", doeth: "do",
  didst: "do", wouldest: "would", shouldest: "should", couldest: "could", whosoever: "whoever",
  whoso: "whoever", whatsoever: "whatever", wherefore: "why", whither: "where", hither: "here",
  thither: "there", hence: "away", afar: "far", yonder: "there", sware: "swear", sworn: "swear",
  slew: "slay", slain: "slay", arose: "rise", risen: "rise", rose: "rise", fled: "flee", wept: "weep",
  slept: "sleep", kept: "keep", left: "leave", lost: "lose", fought: "fight", found: "find",
  built: "build", bought: "buy", sold: "sell", taught: "teach", caught: "catch", thought: "think",
  felt: "feel", held: "hold", told: "tell", stood: "stand", sat: "sit", fell: "fall", fallen: "fall",
  ate: "eat", eaten: "eat", drank: "drink", drunk: "drink", drunken: "drink", rode: "ride",
  children: "child", men: "man", women: "woman", brethren: "brother", brothers: "brother",
  feet: "foot", wives: "wife", lives: "life", people: "people", peoples: "people", oxen: "ox",
  afraid: "fear", scared: "fear", fearful: "fear", frightened: "fear", terrified: "fear",
  worry: "care", worried: "care", worrying: "care", anxious: "care", anxiety: "care", careful: "care",
  prayer: "pray", prayers: "pray", praying: "pray", prayed: "pray",
  savior: "save", saviour: "save", saved: "save",
  forgave: "forgive", forgiven: "forgive", forgiveness: "forgive", forgiving: "forgive",
  healer: "heal", healing: "heal", healed: "heal", healeth: "heal",
  provider: "provide", provision: "provide", provided: "provide",
  protect: "keep", protection: "keep", protector: "keep", protected: "keep",
  guide: "lead", guidance: "lead", guided: "lead", shepherd: "shepherd", shepherds: "shepherd",
  blessing: "bless", blessings: "bless", blessed: "bless", blesseth: "bless",
  strong: "strength", stronger: "strength", strengthen: "strength", strengthened: "strength",
  rejoice: "rejoice", rejoicing: "rejoice", joyful: "joy", gladness: "joy", glad: "joy",
  peaceful: "peace", enemies: "enemy", mercies: "mercy", merciful: "mercy",
  righteous: "righteous", righteousness: "righteous", holiness: "holy", godly: "god", godliness: "god",
  eternal: "everlasting", forever: "everlasting", evermore: "everlasting", eternity: "everlasting",
  trust: "trust", trusted: "trust", trusteth: "trust", believeth: "believe", believed: "believe",
  faithful: "faith", faithfulness: "faith", faithfully: "faith",
  loving: "love", lovingkindness: "mercy", kindness: "mercy", compassion: "mercy",
  helper: "help", helped: "help", helpeth: "help",
  created: "create", creator: "create", creation: "create",
  alive: "live", living: "live", liveth: "live", lived: "live",
  died: "die", dying: "die", dieth: "die", dead: "die", death: "die",
  victory: "overcome", conqueror: "overcome", conquerors: "overcome", overcometh: "overcome",
  sinner: "sin", sinners: "sin", sinned: "sin", sinneth: "sin", sins: "sin",
  wisdom: "wise", understanding: "understand", knowledge: "know",
  hope: "hope", hoped: "hope", hopeth: "hope",
  purpose: "purpose", plans: "plan", planned: "plan", thoughts: "thought",
  future: "end", tomorrow: "morrow", enemy: "enemy",
};

/**
 * Words that mean the same thing for matching. Applied to the spoken sentence only: a pastor says
 * "God" where the King James says "LORD", "lack" where it says "want", "plans" for "thoughts".
 * Entries are stems (as produced by stemWord).
 */
const SYNONYM_GROUPS: string[][] = [
  ["god", "lord"],
  ["lack", "want"],
  ["plan", "thought", "purpose"],
  ["harm", "evil", "hurt"],
  ["fear", "dread"],
  ["enemy", "foe"],
  ["sin", "iniquity", "transgression", "trespass"],
  ["help", "aid", "succour"],
  ["pardon", "forgiv"],
  ["pray", "supplication", "intercession"],
  ["die", "perish"],
  ["save", "salvat", "deliver", "redeem"],
  ["joy", "rejoic", "gladness"],
  ["bless", "happy"],
  ["strength", "might", "power"],
  ["child", "son"],
  ["healing", "heal", "whole"],
  ["rest", "peace"],
  ["afraid", "fear"],
  ["prosper", "succeed"],
  ["lift", "exalt", "rais"],
  ["storm", "tempest"],
  ["miracl", "wonder", "sign"],
  ["close", "nigh", "near"],
  ["weary", "labour", "tire", "faint"],
  ["burden", "laden", "heavy", "load"],
  ["love", "charity"],
  ["patient", "longsuffer", "suffer"],
  ["confidence", "substance", "assurance", "evidence"],
  ["brokenhearted", "contrite"],
  ["comfort", "console"],
  ["shield", "buckler"],
  ["refuge", "shelter", "fortress", "stronghold"],
  ["humble", "lowly", "meek"],
  ["proud", "arrogant", "haughty"],
  ["favor", "grace"],
  ["oppose", "resist"],
  ["gentle", "soft"],
  ["labor", "labour", "toil", "work"],
];
const SYNONYM_OF = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  // Groups are written as plain words; matching works on stems.
  const stems = [...new Set(group.map((word) => stemWord(word) || word))];
  for (const word of stems) {
    const existing = SYNONYM_OF.get(word) ?? [];
    for (const other of stems) if (other !== word && !existing.includes(other)) existing.push(other);
    SYNONYM_OF.set(word, existing);
  }
}

/** Run-together spoken words the King James writes as separate words (or the other way round). */
const COMPOUNDS: Record<string, string[]> = {
  brokenhearted: ["broken", "heart"],
  heartbroken: ["broken", "heart"],
  everlasting: ["everlasting"],
  forevermore: ["everlasting"],
  almighty: ["almighty"],
  firstborn: ["first", "born"],
  firstfruits: ["first", "fruit"],
  stronghold: ["stronghold"],
  overcomer: ["overcome"],
  wayfarer: ["way"],
  worship: ["worship"],
  cornerstone: ["corner", "stone"],
  whosoever: ["whoever"],
  nobody: [],
  hallelujah: [],
  waymaker: [],
  breakthrough: ["break"],
};

function stripSuffixes(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("eth")) w = w.slice(0, -3);
  else if (w.length >= 7 && w.endsWith("ness")) w = w.slice(0, -4);
  else if (w.length >= 6 && w.endsWith("ing")) {
    w = w.slice(0, -3);
    if (w.length > 2 && w[w.length - 1] === w[w.length - 2] && !"lsz".includes(w[w.length - 1])) w = w.slice(0, -1);
  } else if (w.length >= 5 && w.endsWith("ed")) {
    w = w.slice(0, -2);
    if (w.length > 2 && w[w.length - 1] === w[w.length - 2] && !"lsz".includes(w[w.length - 1])) w = w.slice(0, -1);
  } else if (w.length >= 6 && w.endsWith("ly")) w = w.slice(0, -2);
  else if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Reduce one word to its stem, or "" when it carries no meaning. */
export function stemWord(raw: string, spoken = false): string {
  let w = raw.toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return "";
  // Contractions: "don't" → "dont" would otherwise survive as a meaningless word.
  if (/n't$/.test(w)) return "";
  w = w.replace(/'(s|re|ve|ll|d|m)$/, "").replace(/'/g, "");
  if (!w) return "";
  if (spoken && SPOKEN_FILLER.has(w)) return "";
  if (STOP_WORDS.has(w)) return "";
  const base = IRREGULAR[w] ?? w;
  if (STOP_WORDS.has(base)) return "";
  const stem = stripSuffixes(base);
  return stem.length >= 2 ? stem : "";
}

/** Reduce text to its ordered content stems. */
export function normalizeQuoteTokens(text: string, spoken = false): string[] {
  const cleaned = text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[‘’]/g, "'")
    .toLowerCase();
  const out: string[] = [];
  for (const piece of cleaned.split(/[^a-z']+/)) {
    if (!piece) continue;
    const compound = COMPOUNDS[piece];
    if (compound) {
      for (const part of compound) {
        const partStem = stemWord(part, spoken);
        if (partStem) out.push(partStem);
      }
      continue;
    }
    const stem = stemWord(piece, spoken);
    if (stem) out.push(stem);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Index
// ─────────────────────────────────────────────────────────────────────────────

export interface QuoteIndex {
  translation: string;
  verseCount: number;
  books: string[];
  /** Per verse. */
  bookOf: Uint8Array;
  chapterOf: Uint16Array;
  verseOf: Uint16Array;
  texts: string[];
  /** Ordered stem ids per verse. */
  seq: Uint32Array[];
  /** Sum of idf over a verse's distinct stems. */
  verseWeight: Float32Array;
  /** Stem text → id. */
  vocab: Map<string, number>;
  idf: Float32Array;
  df: Uint32Array;
  /** Stem id → ids of verses containing it. */
  postings: Uint32Array[];
  /** First letter → stem ids (for one-letter-off matching). */
  buckets: Map<string, number[]>;
  stems: string[];
  /** book index + ":" + chapter + ":" + verse → verse id. */
  refIndex: Map<string, number>;
  popularity: Float32Array;
  concepts: Array<{ stems: Set<number>; verses: Set<number> }>;
  buildMs: number;
}

const POP_BOOK_ALIASES: Record<string, string> = { Psalms: "Psalm" };

function popularityOf(book: string, chapter: number, verse: number): number {
  const a = POPULARITY_DB[`${book} ${chapter}:${verse}`];
  if (a !== undefined) return a;
  const alias = POP_BOOK_ALIASES[book];
  return alias ? POPULARITY_DB[`${alias} ${chapter}:${verse}`] ?? 0 : 0;
}

/** Give the UI a turn between slices of work. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Build the index. Runs in slices (about 3000 verses each) so the first call while listening starts
 * never freezes the window; takes a little under a second in total.
 */
export async function buildQuoteIndex(data: QuoteBibleData, translation = "KJV"): Promise<QuoteIndex> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const books = Object.keys(data);
  const texts: string[] = [];
  const bookIdx: number[] = [];
  const chapterIdx: number[] = [];
  const verseIdx: number[] = [];
  const vocab = new Map<string, number>();
  const stems: string[] = [];
  const seqs: number[][] = [];

  const stemId = (stem: string): number => {
    let id = vocab.get(stem);
    if (id === undefined) {
      id = stems.length;
      vocab.set(stem, id);
      stems.push(stem);
    }
    return id;
  };

  let sliceCount = 0;
  for (let b = 0; b < books.length; b += 1) {
    const book = books[b];
    const chapters = data[book];
    const chapterNums = Object.keys(chapters).map(Number).sort((x, y) => x - y);
    for (const ch of chapterNums) {
      const verses = chapters[String(ch)];
      const verseNums = Object.keys(verses).map(Number).sort((x, y) => x - y);
      for (const v of verseNums) {
        const text = verses[String(v)] ?? "";
        texts.push(text);
        bookIdx.push(b);
        chapterIdx.push(ch);
        verseIdx.push(v);
        seqs.push(normalizeQuoteTokens(text).map(stemId));
        sliceCount += 1;
        if (sliceCount % 3000 === 0) await yieldToUi();
      }
    }
  }

  const n = texts.length;
  const df = new Uint32Array(stems.length);
  const postingLists: number[][] = Array.from({ length: stems.length }, () => []);
  for (let id = 0; id < n; id += 1) {
    const seen = new Set<number>();
    for (const term of seqs[id]) {
      if (seen.has(term)) continue;
      seen.add(term);
      postingLists[term].push(id);
      df[term] += 1;
    }
  }
  const idf = new Float32Array(stems.length);
  for (let t = 0; t < stems.length; t += 1) idf[t] = Math.log(1 + n / (df[t] + 0.5));

  const verseWeight = new Float32Array(n);
  for (let id = 0; id < n; id += 1) {
    let sum = 0;
    for (const term of new Set(seqs[id])) sum += idf[term];
    verseWeight[id] = sum;
  }

  const buckets = new Map<string, number[]>();
  stems.forEach((stem, id) => {
    const key = stem[0];
    const list = buckets.get(key);
    if (list) list.push(id);
    else buckets.set(key, [id]);
  });

  const refIndex = new Map<string, number>();
  const popularity = new Float32Array(n);
  for (let id = 0; id < n; id += 1) {
    refIndex.set(`${books[bookIdx[id]]}|${chapterIdx[id]}|${verseIdx[id]}`, id);
    popularity[id] = popularityOf(books[bookIdx[id]], chapterIdx[id], verseIdx[id]);
  }

  // Concept index: keyword stems → verses (by reference), resolved to ids.
  const concepts: QuoteIndex["concepts"] = [];
  for (const concept of CONCEPT_INDEX) {
    const stemSet = new Set<number>();
    for (const keyword of concept.keywords) {
      const id = vocab.get(stemWord(keyword));
      if (id !== undefined) stemSet.add(id);
    }
    const verseSet = new Set<number>();
    for (const ref of concept.verses) {
      const m = ref.match(/^(.+?)\s+(\d+):(\d+)$/);
      if (!m) continue;
      const book = books.includes(m[1]) ? m[1] : m[1] === "Psalm" ? "Psalms" : m[1];
      const id = refIndex.get(`${book}|${Number(m[2])}|${Number(m[3])}`);
      if (id !== undefined) verseSet.add(id);
    }
    if (stemSet.size > 0 && verseSet.size > 0) concepts.push({ stems: stemSet, verses: verseSet });
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    translation,
    verseCount: n,
    books,
    bookOf: Uint8Array.from(bookIdx),
    chapterOf: Uint16Array.from(chapterIdx),
    verseOf: Uint16Array.from(verseIdx),
    texts,
    seq: seqs.map((s) => Uint32Array.from(s)),
    verseWeight,
    vocab,
    idf,
    df,
    postings: postingLists.map((p) => Uint32Array.from(p)),
    buckets,
    stems,
    refIndex,
    popularity,
    concepts,
    buildMs: t1 - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (la === lb) {
      i += 1;
      j += 1;
    } else if (la > lb) i += 1;
    else j += 1;
  }
  return edits + (la - i) + (lb - j) <= 1;
}

interface QueryTerm {
  id: number;
  /** Other index terms that count as the same word. */
  alt: number[];
  weight: number;
  stem: string;
  fuzzy: boolean;
}

/** Map spoken stems to index terms. Unknown words are matched to a Bible word one letter off. */
function resolveQueryTerms(index: QuoteIndex, tokens: string[]): { terms: QueryTerm[]; unknown: number } {
  const terms: QueryTerm[] = [];
  const seen = new Set<number>();
  let unknown = 0;
  for (const token of tokens) {
    let id = index.vocab.get(token);
    let fuzzy = false;
    if (id === undefined && token.length >= 5) {
      let best = -1;
      let bestDf = -1;
      for (const candidate of index.buckets.get(token[0]) ?? []) {
        if (!withinOne(token, index.stems[candidate])) continue;
        if (index.df[candidate] > bestDf) {
          best = candidate;
          bestDf = index.df[candidate];
        }
      }
      if (best >= 0) {
        id = best;
        fuzzy = true;
      }
    }
    if (id === undefined) {
      unknown += 1;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const alt: number[] = [];
    for (const synonym of SYNONYM_OF.get(index.stems[id]) ?? []) {
      const synId = index.vocab.get(synonym);
      if (synId !== undefined && synId !== id) alt.push(synId);
    }
    terms.push({ id, alt, weight: index.idf[id] * (fuzzy ? 0.7 : 1), stem: index.stems[id], fuzzy });
  }
  return { terms, unknown };
}

/**
 * Words a pastor says all the time without quoting anything: "Thank you, Lord Jesus", "praise God".
 * A sentence made only of these gets no suggestions.
 */
const ADDRESS_WORDS = new Set(
  ["god", "lord", "jesus", "christ", "father", "spirit", "holy", "name", "praise", "glory", "amen", "thank", "hallelujah", "king", "savior", "heaven"]
    .map((word) => stemWord(word))
    .filter(Boolean),
);

const MAX_POSTING_FOR_CANDIDATES = 9000;

/** Minimum total idf weight a match must carry (stops "the Lord" from matching everything). */
const MIN_INFORMATION = 4.2;

export function searchQuoteIndex(index: QuoteIndex, spoken: string, options: QuoteSearchOptions = {}): QuoteHit[] {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0.4;
  const tokens = normalizeQuoteTokens(spoken, true);
  if (tokens.length === 0) return [];

  const { terms, unknown } = resolveQueryTerms(index, tokens);
  if (terms.length === 0) return [];
  if (terms.every((term) => ADDRESS_WORDS.has(term.stem))) return [];
  const totalWeight = terms.reduce((sum, t) => sum + t.weight, 0);
  if (totalWeight <= 0) return [];

  // Scope → allowed book index and chapter.
  let scopeBook = -1;
  let scopeChapter = 0;
  if (options.scope?.book) {
    scopeBook = index.books.indexOf(options.scope.book);
    if (scopeBook < 0 && options.scope.book === "Psalm") scopeBook = index.books.indexOf("Psalms");
    scopeChapter = options.scope.chapter ?? 0;
    if (scopeBook < 0) return [];
  }

  // 1) Accumulate matched weight per verse.
  const matchedWeight = new Map<number, number>();
  for (const term of terms) {
    const ids = [term.id, ...term.alt];
    const credited = ids.length > 1 ? new Set<number>() : null;
    for (const id of ids) {
      const list = index.postings[id];
      if (list.length > MAX_POSTING_FOR_CANDIDATES) continue;
      // The spoken word itself counts in full, a synonym slightly less.
      const weight = id === term.id ? term.weight : term.weight * 0.9;
      for (let k = 0; k < list.length; k += 1) {
        const verseId = list[k];
        if (credited) {
          if (credited.has(verseId)) continue;
          credited.add(verseId);
        }
        matchedWeight.set(verseId, (matchedWeight.get(verseId) ?? 0) + weight);
      }
    }
  }
  if (matchedWeight.size === 0) return [];

  // 2) Keep the strongest raw candidates, then score them properly.
  const rough: Array<[number, number]> = [];
  for (const [verseId, weight] of matchedWeight) {
    if (scopeBook >= 0) {
      if (index.bookOf[verseId] !== scopeBook) continue;
      if (scopeChapter && index.chapterOf[verseId] !== scopeChapter) continue;
    }
    if (weight < MIN_INFORMATION * 0.6) continue;
    rough.push([verseId, weight]);
  }
  rough.sort((a, b) => b[1] - a[1]);
  const candidates = rough.slice(0, 600);

  // Every id that counts for a spoken word maps back to that word's primary id.
  const primaryOf = new Map<number, number>();
  for (const term of terms) {
    primaryOf.set(term.id, term.id);
    for (const alt of term.alt) if (!primaryOf.has(alt)) primaryOf.set(alt, term.id);
  }
  const orderedQuery: number[] = [];
  for (const token of tokens) {
    const id = index.vocab.get(token);
    if (id !== undefined && primaryOf.has(id)) orderedQuery.push(primaryOf.get(id)!);
  }
  const bigrams = Math.max(0, orderedQuery.length - 1);
  const knownRatio = terms.length / (terms.length + unknown);

  // Concept boost: verses of a concept whose keywords the speaker used.
  const conceptVerses = new Map<number, number>();
  for (const concept of index.concepts) {
    let hits = 0;
    for (const id of terms.map((t) => t.id)) if (concept.stems.has(id)) hits += 1;
    if (hits === 0) continue;
    const strength = Math.min(1, hits / 1.5);
    for (const verseId of concept.verses) {
      conceptVerses.set(verseId, Math.max(conceptVerses.get(verseId) ?? 0, strength));
    }
  }

  const hits: QuoteHit[] = [];
  for (const [verseId, weight] of candidates) {
    const coverage = weight / totalWeight;
    const verseShare = index.verseWeight[verseId] > 0 ? weight / index.verseWeight[verseId] : 0;

    // Order: how many consecutive spoken word pairs appear close together, in order, in the verse.
    let order = 0;
    if (bigrams > 0) {
      const seq = index.seq[verseId];
      const positions = new Map<number, number[]>();
      for (let p = 0; p < seq.length; p += 1) {
        const primary = primaryOf.get(seq[p]);
        if (primary === undefined) continue;
        const list = positions.get(primary);
        if (list) list.push(p);
        else positions.set(primary, [p]);
      }
      let pairs = 0;
      for (let q = 0; q < bigrams; q += 1) {
        const first = positions.get(orderedQuery[q]);
        const second = positions.get(orderedQuery[q + 1]);
        if (!first || !second) continue;
        let ok = false;
        for (const a of first) {
          for (const b of second) {
            if (b > a && b - a <= 3) {
              ok = true;
              break;
            }
          }
          if (ok) break;
        }
        if (ok) pairs += 1;
      }
      order = pairs / bigrams;
    } else {
      order = 1;
    }

    const popularity = index.popularity[verseId];
    const concept = conceptVerses.get(verseId) ?? 0;
    // A pastor either quotes part of a long verse (coverage is high) or a whole verse inside a longer
    // sentence (verse share is high). Reward whichever fits, plus a little for the other.
    const shareFit = Math.min(1, verseShare * 1.25);
    const core = Math.max(coverage, shareFit) * 0.6 + Math.min(coverage, shareFit) * 0.14;
    // Famous verses win ties, most of all when the sentence is short and says little ("God is good").
    const popularityWeight = terms.length <= 2 ? 0.26 : 0.16;
    let score = core + 0.12 * order + popularityWeight * popularity * Math.min(1, coverage * 1.2) + 0.14 * concept;
    score *= 0.6 + 0.4 * knownRatio;
    if (weight < MIN_INFORMATION) score *= 0.6;
    // One meaningful word is a weak clue unless that word is rare (a name, "Melchizedek").
    if (terms.length === 1 && index.df[terms[0].id] > 25 && popularity < 0.5) score *= 0.45;
    if (terms.length >= 3 && coverage < 0.5) score *= 0.7;
    if (score < minScore) continue;

    const matched: string[] = [];
    const verseTerms = new Set(index.seq[verseId]);
    for (const term of terms) {
      if (verseTerms.has(term.id) || term.alt.some((alt) => verseTerms.has(alt))) matched.push(term.stem);
    }

    hits.push({
      book: index.books[index.bookOf[verseId]],
      chapter: index.chapterOf[verseId],
      verse: index.verseOf[verseId],
      text: index.texts[verseId],
      score: Math.min(1, score),
      coverage,
      share: Math.min(1, verseShare),
      matched,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** Map a hit score to the engine's 0-1 confidence. Never reaches the 0.90 auto-push line. */
export function quoteHitConfidence(hit: QuoteHit): number {
  return Math.max(0.3, Math.min(0.86, 0.22 + 0.7 * hit.score));
}

/**
 * True when the speaker seems to be reading the verse itself (every meaningful word of the sentence is in the verse). Those
 * are left to the exact-quote search, which can promote them to a confident, auto-pushable match.
 */
export function isVerbatimLikely(hit: QuoteHit): boolean {
  return hit.coverage >= 0.9 && hit.matched.length >= 4;
}
