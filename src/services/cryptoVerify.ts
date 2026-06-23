/**
 * cryptoVerify.ts — Ed25519 signature verification for subscription payloads
 *
 * Verifies that subscription state payloads were signed by the server's
 * private key and haven't been tampered with.
 */

// Ed25519 public key in base64-encoded DER format (SPKI)
// Generated from the same keypair as SUBSCRIPTION_PRIVATE_KEY on the server
const PUBLIC_KEY_BASE64 = import.meta.env.VITE_SUBSCRIPTION_PUBLIC_KEY || "";

/**
 * Verify an Ed25519 signature against a payload.
 * Returns true if the signature is valid, false otherwise.
 */
export async function verifySubscriptionSignature(
  payload: Record<string, unknown>,
  signatureBase64: string
): Promise<boolean> {
  // In dev mode without keys, skip verification
  if (!PUBLIC_KEY_BASE64) {
    console.warn("[cryptoVerify] No public key configured — skipping verification (dev mode)");
    return true;
  }

  try {
    // Import the public key
    const keyBuffer = base64ToArrayBuffer(PUBLIC_KEY_BASE64);
    const publicKey = await crypto.subtle.importKey(
      "spki",
      keyBuffer,
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );

    // Canonicalize the payload (sorted keys) — same as server-side
    const canonical = canonicalize(payload);
    const dataBuffer = new TextEncoder().encode(canonical);

    // Decode the signature
    const sigBuffer = base64ToArrayBuffer(signatureBase64);

    // Verify
    const valid = await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      sigBuffer,
      dataBuffer
    );

    return valid;
  } catch (err) {
    console.error("[cryptoVerify] Signature verification failed:", err);
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function canonicalize(payload: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) {
    sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
