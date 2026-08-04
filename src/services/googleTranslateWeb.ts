export interface GoogleTranslateLanguage {
  code: string;
  label: string;
}

// Kept locally so the picker works offline and does not need a language-list request.
export const GOOGLE_TRANSLATE_LANGUAGES: GoogleTranslateLanguage[] = [
  ["af", "Afrikaans"], ["sq", "Albanian"], ["am", "Amharic"], ["ar", "Arabic"],
  ["hy", "Armenian"], ["as", "Assamese"], ["ay", "Aymara"], ["az", "Azerbaijani"],
  ["bm", "Bambara"], ["eu", "Basque"], ["be", "Belarusian"], ["bn", "Bengali"],
  ["bho", "Bhojpuri"], ["bs", "Bosnian"], ["bg", "Bulgarian"], ["ca", "Catalan"],
  ["ceb", "Cebuano"], ["zh-CN", "Chinese (Simplified)"], ["zh-TW", "Chinese (Traditional)"],
  ["co", "Corsican"], ["hr", "Croatian"], ["cs", "Czech"], ["da", "Danish"],
  ["dv", "Dhivehi"], ["doi", "Dogri"], ["nl", "Dutch"], ["en", "English"],
  ["eo", "Esperanto"], ["et", "Estonian"], ["ee", "Ewe"], ["fil", "Filipino"],
  ["fi", "Finnish"], ["fr", "French"], ["fy", "Frisian"], ["gl", "Galician"],
  ["ka", "Georgian"], ["de", "German"], ["el", "Greek"], ["gn", "Guarani"],
  ["gu", "Gujarati"], ["ht", "Haitian Creole"], ["ha", "Hausa"], ["haw", "Hawaiian"],
  ["he", "Hebrew"], ["hi", "Hindi"], ["hmn", "Hmong"], ["hu", "Hungarian"],
  ["is", "Icelandic"], ["ig", "Igbo"], ["ilo", "Ilocano"], ["id", "Indonesian"],
  ["ga", "Irish"], ["it", "Italian"], ["ja", "Japanese"], ["jv", "Javanese"],
  ["kn", "Kannada"], ["kk", "Kazakh"], ["km", "Khmer"], ["rw", "Kinyarwanda"],
  ["gom", "Konkani"], ["ko", "Korean"], ["kri", "Krio"], ["ku", "Kurdish"],
  ["ky", "Kyrgyz"], ["lo", "Lao"], ["la", "Latin"], ["lv", "Latvian"],
  ["ln", "Lingala"], ["lt", "Lithuanian"], ["lg", "Luganda"], ["lb", "Luxembourgish"],
  ["mk", "Macedonian"], ["mai", "Maithili"], ["mg", "Malagasy"], ["ms", "Malay"],
  ["ml", "Malayalam"], ["mt", "Maltese"], ["mi", "Maori"], ["mr", "Marathi"],
  ["mni-Mtei", "Meiteilon (Manipuri)"], ["lus", "Mizo"], ["mn", "Mongolian"], ["my", "Myanmar"],
  ["ne", "Nepali"], ["no", "Norwegian"], ["ny", "Nyanja"], ["or", "Odia"],
  ["om", "Oromo"], ["ps", "Pashto"], ["fa", "Persian"], ["pl", "Polish"],
  ["pt", "Portuguese"], ["pa", "Punjabi"], ["qu", "Quechua"], ["ro", "Romanian"],
  ["ru", "Russian"], ["sm", "Samoan"], ["sa", "Sanskrit"], ["gd", "Scots Gaelic"],
  ["nso", "Sepedi"], ["sr", "Serbian"], ["st", "Sesotho"], ["sn", "Shona"],
  ["sd", "Sindhi"], ["si", "Sinhala"], ["sk", "Slovak"], ["sl", "Slovenian"],
  ["so", "Somali"], ["es", "Spanish"], ["su", "Sundanese"], ["sw", "Swahili"],
  ["sv", "Swedish"], ["tg", "Tajik"], ["ta", "Tamil"], ["tt", "Tatar"],
  ["te", "Telugu"], ["th", "Thai"], ["ti", "Tigrinya"], ["ts", "Tsonga"],
  ["tr", "Turkish"], ["tk", "Turkmen"], ["ak", "Twi (Akan)"], ["uk", "Ukrainian"],
  ["ur", "Urdu"], ["ug", "Uyghur"], ["uz", "Uzbek"], ["vi", "Vietnamese"],
  ["cy", "Welsh"], ["xh", "Xhosa"], ["yi", "Yiddish"], ["yo", "Yoruba"], ["zu", "Zulu"],
].map(([code, label]) => ({ code, label }));

const GOOGLE_TRANSLATE_WEB_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

export function getGoogleTranslateLanguage(code: string): GoogleTranslateLanguage {
  return GOOGLE_TRANSLATE_LANGUAGES.find((language) => language.code === code)
    ?? { code, label: code.toUpperCase() };
}

export function buildGoogleTranslateUrl(text: string, targetLanguage: string): string {
  const params = new URLSearchParams({
    sl: "auto",
    tl: targetLanguage,
    text,
    op: "translate",
  });
  return `https://translate.google.com/?${params.toString()}`;
}

function readTranslatedSegments(payload: unknown): string {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return "";
  return payload[0]
    .filter((segment): segment is unknown[] => Array.isArray(segment) && typeof segment[0] === "string")
    .map((segment) => String(segment[0]))
    .join("")
    .trim();
}

/**
 * Uses Google's public web translation endpoint directly from the desktop.
 * It requires no Cloud API key and keeps the translation out of our backend.
 */
export async function translateWithGoogleWeb(text: string, targetLanguage: string): Promise<string> {
  const source = text.trim();
  if (!source) return "";

  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: targetLanguage,
    dt: "t",
    q: source,
  });
  const response = await fetch(`${GOOGLE_TRANSLATE_WEB_ENDPOINT}?${params.toString()}`);
  if (!response.ok) throw new Error(`Google Translate returned ${response.status}`);

  const translated = readTranslatedSegments(await response.json());
  if (!translated) throw new Error("Google Translate returned no text");
  return translated;
}
