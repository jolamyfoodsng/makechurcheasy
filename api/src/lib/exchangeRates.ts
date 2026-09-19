/**
 * Small, server-side USD exchange-rate cache used by pricing and checkout.
 *
 * Pricing is fetched with no-store on the client, while this cache prevents a
 * page refresh from hammering the rate provider. A failed refresh can still
 * use the last successful snapshot for a short period.
 */

const RATES_URL = "https://open.er-api.com/v6/latest/USD";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

type RateSnapshot = {
  rates: Record<string, number>;
  fetchedAt: number;
};

let snapshot: RateSnapshot | null = null;
let pendingRequest: Promise<RateSnapshot | null> | null = null;

async function loadRates(): Promise<RateSnapshot | null> {
  if (snapshot && Date.now() - snapshot.fetchedAt < CACHE_TTL_MS) {
    return snapshot;
  }

  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(RATES_URL, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Exchange-rate request failed (${response.status})`);

      const data = await response.json() as { result?: string; rates?: Record<string, unknown> };
      if (data.result !== "success" || !data.rates) throw new Error("Exchange-rate response was invalid");

      const rates = Object.fromEntries(
        Object.entries(data.rates)
          .map(([currency, value]) => [currency.toUpperCase(), Number(value)] as const)
          .filter(([, value]) => Number.isFinite(value) && value > 0),
      );

      if (!rates.USD) rates.USD = 1;
      snapshot = { rates, fetchedAt: Date.now() };
      return snapshot;
    } catch (error) {
      console.warn("[ExchangeRates] Could not refresh USD rates:", error);
      return snapshot;
    } finally {
      clearTimeout(timeout);
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

export async function getUsdExchangeRate(currency: string): Promise<number | null> {
  const code = currency.trim().toUpperCase();
  if (!code) return null;
  if (code === "USD") return 1;

  const rates = await loadRates();
  const rate = rates?.rates[code];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}
