/**
 * Pro License — simple client-side key validation
 *
 * Two key types:
 *   1. Pro key — permanent unlimited access (bypasses all limits)
 *   2. Renewal keys — single-use keys that reset the 2-hour usage counter
 *
 * Keys are stored as SHA-256 hashes only. Plain text never appears in source.
 */

import { getUserScopedKey } from "./userScopedStorage";

const PRO_STORAGE_KEY = "ocs-pro-unlocked";
const CONSUMED_RENEWAL_KEY = "ocs-consumed-renewals";

// SHA-256 hash of the permanent pro key: "MAKECHURCHEASY-PRO-7K9X-M2N4-P8Q6"
const PRO_KEY_HASH = "c344e2e02da3c430fc1c9791c949b047d938efea2c18e9b501d18e893821a354";

// SHA-256 hashes of single-use renewal keys (50 total)
const RENEWAL_KEY_HASHES: ReadonlySet<string> = new Set([
  "358adfc8508f625a941b1d2bc174e1cd094070597ac7574ea8b41459ecc5aeab",
  "983e1f8431751bf00c3109073a01986bfc3669915fc06040d330325cda4f968d",
  "03a4819827622d6cbcca9be62b452f44093b7a66f99ac1a2dce92a10777a36bc",
  "3e0504037952fcee5c3678ee4cd783f675d0e7b989907e8c306ea181c9016151",
  "24aad6d5bb18af72878005569a18ee7fbc1b0e81df66a67806a1ff2e86263ee4",
  "d1b65d09fa564bafaae9a3ba4e01e9738aa5230a37f845cfe4f2ad6abab6cbb9",
  "a23d55a8f027cbeffb73b74302de3ceffb4bfde75f632610b85b86890a80c12e",
  "51e23d93e8404056cd8e0072eef5bc3a905e045c5f6475fd5e8fafb5a364d564",
  "2193f01ffe8d3cf738a6521abf5fa712d93251212c8fb49e87dce18a52ead96f",
  "758817739f1880f18cab4f24370b8aad6ba6345d26caf02aead3661bc8af4e07",
  "7b1762dce3e7292ec355ee3eab7dbd664c24c467dfaa42315833409c007d5839",
  "c347c709cfb773eb0ac728d67c07ed9d649fbb78b96e4efe7e947219f3906cc8",
  "60115e9ace5239b67af839c21d3fd3c2a8c1fa0fc13579f262b128c838da582c",
  "d3532e913c90d3b9366a947d78fa28e2d35db31714997c66e2829463fa34108e",
  "d7ec2ae73c042f0d952ffefdbff09e76b427b42bd6812413af2b8c8f5d3a78e2",
  "89dc4827296ff72567ed19c16484040db19d326f46fbc8a74c2c19fdd4962908",
  "f5a9dde55fc2d5c4f36329fd44d2faf8d8871cbf53fc2258dee8a3c1f0763953",
  "630cd972525f15e4bdcf60b61046c0c8b204ca188d5673f5927c79594a05d003",
  "6f346e08ffb7afa4286458bd16f459577e612e82dbea576cff485610b8a61a7d",
  "4730e4a6cb7e9dcc6d3fade76ad547fe8ee914c5930a4beba58feee528794cbd",
  "5e4643aabfe108c58e45dbf6596c4f34d6332c4ec63d327a3eb4c5c02ee02682",
  "c240d70ed5848a097bee9e0f6730c3688ee8e6b9374a49a38b632bf503993b25",
  "c46476e7a5a37e6943a1ff7391600a50c721cc7a0184e0ed22ba61cfbd9e686d",
  "7014bc44f423b15120588b6a339089046bd085d026f8b108182eb6c47023a064",
  "9f78b86bbb24260995d211ce35264f230fe09d1401ac75d603fa66332514c3a8",
  "af5fdc8dbf5a9d3ac4397d43d6e99be08a656a72bc493f241bde7f673cc53c7a",
  "5f9086ab27751bc53ffc2b88be642c821718211cb7fb65ce37c71b25e29f7c6b",
  "10c3c88729a6c7cfd077bd193be5510f1d748e0f3cd52649b47f38001b045905",
  "9ee9f9ff5721dba3016eae9db4aafe9c29a1e9795df9162f9147a036e4decbe7",
  "8088d61b1ef8027d252c0bbd6ad80657962e9803881fb26746c40ce3b76ae7c1",
  "67fc46c4d2ec87a707e6bdebb03240a641f12a48460c803e33df993df41ef5b9",
  "21c50c699da809607b9c05ba93d3e25ac4ab2fcae504aad03a556c0622f6ddf6",
  "a70877f9722507a5f4c0f6073b487d8115e3c4048e25513ad7b9ce359e12e577",
  "4b9640bbb850460a76863a2df86ddb9f294747f5e873fc4be6b4e6a5124d0b2c",
  "497fe9ed09eb6c39f53a085b82ddd2187ba5d02a47ade74caa5a07072e26dd6c",
  "4adbd2a4cf51b05220edc01ad083cc32e220b65cb539bfae24d04ff184e45e7d",
  "3d62d57cf989e4e63df1bd23888159e70882dc8fbb637917d02efe45d96735e5",
  "18151dfd91690b4b9bd5edae994d4a49239078e787ca57016d497f74519b242a",
  "1db310cd426237257df172329ac7697c3cc58abad24896aca4d1759c1467d8de",
  "01adad7b8cfe626536bcd7ae1b07d1755fd0c4a753191959c21db993abb9ff96",
  "18bb24abf354e49ea1f864a457f87ddc02ca22034a1e50a562bd35c53a2ceb6c",
  "1c5fc23d5b183f7304b485aff3114bb2ff7dda454a0fcf2e2f7257ce70bcc09c",
  "dd7a05a026b86bad162fa4d55a4c6c5ac7193ae1662909dbd36244624d24330d",
  "3b602f6dd62763163512b81f72e8db23f0bded0ab44c4f1f63b33a1ff856698f",
  "227398148a3c8e5a2b23f1045fdc32e0cb27c23f5d0529cfb92fbe5f81d5ad96",
  "1224c1f3f2d8e1b23ca5683eb20fc05fced6d95b54cb107803b3cbe01a6d04d4",
  "38446bf823afb5698b8d890b678549eb5e83bec3519e9fd53f62d429c14b4c7b",
  "9d545a99fade77a60b5ba28f8d8b254cb2d78081f943874353b2e5cefd4b068d",
  "84fcb37b8a917b9fffefdda795f543a794e2edcd4dacf7eae3a207617bdbf1b1",
  "22d1247c1441e3e8647f85eee9bb4720a5428ce27cf30c9f44efd0a4af8ff943",
]);

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input.trim().toUpperCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getConsumedRenewals(): Set<string> {
  try {
    const raw = localStorage.getItem(getUserScopedKey(CONSUMED_RENEWAL_KEY));
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveConsumedRenewal(hash: string): void {
  try {
    const consumed = getConsumedRenewals();
    consumed.add(hash);
    localStorage.setItem(getUserScopedKey(CONSUMED_RENEWAL_KEY), JSON.stringify([...consumed]));
  } catch { /* ignore */ }
}

/** Returns "pro" | "renewal" | "invalid" */
export type KeyValidationResult = { type: "pro" } | { type: "renewal"; alreadyUsed: boolean } | { type: "invalid" };

export async function validateKey(key: string): Promise<KeyValidationResult> {
  const hash = await sha256(key);

  if (hash === PRO_KEY_HASH) return { type: "pro" };

  if (RENEWAL_KEY_HASHES.has(hash)) {
    const consumed = getConsumedRenewals();
    return { type: "renewal", alreadyUsed: consumed.has(hash) };
  }

  return { type: "invalid" };
}

/** Mark a renewal key as consumed and reset the usage counter */
export function consumeRenewalKey(key: string): Promise<boolean> {
  return sha256(key).then((hash) => {
    if (!RENEWAL_KEY_HASHES.has(hash)) return false;
    const consumed = getConsumedRenewals();
    if (consumed.has(hash)) return false;
    saveConsumedRenewal(hash);
    // Reset usage
    try {
      localStorage.setItem(getUserScopedKey("voiceBibleUsage"), JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        usedSeconds: 0,
      }));
    } catch { /* ignore */ }
    return true;
  });
}

export function isProUnlocked(): boolean {
  try {
    return localStorage.getItem(getUserScopedKey(PRO_STORAGE_KEY)) === "true";
  } catch {
    return false;
  }
}

export function setProUnlocked(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(getUserScopedKey(PRO_STORAGE_KEY), "true");
    } else {
      localStorage.removeItem(getUserScopedKey(PRO_STORAGE_KEY));
    }
  } catch {
    // Ignore storage errors
  }
}

export function getRenewalKeysRemaining(): number {
  return RENEWAL_KEY_HASHES.size - getConsumedRenewals().size;
}
