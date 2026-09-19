import * as React from "react";

const FONT_STACK = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const colors = {
  page: "#F8FAFC",
  surface: "#FFFFFF",
  elevated: "#F1F5F9",
  border: "#CBD5E1",
  text: "#0F172A",
  secondary: "#334155",
  muted: "#64748B",
  blue: "#1D4ED8",
  purple: "#7C3AED",
  orange: "#F97316",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
};

function PreviewText({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div
      style={{
        display: "none",
        maxHeight: 0,
        overflow: "hidden",
        opacity: 0,
      }}
    >
      {text}
    </div>
  );
}

export function EmailShell({
  preview,
  eyebrow,
  title,
  intro,
  children,
  footerText,
}: {
  preview?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  footerText?: string;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "28px 16px",
          backgroundColor: colors.page,
          fontFamily: FONT_STACK,
          color: colors.text,
        }}
      >
        <PreviewText text={preview} />
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: "collapse" }}
        >
          <tbody>
            <tr>
              <td align="center">
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    maxWidth: 620,
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 20,
                    overflow: "hidden",
                    borderCollapse: "separate",
                    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          padding: "28px 32px 18px",
                          background:
                            "linear-gradient(135deg, rgba(29,78,216,0.10), rgba(124,58,237,0.08), rgba(249,115,22,0.06))",
                          borderBottom: `1px solid ${colors.border}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: colors.blue,
                            marginBottom: 12,
                          }}
                        >
                          MakeChurchEasy
                        </div>
                        {eyebrow ? (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: colors.purple,
                              marginBottom: 10,
                            }}
                          >
                            {eyebrow}
                          </div>
                        ) : null}
                        <h1
                          style={{
                            margin: 0,
                            fontSize: 28,
                            lineHeight: 1.2,
                            color: colors.text,
                          }}
                        >
                          {title}
                        </h1>
                        {intro ? (
                          <p
                            style={{
                              margin: "12px 0 0",
                              fontSize: 15,
                              lineHeight: 1.7,
                              color: colors.secondary,
                            }}
                          >
                            {intro}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "28px 32px 32px" }}>{children}</td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          padding: "0 32px 28px",
                        }}
                      >
                        <div
                          style={{
                            borderTop: `1px solid ${colors.border}`,
                            paddingTop: 16,
                            fontSize: 12,
                            lineHeight: 1.7,
                            color: colors.muted,
                          }}
                        >
                          {footerText || "MakeChurchEasy helps churches run presentations, lyrics, Bible, and livestream workflows from one platform."}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "0 0 14px",
        fontSize: 15,
        lineHeight: 1.7,
        color: colors.secondary,
      }}
    >
      {children}
    </p>
  );
}

export function InfoCard({
  rows,
  tone = "neutral",
}: {
  rows: Array<{ label: string; value: React.ReactNode }>;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneMap = {
    neutral: { bg: colors.elevated, border: colors.border },
    success: { bg: "#F0FDF4", border: "#BBF7D0" },
    warning: { bg: "#FFFBEB", border: "#FDE68A" },
    danger: { bg: "#FEF2F2", border: "#FECACA" },
  } as const;

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        margin: "22px 0",
        backgroundColor: toneMap[tone].bg,
        border: `1px solid ${toneMap[tone].border}`,
        borderRadius: 16,
        padding: 0,
      }}
    >
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.label}>
            <td
              style={{
                padding: index === 0 ? "18px 20px 12px" : "0 20px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.4,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: colors.muted,
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: colors.text,
                  fontWeight: 600,
                }}
              >
                {row.value}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ActionButton({
  href,
  label,
  tone = "primary",
}: {
  href: string;
  label: string;
  tone?: "primary" | "secondary" | "danger";
}) {
  const background =
    tone === "danger" ? colors.danger : tone === "secondary" ? colors.elevated : colors.blue;
  const textColor = tone === "secondary" ? colors.text : "#FFFFFF";
  const borderColor = tone === "secondary" ? colors.border : background;

  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: background,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        textDecoration: "none",
        fontWeight: 700,
        fontSize: 14,
        padding: "13px 18px",
        marginRight: 12,
        marginBottom: 12,
      }}
    >
      {label}
    </a>
  );
}

export function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul
      style={{
        margin: "0 0 18px",
        paddingLeft: 18,
        color: colors.secondary,
        fontSize: 15,
        lineHeight: 1.7,
      }}
    >
      {items.map((item, index) => (
        <li key={index} style={{ marginBottom: 8 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: "26px 0 12px",
        fontSize: 17,
        lineHeight: 1.4,
        color: colors.text,
      }}
    >
      {children}
    </h2>
  );
}

export function Notice({
  children,
  tone = "warning",
}: {
  children: React.ReactNode;
  tone?: "warning" | "success" | "danger";
}) {
  const toneMap = {
    warning: { bg: "#FFFBEB", border: "#FDE68A", text: colors.secondary },
    success: { bg: "#F0FDF4", border: "#BBF7D0", text: colors.secondary },
    danger: { bg: "#FEF2F2", border: "#FECACA", text: colors.secondary },
  } as const;

  return (
    <div
      style={{
        margin: "18px 0 22px",
        padding: "14px 16px",
        borderRadius: 14,
        backgroundColor: toneMap[tone].bg,
        border: `1px solid ${toneMap[tone].border}`,
        fontSize: 14,
        lineHeight: 1.6,
        color: toneMap[tone].text,
      }}
    >
      {children}
    </div>
  );
}

export function SmallMuted({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "8px 0 0",
        fontSize: 12,
        lineHeight: 1.7,
        color: colors.muted,
      }}
    >
      {children}
    </p>
  );
}

export function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
