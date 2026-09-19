import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTelegramApiErrorMessage,
  notifyTelegramApiError,
  resetApiErrorAlertStateForTests,
} from "./apiErrorAlerts";

const telegramEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  TELEGRAM_API_ERROR_ALERTS_ENABLED: "true",
  TELEGRAM_NOTIFICATIONS_ENABLED: "true",
  TELEGRAM_API_ERROR_COOLDOWN_MS: "0",
  TELEGRAM_BOT_TOKEN: "123:token",
  TELEGRAM_CHAT_ID: "456",
  ...overrides,
} as unknown as NodeJS.ProcessEnv);

test("builds an identified and escaped API alert", () => {
  const message = buildTelegramApiErrorMessage({
    alertId: "mce-api-alert-1",
    requestId: "req-123",
    statusCode: 500,
    routePath: "/api/notes",
    method: "POST",
    errorName: "Error",
    errorMessage: "Database <connection> failed",
    identity: "user user-123 · device device-456",
    appVersion: "1.2.3",
    userAgent: "test-agent",
    category: "response",
    environment: "production",
    occurredAt: "2026-08-15T12:00:00.000Z",
  });

  assert.match(message, /MakeChurchEasy API error response/);
  assert.match(message, /Alert ID:<\/b> mce-api-alert-1/);
  assert.match(message, /Request ID:<\/b> req-123/);
  assert.match(message, /POST \/api\/notes/);
  assert.match(message, /user user-123/);
  assert.match(message, /Database &lt;connection&gt; failed/);
});

test("sends API errors to the configured MakeChurchEasy Alerts chat", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "")) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  resetApiErrorAlertStateForTests();
  try {
    const sent = await notifyTelegramApiError({
      error: new Error("Database password=super-secret failed"),
      statusCode: 500,
      routePath: "/api/notes",
      method: "POST",
      requestId: "req-123",
      request: {
        headers: new Headers({
          "x-user-id": "user-123",
          "x-mce-device-id": "device-456",
          "x-app-version": "1.2.3",
          "user-agent": "test-agent",
        }),
      },
      category: "exception",
    }, telegramEnv());

    assert.equal(sent, true);
    const sentBody = requestBody as unknown as Record<string, unknown>;
    const text = String(sentBody.text || "");
    assert.match(text, /Request ID:<\/b> req-123/);
    assert.match(text, /user user-123/);
    assert.match(text, /device device-456/);
    assert.match(text, /password=\[REDACTED\]/);
    assert.doesNotMatch(text, /super-secret/);
    assert.equal(sentBody.chat_id, "456");
  } finally {
    globalThis.fetch = originalFetch;
    resetApiErrorAlertStateForTests();
  }
});

test("groups repeated identical API errors during the cooldown", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  resetApiErrorAlertStateForTests();
  try {
    const context = {
      error: new Error("same failure"),
      statusCode: 503,
      routePath: "/api/health-check",
      method: "GET",
    };
    const env = telegramEnv({ TELEGRAM_API_ERROR_COOLDOWN_MS: "60000" });

    assert.equal(await notifyTelegramApiError(context, env), true);
    assert.equal(await notifyTelegramApiError(context, env), false);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiErrorAlertStateForTests();
  }
});

test("does not call Telegram when API alerts are disabled or not configured", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  resetApiErrorAlertStateForTests();
  try {
    const context = { error: new Error("ignored"), routePath: "/api/test" };
    assert.equal(
      await notifyTelegramApiError(context, telegramEnv({ TELEGRAM_API_ERROR_ALERTS_ENABLED: "false" })),
      false,
    );
    assert.equal(await notifyTelegramApiError(context, {} as NodeJS.ProcessEnv), false);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiErrorAlertStateForTests();
  }
});

test("API alerts remain independent from the general Telegram notification toggle", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  resetApiErrorAlertStateForTests();
  try {
    assert.equal(
      await notifyTelegramApiError(
        { error: new Error("critical"), statusCode: 500, routePath: "/api/test" },
        telegramEnv({ TELEGRAM_NOTIFICATIONS_ENABLED: "false" }),
      ),
      true,
    );
    assert.equal(fetchCalled, true);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiErrorAlertStateForTests();
  }
});
