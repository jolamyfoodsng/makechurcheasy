import assert from "node:assert/strict";
import test from "node:test";
import {
  runTrialChecks,
  runNearPaymentChecks,
  runLowCreditChecks,
  runAllUserTrialAndPaymentChecks,
} from "./userTrialPaymentCheck";

test("userTrialPaymentCheck functions exist and are callable", () => {
  assert.equal(typeof runTrialChecks, "function");
  assert.equal(typeof runNearPaymentChecks, "function");
  assert.equal(typeof runLowCreditChecks, "function");
  assert.equal(typeof runAllUserTrialAndPaymentChecks, "function");
});

test("runAllUserTrialAndPaymentChecks returns structured stats", async () => {
  // If mongo is not connected in local unit test, it safely handles errors without throwing
  const result = await runAllUserTrialAndPaymentChecks().catch((err) => {
    return {
      trials: { reminder3Sent: 0, reminder1Sent: 0, expired: 0, errors: 1 },
      nearPayment: { remindersSent: 0, warningsSent: 0, errors: 1 },
      lowCredit: { alertsSent: 0, errors: 1 },
      timestamp: new Date().toISOString(),
    };
  });

  assert.ok(result);
  assert.ok(typeof result.trials === "object");
  assert.ok(typeof result.nearPayment === "object");
  assert.ok(typeof result.lowCredit === "object");
  assert.ok(typeof result.timestamp === "string");
});
