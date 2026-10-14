/**
 * licenseSeal.ts — verifies the server-signed licence.
 *
 * In the desktop app the check runs in native Rust (`verify_license`), where the
 * public key is compiled in and the code is much harder to patch than this
 * JavaScript bundle. In a plain browser context (no Tauri) it falls back to
 * Web Crypto with the same public key.
 *
 * The same native module keeps a tamper-evident "latest server time seen" so a
 * rewound system clock can't extend a plan after the localStorage copy is wiped.
 */

import { invoke } from "@tauri-apps/api/core";
import { verifyDetachedSignature } from "./cryptoVerify";

export interface SealedLicense {
  /** Exact string the server signed. */
  signed: string;
  /** Base64 Ed25519 signature over `signed`. */
  signature: string;
}

export type SealResult =
  | { valid: true; license: Record<string, unknown>; signedAtMs: number | null; reason: string }
  | { valid: false; reason: string };

interface NativeVerdict {
  valid: boolean;
  reason: string;
  license?: Record<string, unknown> | null;
  signed_at_ms?: number | null;
}

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function readSealed(response: unknown): SealedLicense | null {
  const r = response as { licenseSigned?: unknown; licenseSignature?: unknown } | null;
  if (r && typeof r.licenseSigned === "string" && typeof r.licenseSignature === "string"
    && r.licenseSigned && r.licenseSignature) {
    return { signed: r.licenseSigned, signature: r.licenseSignature };
  }
  return null;
}

export async function verifySealed(sealed: SealedLicense, expectedDeviceId: string): Promise<SealResult> {
  if (inTauri()) {
    try {
      const v = await invoke<NativeVerdict>("verify_license", {
        signed: sealed.signed,
        signature: sealed.signature,
        expectedDeviceId,
      });
      if (!v.valid || !v.license) return { valid: false, reason: v.reason || "rejected" };
      return { valid: true, license: v.license, signedAtMs: v.signed_at_ms ?? null, reason: v.reason };
    } catch (err) {
      console.warn("[licenseSeal] Native verification failed:", err);
      return { valid: false, reason: "native_error" };
    }
  }

  // Browser fallback
  try {
    const parsed = JSON.parse(sealed.signed) as Record<string, unknown>;
    if (!(await verifyDetachedSignature(sealed.signed, sealed.signature))) {
      return { valid: false, reason: "bad_signature" };
    }
    if (parsed.deviceId !== expectedDeviceId) return { valid: false, reason: "wrong_device" };
    const signedAtMs = typeof parsed.signedAt === "string" ? Date.parse(parsed.signedAt) : NaN;
    return { valid: true, license: parsed, signedAtMs: Number.isFinite(signedAtMs) ? signedAtMs : null, reason: "ok" };
  } catch {
    return { valid: false, reason: "malformed" };
  }
}

/** Latest server-confirmed time recorded natively on this computer (0 = none / not in the app). */
export async function readNativeClock(): Promise<number> {
  if (!inTauri()) return 0;
  try {
    return Number(await invoke<number>("license_clock_read")) || 0;
  } catch {
    return 0;
  }
}

/** Records a server-confirmed time natively and returns the latest time seen. */
export async function noteNativeClock(serverMs: number): Promise<number> {
  if (!inTauri() || !Number.isFinite(serverMs) || serverMs <= 0) return serverMs;
  try {
    return Number(await invoke<number>("license_clock_note", { serverMs })) || serverMs;
  } catch {
    return serverMs;
  }
}

/** Best-effort report to the server that a licence failed verification. */
export async function reportLicenseTamper(
  apiBase: string,
  deviceId: string,
  deviceSecret: string | null,
  reason: string,
  appVersion: string,
): Promise<void> {
  try {
    await fetch(`${apiBase.replace(/\/+$/, "")}/api/device/tamper-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
        ...(deviceSecret ? { "X-Device-Secret": deviceSecret } : {}),
        "X-App-Version": appVersion,
      },
      body: JSON.stringify({ reason, kind: "license" }),
    });
  } catch {
    /* reporting must never affect the app */
  }
}
