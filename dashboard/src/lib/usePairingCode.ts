"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ApiError, createPairingCode } from "./api";

const STORAGE_KEY = "mce-active-pairing";
const POLL_INTERVAL = 5000;
const PAIRING_CODE_TTL = 300; // 5 minutes

interface StoredPairing {
  code: string;
  expiresAt: string;
  /** Original TTL in seconds from the server — used for local countdown */
  ttl: number;
  /** Client-side timestamp when the code was generated — avoids clock skew issues */
  generatedAt: number;
}

function loadStoredPairing(): StoredPairing | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: StoredPairing = JSON.parse(raw);
    // Check expiry using elapsed time, not absolute clock comparison
    if (data.generatedAt && data.ttl) {
      const elapsed = (Date.now() - data.generatedAt) / 1000;
      if (elapsed < data.ttl) return data;
    } else if (data.expiresAt) {
      // Legacy format without ttl/generatedAt — fallback to clock comparison
      if (new Date(data.expiresAt).getTime() > Date.now()) return data;
    }
    clearPairing();
    return null;
  } catch {
    clearPairing();
    return null;
  }
}

function savePairing(data: StoredPairing) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Edge InPrivate / restricted contexts may block localStorage — pairing still works via state
  }
}

function clearPairing() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — Edge InPrivate may block localStorage
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPairingError(error: unknown) {
  if (error instanceof ApiError) {
    return error.status >= 500 || /database connection/i.test(error.message);
  }

  return error instanceof Error && /database connection|network/i.test(error.message);
}

async function createPairingCodeWithRetry() {
  try {
    return await createPairingCode("MakeChurchEasy", PAIRING_CODE_TTL);
  } catch (error) {
    if (!isTransientPairingError(error)) throw error;
    await wait(500);
    return createPairingCode("MakeChurchEasy", PAIRING_CODE_TTL);
  }
}

interface UsePairingCodeOptions {
  onPaired?: () => void;
}

export function usePairingCode({ onPaired }: UsePairingCodeOptions = {}) {
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [countdown, setCountdown] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paired, setPaired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track generation time and TTL locally to avoid clock-skew issues on old laptops
  const generatedAtRef = useRef(0);
  const ttlRef = useRef(0);

  const onPairedRef = useRef(onPaired);
  onPairedRef.current = onPaired;

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = loadStoredPairing();
    if (stored) {
      setCode(stored.code);
      setExpiresAt(stored.expiresAt);
      generatedAtRef.current = stored.generatedAt;
      ttlRef.current = stored.ttl;
    }
  }, []);

  // Countdown timer — uses elapsed time from generation, not absolute clock comparison
  useEffect(() => {
    if (!code || !ttlRef.current || !generatedAtRef.current) {
      setCountdown("");
      return;
    }

    function tick() {
      const elapsed = (Date.now() - generatedAtRef.current) / 1000;
      const remaining = Math.max(0, Math.ceil(ttlRef.current - elapsed));

      if (remaining <= 0) {
        setCode("");
        setExpiresAt("");
        setCountdown("");
        generatedAtRef.current = 0;
        ttlRef.current = 0;
        clearPairing();
        return;
      }

      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      setCountdown(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [code]);

  // Poll for successful pairing
  useEffect(() => {
    if (!code) return;

    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/pairing/poll?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (stopped) return;

        if (data.status === "authorized" || data.status === "redeemed") {
          setCode("");
          setExpiresAt("");
          setCountdown("");
          generatedAtRef.current = 0;
          ttlRef.current = 0;
          clearPairing();
          setPaired(true);
          onPairedRef.current?.();
        } else if (data.status === "expired") {
          setCode("");
          setExpiresAt("");
          setCountdown("");
          generatedAtRef.current = 0;
          ttlRef.current = 0;
          clearPairing();
        }
      } catch {
        // ignore network errors during polling
      }
    };

    const startPolling = () => {
      if (interval) return;
      interval = setInterval(poll, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling();
        void poll();
      } else {
        stopPolling();
      }
    };

    startPolling();
    void poll();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [code]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setPaired(false);
    setError(null);
    try {
      const result = await createPairingCodeWithRetry();

      // Record local generation time for countdown — immune to clock skew
      const now = Date.now();
      generatedAtRef.current = now;
      ttlRef.current = PAIRING_CODE_TTL;

      setCode(result.code);
      setExpiresAt(result.expiresAt);

      savePairing({
        code: result.code,
        expiresAt: result.expiresAt,
        ttl: PAIRING_CODE_TTL,
        generatedAt: now,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate code";
      setError(msg);
      console.error("[usePairingCode] generate failed:", err);
    } finally {
      setGenerating(false);
    }
  }, []);

  const copyCode = useCallback(() => {
    if (code) {
      try {
        navigator.clipboard.writeText(code);
      } catch {
        // Fallback for older browsers or non-secure contexts
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const dismissPaired = useCallback(() => setPaired(false), []);

  // isActive only checks if code data is present — no clock comparison
  // (server enforces the real TTL; we just display the code and count down locally)
  const isActive = !!code && !!expiresAt;

  return { code, expiresAt, countdown, generating, isActive, generate, copyCode, copied, paired, dismissPaired, error };
}
