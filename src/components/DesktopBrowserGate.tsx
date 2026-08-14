import { useCallback, useEffect, useState, type ReactNode } from "react";

type GateStatus = "checking" | "allowed" | "blocked";

function isTauriWindow(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function hasLocalDesktopSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/status", { cache: "no-store" });
    if (!res.ok) {
      return false;
    }

    const data = await res.json();
    return data?.authenticated !== false;
  } catch {
    return false;
  }
}

function FullscreenMessage({
  title,
  description,
  actionLabel,
  hint,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: '"CMG Sans Black", "CMG Sans", "Charis SIL", "Noto Sans", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          padding: "28px",
          border: "1px solid rgba(148, 163, 184, 0.22)",
          borderRadius: "12px",
          background: "rgba(15, 23, 42, 0.92)",
          boxShadow: "0 28px 80px rgba(2, 6, 23, 0.45)",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: "1.4rem", lineHeight: 1.2 }}>{title}</h1>
        <p style={{ margin: "0 0 16px", color: "#cbd5e1", lineHeight: 1.5 }}>{description}</p>
        {actionLabel ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: "10px",
              padding: "11px 16px",
              font: "inherit",
              fontWeight: 600,
              color: "#eff6ff",
              background: "#2563eb",
              cursor: "pointer",
            }}
          >
            {actionLabel}
          </button>
        ) : null}
        {hint ? (
          <p style={{ margin: "14px 0 0", color: "#94a3b8", fontSize: "0.92rem", lineHeight: 1.45 }}>
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function DesktopBrowserGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GateStatus>(() => (isTauriWindow() ? "allowed" : "checking"));

  const refreshStatus = useCallback(async () => {
    if (isTauriWindow()) {
      setStatus("allowed");
      return;
    }

    const allowed = await hasLocalDesktopSession();
    setStatus(allowed ? "allowed" : "blocked");
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (isTauriWindow()) {
      return;
    }

    const intervalId = setInterval(() => {
      void refreshStatus();
    }, 15_000);

    return () => clearInterval(intervalId);
  }, [refreshStatus]);

  if (status === "allowed") {
    return <>{children}</>;
  }

  if (status === "checking") {
    return (
      <FullscreenMessage
        title="Checking Desktop Session"
        description="Waiting for the local MakeChurchEasy session."
      />
    );
  }

  return (
    <FullscreenMessage
      title="Authentication Required"
      description="Please open the MakeChurchEasy desktop app and log in first."
      actionLabel="Refresh"
      hint="This page will start working again after the desktop app restores the local session."
    />
  );
}
