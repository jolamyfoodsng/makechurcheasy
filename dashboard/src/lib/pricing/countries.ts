/**
 * countries.ts — Country → Pricing Region mapping
 */

// ISO 3166-1 alpha-2 African country codes (excluding Nigeria)
export const AFRICAN_COUNTRIES = new Set([
  "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ",
  "EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG",
  "MW","ML","MR","MU","YT","MA","MZ","NA","NE","RW","ST","SN","SC","SL","SO",
  "ZA","SS","SD","TZ","TG","TN","UG","EH","ZM","ZW",
]);

export type PricingRegion = "nigeria" | "africa" | "global";

export function getPricingRegion(countryCode: string | null): PricingRegion {
  if (!countryCode) return "global";
  const code = countryCode.toUpperCase();
  if (code === "NG") return "nigeria";
  if (AFRICAN_COUNTRIES.has(code)) return "africa";
  return "global";
}
