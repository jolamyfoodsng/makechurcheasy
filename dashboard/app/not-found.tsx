import type { Metadata } from "next";
import Link from "next/link";
import { Home, Download } from "lucide-react";
import { MarketingHeader, MarketingFooter } from "./marketing-shell";
import styles from "./homepage.module.css";

export const metadata: Metadata = {
  title: "404 - Page Not Found | MakeChurchEazy",
  description: "The page you are looking for does not exist.",
};

export default function NotFound() {
  return (
    <div
      className={styles.home}
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
      }}
    >
      <MarketingHeader />

      <main
        id="main"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "5rem 1.5rem",
          background: "radial-gradient(ellipse at 50% 30%, #F1F5F9 0%, #FFFFFF 70%)",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
          }}
        >
          {/* Subtle pill tag */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "9999px",
              backgroundColor: "#EFF6FF",
              border: "1px solid #DBEAFE",
              color: "#1D4ED8",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "16px",
            }}
          >
            404 Error
          </div>

          {/* Clean, restrained heading */}
          <div
            style={{
              fontSize: "28px",
              fontWeight: 800,
              color: "#0F172A",
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
              marginBottom: "10px",
            }}
          >
            Page not found
          </div>

          {/* Subtitle */}
          <p
            style={{
              fontSize: "15px",
              color: "#64748B",
              lineHeight: 1.6,
              margin: "0 auto 24px",
              maxWidth: "380px",
            }}
          >
            The page you requested doesn't exist, was moved, or the link has a typo.
          </p>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "28px",
            }}
          >
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#1D4ED8",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: "10px",
                textDecoration: "none",
              }}
            >
              <Home size={16} />
              Back to Home
            </Link>

            <Link
              href="/download"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#FFFFFF",
                color: "#334155",
                fontSize: "14px",
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                textDecoration: "none",
              }}
            >
              <Download size={16} color="#1D4ED8" />
              Download App
            </Link>
          </div>

          {/* Helpful text links */}
          <div
            style={{
              borderTop: "1px solid #E2E8F0",
              paddingTop: "18px",
              fontSize: "13px",
              color: "#64748B",
            }}
          >
            Looking for:{" "}
            <Link href="/features" style={{ color: "#1D4ED8", fontWeight: 500, textDecoration: "underline" }}>
              Features
            </Link>
            {" · "}
            <Link href="/#plans" style={{ color: "#1D4ED8", fontWeight: 500, textDecoration: "underline" }}>
              Pricing
            </Link>
            {" · "}
            <Link href="/docs" style={{ color: "#1D4ED8", fontWeight: 500, textDecoration: "underline" }}>
              Docs
            </Link>
            {" · "}
            <Link href="/tutorials" style={{ color: "#1D4ED8", fontWeight: 500, textDecoration: "underline" }}>
              Tutorials
            </Link>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
