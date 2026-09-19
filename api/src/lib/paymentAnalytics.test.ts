import assert from "node:assert/strict";
import { test } from "node:test";

import { getGatewayPaymentAnalytics } from "./paymentAnalytics";

test("aggregates successful gateway transaction amounts by currency and excludes test or failed records", async () => {
  const previousFlutterwaveKey = process.env.FLW_SECRET_KEY;
  const previousPaystackKey = process.env.PAYSTACK_SECRET_KEY;
  const previousFetch = globalThis.fetch;
  const withinPeriod = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  process.env.FLW_SECRET_KEY = "FLWSECK-example-live-key";
  process.env.PAYSTACK_SECRET_KEY = "sk_live_example_key";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.flutterwave.com") {
      return new Response(JSON.stringify({
        status: "success",
        meta: { page_info: { total_pages: 1 } },
        data: [
          { status: "successful", amount: 100, amount_settled: 98, currency: "NGN", created_at: withinPeriod },
          { status: "failed", amount: 90, currency: "NGN", created_at: withinPeriod },
          { status: "successful", amount: 3000, amount_settled: 2900.25, currency: "UGX", created_at: withinPeriod },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      status: true,
      meta: { pageCount: 1 },
      data: [
        { status: "success", domain: "live", amount: 25000, currency: "NGN", paid_at: withinPeriod },
        { status: "success", domain: "test", amount: 50000, currency: "NGN", paid_at: withinPeriod },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await getGatewayPaymentAnalytics(30);
    const ngn = result.currencies.find((item) => item.currency === "NGN");
    const ugx = result.currencies.find((item) => item.currency === "UGX");

    assert.equal(result.providers.flutterwave.status, "connected");
    assert.equal(result.providers.paystack.status, "connected");
    assert.equal(ngn?.transactionCount, 2);
    assert.equal(ngn?.amount, 350);
    assert.equal(ngn?.settledAmount, 98);
    assert.equal(ngn?.settledTransactionCount, 1);
    assert.equal(ngn?.byProvider.flutterwave.amount, 100);
    assert.equal(ngn?.byProvider.paystack.amount, 250);
    assert.equal(ngn?.settlementByProvider.paystack.amount, null);
    assert.equal(ugx?.transactionCount, 1);
    assert.equal(ugx?.amount, 3000);
    assert.equal(ugx?.settledAmount, 2900.25);
    assert.equal(result.currencies.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousFlutterwaveKey == null) delete process.env.FLW_SECRET_KEY;
    else process.env.FLW_SECRET_KEY = previousFlutterwaveKey;
    if (previousPaystackKey == null) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = previousPaystackKey;
  }
});
