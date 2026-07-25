/**
 * exchange-rates.ts — Frankfurter API for USD → target currency conversion
 */

interface RateResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export async function getExchangeRate(
  from: string,
  to: string
): Promise<number | null> {
  if (from === to) return 1;
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v2/rate/${from}/${to}`
    );
    if (!res.ok) return null;
    const data: RateResponse = await res.json();
    return data.rates[to] ?? null;
  } catch {
    return null;
  }
}

export function convertPrice(priceUSD: number, rate: number | null): number {
  if (!rate || rate <= 0) return priceUSD;
  return Math.round(priceUSD * rate * 100) / 100;
}
