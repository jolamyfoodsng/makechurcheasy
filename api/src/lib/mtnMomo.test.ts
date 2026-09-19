import assert from "node:assert/strict";
import { test } from "node:test";

import { MtnMomoError, normalizeMtnMsisdn } from "./mtnMomo";

test("normalizes Nigerian MTN MoMo numbers to the MSISDN required by Collection RequestToPay", () => {
  assert.equal(normalizeMtnMsisdn("0803 123 4567", "NG"), "2348031234567");
  assert.equal(normalizeMtnMsisdn("+234 803 123 4567", "NG"), "2348031234567");
});

test("rejects MoMo numbers for a market that has not been configured", () => {
  assert.throws(
    () => normalizeMtnMsisdn("08031234567", "KE"),
    (error: unknown) => error instanceof MtnMomoError && error.statusCode === 400,
  );
});
