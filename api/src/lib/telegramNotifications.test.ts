import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTelegramCheckoutMessage,
  buildTelegramSignupMessage,
  buildTelegramSignupReportMessage,
  sendTelegramMessage,
} from "./telegramNotifications";

test("formats signup notifications with name, country, and date", () => {
  const message = buildTelegramSignupMessage(
    {
      name: "Ada <Admin>",
      country: "NG",
      createdAt: "2026-08-14T10:30:00.000Z",
      source: "Google",
    },
    { TELEGRAM_NOTIFICATION_TIMEZONE: "UTC" },
  );

  assert.match(message, /New MakeChurchEasy signup/);
  assert.match(message, /Ada &lt;Admin&gt;/);
  assert.match(message, /Nigeria/);
  assert.match(message, /14 Aug 2026/);
  assert.match(message, /Google/);
});

test("formats checkout notifications with plan and payment details", () => {
  const message = buildTelegramCheckoutMessage(
    {
      name: "Grace",
      country: "GH",
      plan: "growth",
      billingCycle: "monthly",
      paymentMethod: "flutterwave",
      amount: 15,
      currency: "USD",
      createdAt: "2026-08-14T10:30:00.000Z",
    },
    { TELEGRAM_NOTIFICATION_TIMEZONE: "UTC" },
  );

  assert.match(message, /Checkout started/);
  assert.match(message, /Ghana/);
  assert.match(message, /growth/);
  assert.match(message, /flutterwave/);
  assert.match(message, /USD 15/);
});

test("formats daily and month-end signup reports", () => {
  const dailyMessage = buildTelegramSignupReportMessage({
    dateLabel: "Saturday, August 15, 2026",
    monthLabel: "August 2026",
    timezone: "Africa/Lagos",
    dailySignups: 2,
    monthlySignups: 27,
    totalUsers: 143,
    isMonthEnd: false,
  });
  assert.match(dailyMessage, /Today:<\/b> 2 signups/);
  assert.match(dailyMessage, /Month to date \(August 2026\):<\/b> 27 signups/);
  assert.match(dailyMessage, /All-time users:<\/b> 143/);

  const monthEndMessage = buildTelegramSignupReportMessage({
    dateLabel: "Monday, August 31, 2026",
    monthLabel: "August 2026",
    timezone: "Africa/Lagos",
    dailySignups: 4,
    monthlySignups: 31,
    totalUsers: 147,
    isMonthEnd: true,
  });
  assert.match(monthEndMessage, /Month total \(August 2026\):<\/b> 31 signups/);
  assert.doesNotMatch(monthEndMessage, /Month to date/);
});

test("does not call Telegram when notification credentials are missing", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await sendTelegramMessage("test", {}), false);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends a configured Telegram message and accepts a successful API response", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "")) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(
      await sendTelegramMessage("hello", {
        TELEGRAM_BOT_TOKEN: "123:token",
        TELEGRAM_CHAT_ID: "456",
      }),
      true,
    );
    assert.deepEqual(requestBody, {
      chat_id: "456",
      text: "hello",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
