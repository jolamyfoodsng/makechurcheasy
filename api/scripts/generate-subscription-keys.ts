/**
 * generate-subscription-keys.ts
 *
 * Generates an Ed25519 keypair for subscription state signing.
 * Run once: npx tsx web/scripts/generate-subscription-keys.ts
 *
 * Outputs:
 * - Private key (PEM) → copy to SUBSCRIPTION_PRIVATE_KEY env var
 * - Public key (base64 DER) → paste into src/services/cryptoVerify.ts
 */

import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const publicKeyBase64 = publicKey.toString("base64");
const privateKeyOneLine = privateKey.replace(/\n/g, "\\n");

console.log("═══════════════════════════════════════════════════════════════");
console.log("  Subscription Signing Keys Generated");
console.log("═══════════════════════════════════════════════════════════════\n");

console.log("1. Add to your Vercel env vars (SUBSCRIPTION_PRIVATE_KEY):");
console.log("───────────────────────────────────────────────────────────────");
console.log(privateKeyOneLine);
console.log("\n");

console.log("2. Paste into src/services/cryptoVerify.ts (PUBLIC_KEY_BASE64):");
console.log("───────────────────────────────────────────────────────────────");
console.log(publicKeyBase64);
console.log("\n");

console.log("═══════════════════════════════════════════════════════════════");
console.log("  IMPORTANT: Keep the private key secret!");
console.log("  Never commit it to git or expose it in client code.");
console.log("═══════════════════════════════════════════════════════════════");
