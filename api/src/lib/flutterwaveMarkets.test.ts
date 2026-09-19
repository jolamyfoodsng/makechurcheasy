import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FLUTTERWAVE_LOCAL_MARKETS,
  getFlutterwaveLocalMarket,
  getFlutterwaveSupportedCurrencies,
} from "./flutterwaveMarkets";

test("keeps only explicitly configured Flutterwave local markets", () => {
  assert.deepEqual(Object.keys(FLUTTERWAVE_LOCAL_MARKETS).sort(), [
    "GH",
    "KE",
    "NG",
    "RW",
    "TZ",
    "UG",
    "ZA",
    "ZM",
  ]);
  assert.equal(getFlutterwaveLocalMarket("gh")?.currency, "GHS");
  assert.equal(getFlutterwaveLocalMarket("ET"), undefined);
});

test("supports USD fallback plus mapped local currencies", () => {
  const supported = getFlutterwaveSupportedCurrencies();
  assert.equal(supported.has("USD"), true);
  assert.equal(supported.has("NGN"), true);
  assert.equal(supported.has("GHS"), true);
  assert.equal(supported.has("ETB"), false);
});
