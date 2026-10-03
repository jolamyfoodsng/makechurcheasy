/**
 * Canonical metadata for the English translation identifiers accepted by the
 * desktop Bible library.  Filenames remain the storage key, while this map
 * keeps the catalog name and searchable abbreviation stable.
 */
export interface TranslationMetadata {
  abbreviation: string;
  name: string;
  language: string;
}

const ENGLISH_TRANSLATIONS: Record<string, TranslationMetadata> = {
  KJ21: { abbreviation: "KJ21", name: "21st Century King James Version", language: "English" },
  ASV: { abbreviation: "ASV", name: "American Standard Version", language: "English" },
  AMP: { abbreviation: "AMP", name: "Amplified Bible", language: "English" },
  AMPC: { abbreviation: "AMPC", name: "Amplified Bible, Classic Edition", language: "English" },
  BRG: { abbreviation: "BRG", name: "BRG Bible", language: "English" },
  CSB: { abbreviation: "CSB", name: "Christian Standard Bible", language: "English" },
  CEB: { abbreviation: "CEB", name: "Common English Bible", language: "English" },
  CJB: { abbreviation: "CJB", name: "Complete Jewish Bible", language: "English" },
  CEV: { abbreviation: "CEV", name: "Contemporary English Version", language: "English" },
  DARBY: { abbreviation: "DARBY", name: "Darby Translation", language: "English" },
  DLNT: { abbreviation: "DLNT", name: "Disciples’ Literal New Testament", language: "English" },
  DRA: { abbreviation: "DRA", name: "Douay-Rheims 1899 American Edition", language: "English" },
  ERV: { abbreviation: "ERV", name: "Easy-to-Read Version", language: "English" },
  EHV: { abbreviation: "EHV", name: "Evangelical Heritage Version", language: "English" },
  ESV: { abbreviation: "ESV", name: "English Standard Version", language: "English" },
  ESVUK: { abbreviation: "ESVUK", name: "English Standard Version Anglicised", language: "English" },
  EXB: { abbreviation: "EXB", name: "Expanded Bible", language: "English" },
  GNV: { abbreviation: "GNV", name: "1599 Geneva Bible", language: "English" },
  GW: { abbreviation: "GW", name: "GOD’S WORD Translation", language: "English" },
  GNT: { abbreviation: "GNT", name: "Good News Translation", language: "English" },
  HCSB: { abbreviation: "HCSB", name: "Holman Christian Standard Bible", language: "English" },
  ICB: { abbreviation: "ICB", name: "International Children’s Bible", language: "English" },
  ISV: { abbreviation: "ISV", name: "International Standard Version", language: "English" },
  PHILLIPS: { abbreviation: "PHILLIPS", name: "J.B. Phillips New Testament", language: "English" },
  JUB: { abbreviation: "JUB", name: "Jubilee Bible 2000", language: "English" },
  KJV: { abbreviation: "KJV", name: "King James Version", language: "English" },
  AKJV: { abbreviation: "AKJV", name: "Authorized (King James) Version", language: "English" },
  LEB: { abbreviation: "LEB", name: "Lexham English Bible", language: "English" },
  TLB: { abbreviation: "TLB", name: "Living Bible", language: "English" },
  MSG: { abbreviation: "MSG", name: "The Message", language: "English" },
  MEV: { abbreviation: "MEV", name: "Modern English Version", language: "English" },
  MOUNCE: { abbreviation: "MOUNCE", name: "Mounce Reverse-Interlinear New Testament", language: "English" },
  NOG: { abbreviation: "NOG", name: "Names of God Bible", language: "English" },
  NABRE: { abbreviation: "NABRE", name: "New American Bible (Revised Edition)", language: "English" },
  NASB: { abbreviation: "NASB", name: "New American Standard Bible", language: "English" },
  NCV: { abbreviation: "NCV", name: "New Century Version", language: "English" },
  NET: { abbreviation: "NET", name: "New English Translation (NET Bible)", language: "English" },
  NIRV: { abbreviation: "NIRV", name: "New International Reader's Version", language: "English" },
  NIV: { abbreviation: "NIV", name: "New International Version", language: "English" },
  NIVUK: { abbreviation: "NIVUK", name: "New International Version - UK", language: "English" },
  NKJV: { abbreviation: "NKJV", name: "New King James Version", language: "English" },
  NLV: { abbreviation: "NLV", name: "New Life Version", language: "English" },
  NLT: { abbreviation: "NLT", name: "New Living Translation", language: "English" },
  NMB: { abbreviation: "NMB", name: "New Matthew Bible", language: "English" },
  NRSV: { abbreviation: "NRSV", name: "New Revised Standard Version", language: "English" },
  NTE: { abbreviation: "NTE", name: "New Testament for Everyone", language: "English" },
  OJB: { abbreviation: "OJB", name: "Orthodox Jewish Bible", language: "English" },
  TPT: { abbreviation: "TPT", name: "The Passion Translation", language: "English" },
  RGT: { abbreviation: "RGT", name: "Revised Geneva Translation", language: "English" },
  RSV: { abbreviation: "RSV", name: "Revised Standard Version", language: "English" },
  RSVCE: { abbreviation: "RSVCE", name: "Revised Standard Version Catholic Edition", language: "English" },
  TLV: { abbreviation: "TLV", name: "Tree of Life Version", language: "English" },
  VOICE: { abbreviation: "VOICE", name: "The Voice", language: "English" },
  WEB: { abbreviation: "WEB", name: "World English Bible", language: "English" },
  WE: { abbreviation: "WE", name: "Worldwide English (New Testament)", language: "English" },
  WYC: { abbreviation: "WYC", name: "Wycliffe Bible", language: "English" },
  YLT: { abbreviation: "YLT", name: "Young's Literal Translation", language: "English" },
};

/** Existing catalog keys whose legacy names do not contain the abbreviation. */
const FILENAME_ALIASES: Record<string, keyof typeof ENGLISH_TRANSLATIONS> = {
  "englishamplifiedbible.xml": "AMP",
  "englishamplifiedclassicbible.xml": "AMPC",
  "englishdarbybible.xml": "DARBY",
  "englishkjbible.xml": "KJV",
  "englishnkjbible.xml": "NKJV",
  "englishtlbible.xml": "TLB",
};

export function getTranslationMetadata(filename: string): TranslationMetadata | null {
  const normalized = filename.split("/").pop()?.trim().toLowerCase() ?? "";
  const alias = FILENAME_ALIASES[normalized];
  if (alias) return ENGLISH_TRANSLATIONS[alias];

  for (const metadata of Object.values(ENGLISH_TRANSLATIONS)) {
    if (normalized === `english${metadata.abbreviation.toLowerCase()}bible.xml`) {
      return metadata;
    }
  }

  return null;
}

export function getEnglishTranslationMetadata(abbreviation: string): TranslationMetadata | null {
  return ENGLISH_TRANSLATIONS[abbreviation.trim().toUpperCase()] ?? null;
}

export const ENGLISH_TRANSLATION_ABBREVIATIONS = Object.freeze(
  Object.keys(ENGLISH_TRANSLATIONS),
);
