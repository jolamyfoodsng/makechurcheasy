"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export interface BreadcrumbEntry {
  type: "click" | "navigation" | "error";
  target?: string;
  text?: string;
  url?: string;
  timestamp: string;
}

const MAX_BREADCRUMBS = 10;
const THROTTLE_WINDOW_MS = 5000;
const MAX_ERRORS_PER_INTERVAL = 6;
const INTERVAL_RESET_MS = 30000;

// Module-level rolling state
const breadcrumbs: BreadcrumbEntry[] = [];
let lastActionDescription = "";
const recentErrorTimestamps: number[] = [];
const recentErrorSignatures = new Map<string, number>();

/**
 * Clean up text for breadcrumb storage.
 */
function sanitizeText(text: string | null | undefined, maxLen = 40): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

/**
 * Extract a human-friendly description of what was clicked.
 */
function describeElement(el: HTMLElement | null): { action: string; target: string; text: string } {
  if (!el) {
    return { action: "Unknown interaction", target: "unknown", text: "" };
  }

  // Find the closest interactive element (button, a, input, etc.)
  const interactive = el.closest<HTMLElement>(
    'button, a, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [data-action]'
  ) || el;

  const tag = interactive.tagName.toLowerCase();
  const text =
    sanitizeText(interactive.getAttribute("aria-label")) ||
    sanitizeText(interactive.getAttribute("title")) ||
    sanitizeText(interactive.innerText || interactive.textContent) ||
    sanitizeText((interactive as HTMLInputElement).placeholder) ||
    sanitizeText((interactive as HTMLInputElement).value);

  const identifier =
    interactive.id ? `#${interactive.id}` :
    interactive.getAttribute("data-testid") ? `[data-testid="${interactive.getAttribute("data-testid")}"]` :
    interactive.getAttribute("name") ? `[name="${interactive.getAttribute("name")}"]` :
    interactive.className && typeof interactive.className === "string"
      ? `.${interactive.className.split(" ")[0]}`
      : "";

  let action = `Clicked <${tag}${identifier ? ` ${identifier}` : ""}>`;
  if (text) {
    action += ` "${text}"`;
  }
  if (tag === "a") {
    const href = (interactive as HTMLAnchorElement).getAttribute("href");
    if (href) action += ` (href: ${href})`;
  }

  return { action, target: `${tag}${identifier}`, text };
}

/**
 * Send an error report to the server.
 */
export async function sendErrorReport(data: {
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  pathname?: string;
  action?: string;
  breadcrumbs?: BreadcrumbEntry[];
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  churchName?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const now = Date.now();
    const signature = `${data.message}:${data.pathname || window.location.pathname}`;

    // Rate limiting: deduplicate identical errors within 5 seconds
    const lastSeen = recentErrorSignatures.get(signature);
    if (lastSeen && now - lastSeen < THROTTLE_WINDOW_MS) {
      return;
    }
    recentErrorSignatures.set(signature, now);

    // Rate limiting: cap errors per 30-second window
    recentErrorTimestamps.push(now);
    const windowStart = now - INTERVAL_RESET_MS;
    while (recentErrorTimestamps.length > 0 && recentErrorTimestamps[0] < windowStart) {
      recentErrorTimestamps.shift();
    }
    if (recentErrorTimestamps.length > MAX_ERRORS_PER_INTERVAL) {
      return;
    }

    const payload = {
      message: data.message,
      name: data.name || "Error",
      stack: data.stack || "",
      componentStack: data.componentStack || "",
      url: data.url || window.location.href,
      pathname: data.pathname || window.location.pathname,
      action: data.action || lastActionDescription || "Page interaction",
      breadcrumbs: data.breadcrumbs || [...breadcrumbs],
      userId: data.userId || null,
      userEmail: data.userEmail || null,
      userName: data.userName || null,
      churchName: data.churchName || null,
      userAgent: navigator.userAgent,
      source: "client",
      metadata: {
        screen: `${window.innerWidth}x${window.innerHeight}`,
        devicePixelRatio: window.devicePixelRatio,
        language: navigator.language,
        referrer: document.referrer || null,
        ...(data.metadata || {}),
      },
    };

    // Try fetch with keepalive first
    await fetch("/api/logs/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "include",
    }).catch(() => {});
  } catch {
    // Fail silently: error reporting should never crash the user's browser
  }
}

export default function ClientErrorTelemetry() {
  const pathname = usePathname();
  const { mongoUser } = useAuth();
  const userRef = useRef(mongoUser);

  useEffect(() => {
    userRef.current = mongoUser;
  }, [mongoUser]);

  // Track page navigation breadcrumbs
  useEffect(() => {
    if (!pathname) return;
    const entry: BreadcrumbEntry = {
      type: "navigation",
      url: pathname,
      target: pathname,
      timestamp: new Date().toISOString(),
    };
    breadcrumbs.push(entry);
    if (breadcrumbs.length > MAX_BREADCRUMBS) {
      breadcrumbs.shift();
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Track user clicks and element targets
    const handleClick = (e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        const { action, target: targetStr, text } = describeElement(target);
        lastActionDescription = action;

        breadcrumbs.push({
          type: "click",
          target: targetStr,
          text,
          timestamp: new Date().toISOString(),
        });
        if (breadcrumbs.length > MAX_BREADCRUMBS) {
          breadcrumbs.shift();
        }
      } catch {
        // Ignore tracking errors
      }
    };

    // Unhandled JS runtime errors
    const handleError = (e: ErrorEvent) => {
      try {
        const user = userRef.current;
        const message = e.message || "Uncaught runtime error";
        const stack = e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`;

        sendErrorReport({
          message,
          name: e.error?.name || "Error",
          stack,
          url: window.location.href,
          pathname: window.location.pathname,
          action: lastActionDescription || "Runtime exception",
          breadcrumbs: [...breadcrumbs],
          userId: user?._id?.toString() || null,
          userEmail: user?.email || null,
          userName: user?.name || null,
          churchName: user?.churchName || null,
        });
      } catch {
        // Ignore
      }
    };

    // Unhandled Promise rejections
    const handleRejection = (e: PromiseRejectionEvent) => {
      try {
        const user = userRef.current;
        let message = "Unhandled Promise Rejection";
        let stack = "";

        if (e.reason instanceof Error) {
          message = e.reason.message || message;
          stack = e.reason.stack || "";
        } else if (typeof e.reason === "string") {
          message = e.reason;
        } else if (e.reason && typeof e.reason === "object") {
          try {
            message = JSON.stringify(e.reason);
          } catch {
            message = String(e.reason);
          }
        }

        sendErrorReport({
          message: `Promise Rejection: ${message}`,
          name: "UnhandledRejection",
          stack,
          url: window.location.href,
          pathname: window.location.pathname,
          action: lastActionDescription || "Async operation rejection",
          breadcrumbs: [...breadcrumbs],
          userId: user?._id?.toString() || null,
          userEmail: user?.email || null,
          userName: user?.name || null,
          churchName: user?.churchName || null,
        });
      } catch {
        // Ignore
      }
    };

    document.addEventListener("click", handleClick, { capture: true, passive: true });
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
