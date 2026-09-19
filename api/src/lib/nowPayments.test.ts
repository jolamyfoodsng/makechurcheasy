import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import {
  getNowPaymentsSignaturePayload,
  verifyNowPaymentsSignature,
} from "./nowPayments";

test("serializes NOWPayments IPN payloads with recursively sorted keys", () => {
  assert.equal(
    getNowPaymentsSignaturePayload({ z: 1, nested: { b: 2, a: 1 }, a: "first" }),
    '{"a":"first","nested":{"a":1,"b":2},"z":1}',
  );
});

test("accepts a valid NOWPayments HMAC signature", () => {
  const previous = process.env.NOWPAYMENTS_IPN_SECRET;
  process.env.NOWPAYMENTS_IPN_SECRET = "test-ipn-secret";
  const payload = { payment_status: "finished", order_id: "order-1", payment_id: 123 };
  const signature = crypto
    .createHmac("sha512", "test-ipn-secret")
    .update(getNowPaymentsSignaturePayload(payload))
    .digest("hex");

  assert.equal(verifyNowPaymentsSignature(payload, signature), true);
  assert.equal(verifyNowPaymentsSignature(payload, `${signature.slice(0, -1)}0`), false);

  if (previous === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
  else process.env.NOWPAYMENTS_IPN_SECRET = previous;
});

