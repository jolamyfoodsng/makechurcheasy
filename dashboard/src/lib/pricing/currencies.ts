/**
 * currencies.ts — ISO 3166-1 alpha-2 → ISO 4217 currency code mapping
 */

export const COUNTRY_CURRENCY: Record<string, string> = {
  // Africa
  NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", UG: "UGX", TZ: "TZS",
  RW: "RWF", ZM: "ZMW", ZW: "ZWL", MW: "MWK", ET: "ETB", CM: "XAF",
  CI: "XOF", SN: "XOF", BF: "XOF", ML: "XOF", BJ: "XOF", TG: "XOF",
  NE: "XOF", GW: "XOF", SL: "SLL", LR: "LRD", GM: "GMD", CV: "CVE",
  GQ: "XAF", GA: "XAF", CG: "XAF", CD: "CDF", AO: "AOA", ST: "STN",
  NA: "NAD", BW: "BWP", LS: "LSL", SZ: "SZL", MZ: "MZN", MG: "MGA",
  MU: "MUR", SC: "SCR", KM: "KMF", BI: "BIF", DJ: "DJF", SO: "SOS",
  SD: "SDG", SS: "SSP", ER: "ERN", TD: "XAF", CF: "XAF", MR: "MRU",
  LY: "LYD", TN: "TND", DZ: "DZD", MA: "MAD", EG: "EGP",

  // Americas
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CO: "COP",
  CL: "CLP", PE: "PEN", EC: "USD", VE: "VES", BO: "BOB", PY: "PYG",
  UY: "UYU", CR: "CRC", PA: "USD", GT: "GTQ", HN: "HNL", SV: "SVC",
  NI: "NIO", BZ: "BZD", DO: "DOP", CU: "CUP", HT: "HTG", JM: "JMD",
  TT: "TTD", BB: "BBD", BS: "BSD",

  // Europe
  GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR",
  NL: "EUR", BE: "EUR", PT: "EUR", SE: "SEK", NO: "NOK", DK: "DKK",
  FI: "EUR", PL: "PLN", CZ: "CZK", AT: "EUR", CH: "CHF", RO: "RON",
  HU: "HUF", BG: "BGN", HR: "EUR", SK: "EUR", SI: "EUR", LT: "EUR",
  LV: "EUR", EE: "EUR", GR: "EUR", CY: "EUR", MT: "EUR", LU: "EUR",
  IS: "ISK", UA: "UAH", RS: "RSD", AL: "ALL", MK: "MKD", BA: "BAM",

  // Asia
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", BT: "BTN",
  MV: "MVR", CN: "CNY", JP: "JPY", KR: "KRW", TW: "TWD", HK: "HKD",
  MO: "MOP", MN: "MNT", KP: "KPW", PH: "PHP", VN: "VND", TH: "THB",
  MY: "MYR", ID: "IDR", SG: "SGD", KH: "KHR", LA: "LAK", MM: "MMK",
  BN: "BND", TL: "USD", SA: "SAR", AE: "AED", QA: "QAR", KW: "KWD",
  BH: "BHD", OM: "OMR", JO: "JOD", LB: "LBP", IL: "ILS",
  IQ: "IQD", SY: "SYP", YE: "YER", IR: "IRR", AF: "AFN", KZ: "KZT",
  UZ: "UZS", TM: "TMT", KG: "KGS", TJ: "TJS",

  // Oceania
  AU: "AUD", NZ: "NZD", FJ: "FJD", PG: "PGK", SB: "SBD", VU: "VUV",
  WS: "WST", TO: "TOP",
};

export function getCurrencyForCountry(countryCode: string | null): string {
  if (!countryCode) return "USD";
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] || "USD";
}
