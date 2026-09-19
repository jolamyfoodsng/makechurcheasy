import assert from "node:assert/strict";
import { test } from "node:test";

import { getFallbackDeviceLimitForPlan } from "./deviceLimitDefaults";
import { isDeviceLimitExceeded } from "./deviceLimitPolicy";

test("allows a Growth user through the configured device limit", () => {
  assert.equal(isDeviceLimitExceeded(10, 10), false);
  assert.equal(isDeviceLimitExceeded(11, 10), true);
});

test("does not lock plans with unlimited devices", () => {
  assert.equal(isDeviceLimitExceeded(100, Infinity), false);
});

test("fallback device limits match every supported plan tier", () => {
  assert.deepEqual(
    {
      free: getFallbackDeviceLimitForPlan("free"),
      trial: getFallbackDeviceLimitForPlan("trial"),
      basic: getFallbackDeviceLimitForPlan("basic"),
      growth: getFallbackDeviceLimitForPlan("growth"),
      pro: getFallbackDeviceLimitForPlan("pro"),
      ambassador: getFallbackDeviceLimitForPlan("ambassador"),
      unlimited: getFallbackDeviceLimitForPlan("unlimited"),
    },
    {
      free: 1,
      trial: 10,
      basic: 3,
      growth: 10,
      pro: 10,
      ambassador: 10,
      unlimited: 10,
    },
  );
});
