import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FLUTTERWAVE_LOCAL_MARKETS,
  getFlutterwaveLocalMarket,
  getFlutterwaveSupportedCurrencies,
} from "./flutterwaveMarkets";

test("keeps only explicitly configured Flutterwave local markets", () => {
  assert.deepEqual(Object.keys(FLUTTERWAVE_LOCAL_MARKETS).sort(), [
    "AT",
    "BE",
    "CA",
    "CI",
    "CM",
    "CY",
    "DE",
    "EE",
    "EG",
    "ES",
    "ET",
    "FI",
    "FR",
    "GB",
    "GH",
    "GR",
    "HR",
    "IE",
    "IT",
    "KE",
    "LT",
    "LU",
    "LV",
    "MT",
    "MW",
    "NG",
    "NL",
    "PT",
    "RW",
    "SI",
    "SK",
    "SL",
    "SN",
    "TZ",
    "UG",
    "US",
    "ZA",
    "ZM",
  ]);
  assert.equal(getFlutterwaveLocalMarket("gh")?.currency, "GHS");
  assert.equal(getFlutterwaveLocalMarket("et")?.currency, "ETB");
  assert.equal(getFlutterwaveLocalMarket("IN"), undefined);
});

test("supports USD fallback plus mapped local currencies", () => {
  const supported = getFlutterwaveSupportedCurrencies();
  assert.equal(supported.has("USD"), true);
  assert.equal(supported.has("NGN"), true);
  assert.equal(supported.has("GHS"), true);
  assert.equal(supported.has("ETB"), true);
  assert.equal(supported.has("EUR"), true);
  assert.equal(supported.has("INR"), false);
});
