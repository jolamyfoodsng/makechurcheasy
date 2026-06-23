/**
 * bookAliasGenerator.ts — Systematic Bible book alias generation
 *
 * Generates aliases for all 66 books using rules, not manual lists.
 *
 * Rules:
 *   1. Numbered books: 1/2/3 → all spoken forms (first, one, won, 1st, etc.)
 *   2. Singular/plural variants (Kings/King, Chronicles/Chronicle, etc.)
 *   3. Common speech-to-text misrecognitions per book
 *   4. Nigerian church accent variants
 *
 * Only book and chapter aliases are generated — NOT verse aliases.
 * Speech-recognition errors almost always occur in the book name,
 * not the verse number.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BookAliasEntry {
  /** Canonical book name, e.g., "1 Samuel", "Genesis" */
  reference: string;
  /** All generated aliases (lowercase) */
  aliases: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Number representations for numbered books
// ─────────────────────────────────────────────────────────────────────────────

const NUMBER_FORMS: Record<string, string[]> = {
  "1": ["1", "1st", "first", "one", "won"],
  "2": ["2", "2nd", "second", "two", "to", "too", "tu"],
  "3": ["3", "3rd", "third", "three", "tree", "free"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Numbered book definitions
// ─────────────────────────────────────────────────────────────────────────────

interface NumberedBookDef {
  /** Number prefix: "1", "2", or "3" */
  num: string;
  /** Canonical suffix: "Samuel", "Kings", etc. */
  base: string;
  /** Singular form (if different from base): "King" for "Kings" */
  singular: string;
  /** Extra abbreviation aliases */
  abbreviations: string[];
}

const NUMBERED_BOOKS: NumberedBookDef[] = [
  { num: "1", base: "Samuel",    singular: "Samuel",    abbreviations: ["sam", "sa", "sm"] },
  { num: "2", base: "Samuel",    singular: "Samuel",    abbreviations: ["sam", "sa", "sm"] },
  { num: "1", base: "Kings",     singular: "King",      abbreviations: ["kgs", "ki", "k", "kin"] },
  { num: "2", base: "Kings",     singular: "King",      abbreviations: ["kgs", "ki", "k", "kin"] },
  { num: "1", base: "Chronicles", singular: "Chronicle", abbreviations: ["chr", "ch", "chron", "chroni"] },
  { num: "2", base: "Chronicles", singular: "Chronicle", abbreviations: ["chr", "ch", "chron", "chroni"] },
  { num: "1", base: "Corinthians", singular: "Corinthian", abbreviations: ["cor", "co", "corinth", "corinthi"] },
  { num: "2", base: "Corinthians", singular: "Corinthian", abbreviations: ["cor", "co", "corinth", "corinthi"] },
  { num: "1", base: "Thessalonians", singular: "Thessalonian", abbreviations: ["thes", "th", "thess", "thesal"] },
  { num: "2", base: "Thessalonians", singular: "Thessalonian", abbreviations: ["thes", "th", "thess", "thesal"] },
  { num: "1", base: "Timothy",   singular: "Timothy",   abbreviations: ["tim", "ti", "tm"] },
  { num: "2", base: "Timothy",   singular: "Timothy",   abbreviations: ["tim", "ti", "tm"] },
  { num: "1", base: "Peter",     singular: "Peter",     abbreviations: ["pet", "pe", "pt"] },
  { num: "2", base: "Peter",     singular: "Peter",     abbreviations: ["pet", "pe", "pt"] },
  { num: "1", base: "John",      singular: "John",      abbreviations: ["jn", "jo", "joh", "johh"] },
  { num: "2", base: "John",      singular: "John",      abbreviations: ["jn", "jo", "joh", "johh"] },
  { num: "3", base: "John",      singular: "John",      abbreviations: ["jn", "jo", "joh", "johh"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Non-numbered book definitions with speech-to-text variants
// ─────────────────────────────────────────────────────────────────────────────

interface NonNumberedBookDef {
  canonical: string;
  aliases: string[];
}

const NON_NUMBERED_BOOKS: NonNumberedBookDef[] = [
  // ── Old Testament ──
  { canonical: "Genesis", aliases: ["genesis", "jenesis", "genises", "genisis"] },
  { canonical: "Exodus", aliases: ["exodus", "exodos", "exidus", "exedus"] },
  { canonical: "Leviticus", aliases: ["leviticus", "leveticus", "leviticos", "levitcus", "leviticas"] },
  { canonical: "Numbers", aliases: ["numbers", "numbres", "numbrs", "numbars"] },
  { canonical: "Deuteronomy", aliases: ["deuteronomy", "deutronomy", "duteronomy", "deuteronemy", "detoronimy"] },
  { canonical: "Joshua", aliases: ["joshua", "joshwa", "joshuaa", "josua", "joshoa"] },
  { canonical: "Judges", aliases: ["judges", "judjes", "judgess", "judgges"] },
  { canonical: "Ruth", aliases: ["ruth", "ruthh", "rut"] },
  { canonical: "1 Samuel", aliases: [] }, // handled by NUMBERED_BOOKS
  { canonical: "2 Samuel", aliases: [] },
  { canonical: "1 Kings", aliases: [] },
  { canonical: "2 Kings", aliases: [] },
  { canonical: "1 Chronicles", aliases: [] },
  { canonical: "2 Chronicles", aliases: [] },
  { canonical: "Ezra", aliases: ["ezra", "ezarah", "ezrha", "ezara"] },
  { canonical: "Nehemiah", aliases: ["nehemiah", "nehemyah", "nehemiah", "nehemiah", "nehemya"] },
  { canonical: "Esther", aliases: ["esther", "esther", "ester", "esther"] },
  { canonical: "Job", aliases: ["job", "jobb", "jobj"] },
  { canonical: "Psalms", aliases: ["psalms", "psalm", "salms", "psams", "sams", "psalmms"] },
  { canonical: "Proverbs", aliases: ["proverbs", "proverb", "provbs", "proverbc"] },
  { canonical: "Ecclesiastes", aliases: ["ecclesiastes", "ecclesiastics", "ecclessiastes", "eccleisastes", "ecclesiatses"] },
  { canonical: "Song of Solomon", aliases: ["song of solomon", "song of songs", "songs of solomon", "songs of songs", "solomon", "song solomon", "song of solmon"] },
  { canonical: "Isaiah", aliases: ["isaiah", "isiah", "esaiah", "isaih", "isaia"] },
  { canonical: "Jeremiah", aliases: ["jeremiah", "jeremaya", "jerimiah", "jerrimiah", "jeramiah"] },
  { canonical: "Lamentations", aliases: ["lamentations", "lamentations", "lamentaion", "lamentashons"] },
  { canonical: "Ezekiel", aliases: ["ezekiel", "ezekial", "ezikiel", "ezekel", "ezekial"] },
  { canonical: "Daniel", aliases: ["daniel", "danyel", "daniil", "daniell"] },
  { canonical: "Hosea", aliases: ["hosea", "hoshea", "hozea", "hosia"] },
  { canonical: "Joel", aliases: ["joel", "joeel", "jole", "joell"] },
  { canonical: "Amos", aliases: ["amos", "amose", "amos", "aamos"] },
  { canonical: "Obadiah", aliases: ["obadiah", "obadiah", "obadja", "obidiah"] },
  { canonical: "Jonah", aliases: ["jonah", "jona", "jonah", "jonas"] },
  { canonical: "Micah", aliases: ["micah", "mica", "mikah", "mycah"] },
  { canonical: "Nahum", aliases: ["nahum", "naham", "nahum", "naum"] },
  { canonical: "Habakkuk", aliases: ["habakkuk", "habakuk", "habakkok", "habbakuk", "habakok"] },
  { canonical: "Zephaniah", aliases: ["zephaniah", "zefaniah", "zephania", "zefanya", "zephaniah"] },
  { canonical: "Haggai", aliases: ["haggai", "hagai", "hagee", "hagia"] },
  { canonical: "Zechariah", aliases: ["zechariah", "zechareiah", "zachariah", "zecharia", "zakariah"] },
  { canonical: "Malachi", aliases: ["malachi", "malaky", "malaki", "malakai", "malachi"] },

  // ── New Testament ──
  { canonical: "Matthew", aliases: ["matthew", "mathew", "mattheo", "mathu", "matthw"] },
  { canonical: "Mark", aliases: ["mark", "marks", "marc", "markk"] },
  { canonical: "Luke", aliases: ["luke", "look", "luck", "luc", "luk", "luke"] },
  { canonical: "John", aliases: ["john", "jon", "johnn", "joan", "jone", "jonh"] },
  { canonical: "Acts", aliases: ["acts", "axe", "act", "acts of the apostles"] },
  { canonical: "Romans", aliases: ["romans", "romance", "roman", "roomans", "romens", "rohmans", "romans"] },
  { canonical: "1 Corinthians", aliases: [] },
  { canonical: "2 Corinthians", aliases: [] },
  { canonical: "Galatians", aliases: ["galatians", "galations", "galacians", "galatans", "galatains"] },
  { canonical: "Ephesians", aliases: ["ephesians", "efesians", "effesians", "ephesans", "ephesains"] },
  { canonical: "Philippians", aliases: ["philippians", "filippians", "philipians", "fillipians", "phillippians"] },
  { canonical: "Colossians", aliases: ["colossians", "colosians", "collossians", "colosshans"] },
  { canonical: "1 Thessalonians", aliases: [] },
  { canonical: "2 Thessalonians", aliases: [] },
  { canonical: "1 Timothy", aliases: [] },
  { canonical: "2 Timothy", aliases: [] },
  { canonical: "Titus", aliases: ["titus", "titus", "tytus", "tittus"] },
  { canonical: "Philemon", aliases: ["philemon", "filemon", "philemone", "philemen"] },
  { canonical: "Hebrews", aliases: ["hebrews", "ebrews", "hebros", "hebrows", "heebrews", "hebrewss"] },
  { canonical: "James", aliases: ["james", "jaymes", "jims", "jams", "jamess"] },
  { canonical: "1 Peter", aliases: [] },
  { canonical: "2 Peter", aliases: [] },
  { canonical: "1 John", aliases: [] },
  { canonical: "2 John", aliases: [] },
  { canonical: "3 John", aliases: [] },
  { canonical: "Jude", aliases: ["jude", "judy", "jood", "joode", "juud"] },
  { canonical: "Revelation", aliases: ["revelation", "revelations", "revelating", "revalations", "revelashons"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Nigerian church specific speech-to-text variants for numbered books
// ─────────────────────────────────────────────────────────────────────────────

const NIGERIAN_VARIANTS: Array<{ pattern: string; canonical: string }> = [
  // Won = 1
  { pattern: "won samuel",    canonical: "1 Samuel" },
  { pattern: "won kings",     canonical: "1 Kings" },
  { pattern: "won king",      canonical: "1 Kings" },
  { pattern: "won chronicles",canonical: "1 Chronicles" },
  { pattern: "won chronicle", canonical: "1 Chronicles" },
  { pattern: "won corinthians", canonical: "1 Corinthians" },
  { pattern: "won corinthian",  canonical: "1 Corinthians" },
  { pattern: "won thessalonians", canonical: "1 Thessalonians" },
  { pattern: "won thessalonian",  canonical: "1 Thessalonians" },
  { pattern: "won timothy",   canonical: "1 Timothy" },
  { pattern: "won peter",     canonical: "1 Peter" },
  { pattern: "won john",      canonical: "1 John" },

  // To / Too / Tu = 2
  { pattern: "to samuel",     canonical: "2 Samuel" },
  { pattern: "too samuel",    canonical: "2 Samuel" },
  { pattern: "tu samuel",     canonical: "2 Samuel" },
  { pattern: "to kings",      canonical: "2 Kings" },
  { pattern: "too kings",     canonical: "2 Kings" },
  { pattern: "tu kings",      canonical: "2 Kings" },
  { pattern: "to king",       canonical: "2 Kings" },
  { pattern: "too king",      canonical: "2 Kings" },
  { pattern: "tu king",       canonical: "2 Kings" },
  { pattern: "to chronicles", canonical: "2 Chronicles" },
  { pattern: "too chronicles", canonical: "2 Chronicles" },
  { pattern: "tu chronicles",  canonical: "2 Chronicles" },
  { pattern: "to chronicle",  canonical: "2 Chronicles" },
  { pattern: "to corinthians", canonical: "2 Corinthians" },
  { pattern: "too corinthians", canonical: "2 Corinthians" },
  { pattern: "tu corinthians", canonical: "2 Corinthians" },
  { pattern: "to corinthian",  canonical: "2 Corinthians" },
  { pattern: "to thessalonians", canonical: "2 Thessalonians" },
  { pattern: "too thessalonians", canonical: "2 Thessalonians" },
  { pattern: "tu thessalonians", canonical: "2 Thessalonians" },
  { pattern: "to thessalonian", canonical: "2 Thessalonians" },
  { pattern: "to timothy",    canonical: "2 Timothy" },
  { pattern: "too timothy",   canonical: "2 Timothy" },
  { pattern: "tu timothy",    canonical: "2 Timothy" },
  { pattern: "to peter",      canonical: "2 Peter" },
  { pattern: "too peter",     canonical: "2 Peter" },
  { pattern: "tu peter",      canonical: "2 Peter" },
  { pattern: "to john",       canonical: "2 John" },
  { pattern: "too john",      canonical: "2 John" },
  { pattern: "tu john",       canonical: "2 John" },

  // Tree / Free = 3
  { pattern: "tree john",     canonical: "3 John" },
  { pattern: "free john",     canonical: "3 John" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Alias generation functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate all aliases for a numbered book.
 *
 * Combines:
 *   - Number forms × book base (e.g., "1 samuel", "first samuel", "won samuel")
 *   - Number forms × singular (e.g., "1 king", "first king", "won king")
 *   - Number forms × abbreviations (e.g., "1 sam", "first kgs")
 *   - Number-only + base (e.g., "won kings" with to/too/tu variants)
 */
function generateNumberedBookAliases(def: NumberedBookDef): BookAliasEntry {
  const numForms = NUMBER_FORMS[def.num] ?? [def.num];
  const aliases: string[] = [];

  for (const numWord of numForms) {
    // Base form: "1 samuel", "first samuel", "won samuel"
    aliases.push(`${numWord} ${def.base.toLowerCase()}`);

    // Singular form (if different): "1 king", "first king", "won king"
    if (def.singular.toLowerCase() !== def.base.toLowerCase()) {
      aliases.push(`${numWord} ${def.singular.toLowerCase()}`);
    }

    // Abbreviations: "1 sam", "first kgs", "won tim"
    for (const abbr of def.abbreviations) {
      aliases.push(`${numWord} ${abbr}`);
    }
  }

  // Deduplicate
  const unique = [...new Set(aliases)];

  return {
    reference: `${def.num} ${def.base}`,
    aliases: unique,
  };
}

/**
 * Generate aliases for a non-numbered book.
 * Includes the canonical name (lowercased) plus all defined variants.
 */
function generateNonNumberedAliases(def: NonNumberedBookDef): BookAliasEntry {
  const aliases = [def.canonical.toLowerCase(), ...def.aliases];

  // Deduplicate
  const unique = [...new Set(aliases)].filter((a) => a.length > 0);

  return {
    reference: def.canonical,
    aliases: unique,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export: generate the full alias index
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate alias entries for all 66 Bible books.
 *
 * Each entry contains:
 *   - `reference`: canonical book name (e.g., "1 Samuel", "Genesis")
 *   - `aliases`: array of all recognized spoken/written forms (lowercase)
 *
 * The generated index is suitable for Fuse.js fuzzy matching.
 */
export function generateBookAliases(): BookAliasEntry[] {
  const entries: BookAliasEntry[] = [];

  // Numbered books (18 entries: 1-2 Samuel, 1-2 Kings, etc.)
  for (const def of NUMBERED_BOOKS) {
    entries.push(generateNumberedBookAliases(def));
  }

  // Non-numbered books (48 entries)
  for (const def of NON_NUMBERED_BOOKS) {
    // Skip empty entries (numbered books handled above)
    if (def.aliases.length === 0) continue;
    entries.push(generateNonNumberedAliases(def));
  }

  // Nigerian church specific variants
  // Add these as additional aliases to the appropriate book entries
  for (const variant of NIGERIAN_VARIANTS) {
    const entry = entries.find((e) => e.reference === variant.canonical);
    if (entry) {
      entry.aliases.push(variant.pattern);
    }
  }

  return entries;
}

/**
 * All 66 canonical book names in order.
 */
export const ALL_CANONICAL_BOOKS: string[] = [
  // Old Testament (39)
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther",
  "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah",
  "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  // New Testament (27)
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans",
  "1 Corinthians", "2 Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy",
  "Titus", "Philemon",
  "Hebrews", "James",
  "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John",
  "Jude", "Revelation",
];
