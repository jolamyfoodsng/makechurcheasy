"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  deleteUserAccount,
  registerSession,
  get2FAStatus,
  verify2FA,
  sendVerificationEmail as apiSendVerificationEmail,
  sendPasswordResetEmail as apiSendPasswordResetEmail,
} from "../lib/api";
import { setUserId, clearUserId } from "../lib/userId";
import { resolveLocalePreference } from "@/i18n/routing";
import type { MongoUser } from "@/lib/authTypes";

interface AuthContextValue {
  mongoUser: MongoUser | null;
  loading: boolean;
  requiresTwoFactor: boolean;
  refreshMongoUser: () => Promise<void>;
  verifyTwoFactor: (token: string) => Promise<void>;
  cancelTwoFactor: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ needsMigration?: boolean; emailNotVerified?: boolean; email?: string }>;
  signUpWithEmail: (email: string, password: string, name: string, churchName: string, country: string) => Promise<{ needsEmailVerification?: boolean; email?: string; existingAccount?: boolean }>;
  signInWithGoogle: (returnUrl?: string) => Promise<boolean>;
  logOut: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  reauthenticate: (password: string) => Promise<void>;
  hasPasswordProvider: () => boolean;
  isGoogleLinked: () => boolean;
  updatePassword: (newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMongoUser(): Promise<MongoUser | null> {
  try {
    const res = await fetch("/api/auth/status", {
      credentials: "include",
    });
    const data = await res.json();
    if (data.authenticated && data.user) {
      return data.user;
    }
  } catch (e) {
    console.error("[AuthContext:fetchMongoUser] error:", e);
  }
  return null;
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/mac os/i.test(ua)) return "macOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  return "Unknown OS";
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Unknown";
}

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem("mce_session_id");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("mce_session_id", sessionId);
  }
  return sessionId;
}

export function AuthProvider({
  children,
  initialMongoUser = null,
}: {
  children: ReactNode;
  initialMongoUser?: MongoUser | null;
}) {
  const [mongoUser, setMongoUser] = useState<MongoUser | null>(initialMongoUser);
  const [loading, setLoading] = useState(() => !initialMongoUser);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const signingUpRef = useState(false)[0];

  useEffect(() => {
    let cancelled = false;

    const refreshSession = async () => {
      try {
        const mongo = await fetchMongoUser();
        if (cancelled) return;
        setMongoUser(mongo);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (initialMongoUser?._id) {
      setLoading(false);
      void refreshSession();
    } else {
      void refreshSession();
    }

    return () => {
      cancelled = true;
    };
  }, [initialMongoUser]);

  useEffect(() => {
    if (!mongoUser?._id) {
      clearUserId();
      return;
    }

    setUserId(mongoUser._id);

    if (mongoUser.language) {
      const current = document.cookie.match(/NEXT_LOCALE=([^;]+)/)?.[1];
      const resolved = resolveLocalePreference(mongoUser.language, mongoUser.country);
      if (current !== resolved) {
        const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
        document.cookie = `NEXT_LOCALE=${resolved};expires=${expires};path=/;SameSite=Lax`;
      }
    }

    registerSession({
      sessionId: getOrCreateSessionId(),
      deviceName: detectBrowser(),
      devicePlatform: "web",
      deviceOs: detectOS(),
      browser: detectBrowser(),
    }).catch(() => { });
  }, [mongoUser?._id, mongoUser?.language, mongoUser?.country]);

  async function refreshMongoUser() {
    const mongo = await fetchMongoUser();
    setMongoUser(mongo);
  }

  async function signInWithEmail(
    email: string,
    password: string
  ): Promise<{ needsMigration?: boolean; emailNotVerified?: boolean; email?: string }> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.error || "Login failed") as Error & { code?: string };
      err.code = data.code;
      throw err;
    }

    // Migration needed — user has Firebase UID but no password
    if (data.needsMigration) {
      return { needsMigration: true, email: data.email };
    }

    // Email not verified — backend generated and sent a new PIN
    if (data.emailNotVerified) {
      return { emailNotVerified: true, email: data.email };
    }

    // Check if 2FA is enabled
    try {
      const status = await get2FAStatus();
      if (status.enabled) {
        setRequiresTwoFactor(true);
        return {};
      }
    } catch {
      // If 2FA check fails, proceed without 2FA
    }

    const mongo = await fetchMongoUser();
    setMongoUser(mongo);
    if (mongo?._id) {
      setUserId(mongo._id);
    }
    return {};
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    name: string,
    churchName: string,
    country: string
  ): Promise<{ needsEmailVerification?: boolean; email?: string; existingAccount?: boolean }> {
    // The API creates the user, generates PIN, sends email, and sets the session cookie
    const signupRes = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password, churchName, country }),
    });

    if (!signupRes.ok) {
      const data = await signupRes.json().catch(() => ({}));
      const msg = data.error || `Signup failed (${signupRes.status})`;
      throw new Error(msg);
    }

    const data = await signupRes.json();

    // User is logged in (session cookie set) but needs email verification
    if (data.needsEmailVerification) {
      return {
        needsEmailVerification: true,
        email: data.email,
        existingAccount: Boolean(data.existingAccount),
      };
    }

    const mongo = await fetchMongoUser();
    setMongoUser(mongo);
    if (mongo?._id) {
      setUserId(mongo._id);
    }
    return {};
  }

  async function signInWithGoogle(returnUrl = "/dashboard"): Promise<boolean> {
    // Redirect to server-side Google OAuth flow
    const origin = window.location.origin;
    const safeReturnUrl =
      returnUrl.startsWith("/") && !returnUrl.startsWith("//")
        ? returnUrl
        : "/dashboard";
    window.location.href = `/api/auth/google?origin=${encodeURIComponent(origin)}&returnUrl=${encodeURIComponent(origin + safeReturnUrl)}`;
    return false;
  }

  async function verifyTwoFactor(token: string) {
    const res = await verify2FA(token);
    if (!res.success) throw new Error("Invalid code");

    const mongo = await fetchMongoUser();
    setMongoUser(mongo);
    if (mongo?._id) {
      setUserId(mongo._id);
    }
    setRequiresTwoFactor(false);
  }

  function cancelTwoFactor() {
    setRequiresTwoFactor(false);
    // Clear session cookie by logging out
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => { });
  }

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => { });
    setMongoUser(null);
    setRequiresTwoFactor(false);
    clearUserId();
    localStorage.removeItem("mce_session_id");
  }

  async function sendVerificationEmail() {
    await apiSendVerificationEmail(mongoUser?.email || undefined);
  }

  async function sendPasswordResetEmail(email: string) {
    await apiSendPasswordResetEmail(email);
  }

  async function reauthenticate(password: string) {
    // Verify password by calling login endpoint (session-cookie-aware)
    // The user must already be logged in, so we just verify the password is correct
    const email = mongoUser?.email;
    if (!email) throw new Error("Not signed in");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      throw new Error("Incorrect password");
    }
  }

  function hasPasswordProvider(): boolean {
    // User has a password if they signed up with email/password
    // or if they've migrated from Firebase (set password during migration)
    return !!mongoUser?.password;
  }

  function isGoogleLinked(): boolean {
    return mongoUser?.provider === "google";
  }

  async function updatePassword(newPassword: string) {
    // Re-authentication is done by the caller before calling this
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ newPassword, token: "self" }), // token= "self" for authenticated password change
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update password");
    }
  }

  async function deleteAccount() {
    const uid = mongoUser?._id;
    if (uid) {
      await deleteUserAccount(uid).catch(() => { });
    }
    await logOut();
  }

  return (
    <AuthContext.Provider
      value={{
        mongoUser,
        loading,
        requiresTwoFactor,
        refreshMongoUser,
        verifyTwoFactor,
        cancelTwoFactor,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        logOut,
        sendVerificationEmail,
        sendPasswordResetEmail,
        reauthenticate,
        hasPasswordProvider,
        isGoogleLinked,
        updatePassword,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
