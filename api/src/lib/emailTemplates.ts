/**
 * emailTemplates.ts — Shared email layout, components, and template functions.
 *
 * Provider:
 *   - Development: nodemailer via local MailDev SMTP (localhost:1025)
 *   - Production:  provider selected by EMAIL_PROVIDER (Mailtrap or Resend)
 *
 * Configure via environment variables:
 *   EMAIL_PROVIDER  — mailtrap, resend, or console
 *   EMAIL_FALLBACK_PROVIDER — optional fallback provider
 *   MAILTRAP_API_TOKEN — Mailtrap sending API token
 *   MAILTRAP_FROM_EMAIL / MAILTRAP_FROM_NAME — Mailtrap-specific sender identity
 *   RESEND_API_KEY  — Resend API key when selected
 *   EMAIL_FROM      — sender address (default: noreply@makechurcheazy.com)
 */

import nodemailer from "nodemailer";
import { renderEmailHtml } from "./emailBranding";
import { resolveTransactionalSender, sendTransactionalEmail } from "./emailProvider";

// ─── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_EMAIL_FROM = "noreply@makechurcheazy.com";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "MakeChurchEasy";
const EMAIL_FROM = resolveEmailFrom(process.env.EMAIL_FROM);
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheazy.com";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@makechurcheazy.com";
const COMMUNITY_URL = "https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t";

function extractEmailAddress(value: string): string {
  const bracketMatch = value.match(/<([^>]+)>/);
  return (bracketMatch?.[1] || value).trim().replace(/^["']|["']$/g, "");
}

function resolveEmailFrom(value: string | undefined): string {
  const raw = (value || DEFAULT_EMAIL_FROM).trim();
  const email = extractEmailAddress(raw);
  const domain = email.split("@")[1]?.toLowerCase() || "";

  if (!domain || domain === "creatorstudioslabs.stream" || domain.endsWith(".creatorstudioslabs.stream")) {
    if (value) {
      console.warn(`[email] Ignoring unverified sender domain "${domain}". Using ${DEFAULT_EMAIL_FROM}.`);
    }
    return DEFAULT_EMAIL_FROM;
  }

  return email;
}

function formatEmailFrom(): string {
  return `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`;
}

// ─── Dev SMTP Transport (MailDev) ───────────────────────────────────────────

let _devTransporter: nodemailer.Transporter | null = null;

function getDevTransporter(): nodemailer.Transporter {
  if (!_devTransporter) {
    _devTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "localhost",
      port: parseInt(process.env.SMTP_PORT || "1025", 10),
      secure: false,
      tls: { rejectUnauthorized: false },
    });
    console.log("[email] Dev SMTP transport created → MailDev at localhost:1025");
  }
  return _devTransporter;
}

// ─── Send Utility ───────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const { to, subject, html } = options;
  const renderedHtml = await renderEmailHtml(html);
  console.log(`[email] To: ${to} | Subject: ${subject}`);

  // ── Development: route through MailDev SMTP ──
  if (process.env.NODE_ENV === "development") {
    try {
      const transporter = getDevTransporter();
      const info = await transporter.sendMail({
        from: formatEmailFrom(),
        to,
        subject,
        html: renderedHtml,
      });
      console.log(`[email] Dev SMTP sent → ${info.messageId}`);
      console.log(`[email] Preview: http://localhost:1080/#/email/${info.messageId}`);
      return true;
    } catch (err) {
      console.error("[email] Dev SMTP send failed:", err);
      console.log("[email] Falling back to console log. HTML:");
      console.log(renderedHtml);
      return false;
    }
  }

  // ── Production: selected provider ──
  const result = await sendTransactionalEmail({
    from: resolveTransactionalSender({ email: EMAIL_FROM, name: EMAIL_FROM_NAME }),
    to: [to],
    subject,
    html: renderedHtml,
    category: "transactional",
  });

  if (!result.sent) return false;

  console.log(`[email] ${result.provider} sent successfully to: ${to}`);
  return true;
}

// ─── Layout & Components ────────────────────────────────────────────────────

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function wrap(title: string, body: string): string {
  return `
    <!doctype html>
    <html lang="en" xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="x-apple-disable-message-reformatting">
        <title>${title}</title>
      </head>
      <body style="margin:0;padding:0;background:#ffffff;font-family:${FONT};-webkit-font-smoothing:antialiased;">
        <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">
          {{brand.appName}} - ${title}
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td align="left" style="vertical-align:middle;">
                          <a href="{{brand.websiteUrl}}" target="_blank" style="display:inline-block;text-decoration:none;">
                            <img src="{{brand.logoUrl}}" width="154" alt="{{brand.logoAlt}}" style="display:block;width:154px;max-width:154px;height:auto;border:0;outline:none;text-decoration:none;">
                          </a>
                        </td>
                        <td align="right" style="vertical-align:middle;">
                          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                            <tr>
                              {{#if social.twitterUrl}}<td style="padding-left:8px;"><a href="{{social.twitterUrl}}" target="_blank" style="display:inline-block;min-width:30px;padding:8px 10px;border-radius:999px;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:11px;font-weight:800;line-height:1;">X</a></td>{{/if}}
                              {{#if social.facebookUrl}}<td style="padding-left:8px;"><a href="{{social.facebookUrl}}" target="_blank" style="display:inline-block;min-width:30px;padding:8px 10px;border-radius:999px;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:11px;font-weight:800;line-height:1;">FB</a></td>{{/if}}
                              {{#if social.instagramUrl}}<td style="padding-left:8px;"><a href="{{social.instagramUrl}}" target="_blank" style="display:inline-block;min-width:30px;padding:8px 10px;border-radius:999px;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:11px;font-weight:800;line-height:1;">IG</a></td>{{/if}}
                              {{#if social.linkedinUrl}}<td style="padding-left:8px;"><a href="{{social.linkedinUrl}}" target="_blank" style="display:inline-block;min-width:30px;padding:8px 10px;border-radius:999px;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:11px;font-weight:800;line-height:1;">IN</a></td>{{/if}}
                              {{#if social.youtubeUrl}}<td style="padding-left:8px;"><a href="{{social.youtubeUrl}}" target="_blank" style="display:inline-block;min-width:30px;padding:8px 12px;border-radius:999px;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:11px;font-weight:800;line-height:1;">YouTube</a></td>{{/if}}
                              {{#if social.whatsappUrl}}<td style="padding-left:8px;"><a href="{{social.whatsappUrl}}" target="_blank" style="display:inline-block;min-width:30px;padding:8px 12px;border-radius:999px;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:11px;font-weight:800;line-height:1;">WhatsApp</a></td>{{/if}}
                              {{#if social.tiktokUrl}}<td style="padding-left:8px;"><a href="{{social.tiktokUrl}}" target="_blank" style="display:inline-block;min-width:30px;padding:8px 10px;border-radius:999px;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:11px;font-weight:800;line-height:1;">TT</a></td>{{/if}}
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="border:1px solid #e2e8f0;border-radius:20px;background:#ffffff;padding:38px 38px 34px;box-shadow:0 22px 70px rgba(15,23,42,0.08);">
                    <div style="width:48px;height:4px;border-radius:999px;background:{{brand.accentColor}};margin:0 0 18px;"></div>
                    <p style="margin:0 0 18px;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:{{brand.primaryColor}};">{{brand.appName}}</p>
                    ${body}
                  </td>
                </tr>

                <tr>
                  <td style="padding:26px 8px 0;text-align:center;">
                    <p style="margin:0 auto 14px;max-width:500px;font-size:12px;color:#64748b;line-height:1.7;">
                      {{brand.footerText}}
                    </p>
                    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.8;">
                      <a href="mailto:{{brand.supportEmail}}" style="color:#64748b;text-decoration:underline;">{{brand.supportEmail}}</a>
                      &nbsp;|&nbsp;
                      <a href="{{brand.preferencesUrl}}" target="_blank" style="color:#64748b;text-decoration:underline;">Email preferences</a>
                      &nbsp;|&nbsp;
                      <a href="{{brand.websiteUrl}}" target="_blank" style="color:#64748b;text-decoration:underline;">Website</a>
                    </p>
                    <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;">
                      &copy; {{year}} {{brand.appName}}. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#0f172a;line-height:1.2;letter-spacing:0;">${text}</h1>`;
}

function paragraph(text: string, opts?: { color?: string; mt?: number }): string {
  const color = opts?.color || "#475569";
  const mt = opts?.mt ?? 0;
  return `<p style="margin:${mt}px 0 0;font-size:15px;color:${color};line-height:1.7;">${text}</p>`;
}

function escapeEmailText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function button(href: string, label: string): string {
  return `
    <div style="margin:28px 0;">
      <a href="${href}" style="display:inline-block;padding:13px 28px;background:{{brand.primaryColor}};color:#ffffff;text-decoration:none;border-radius:999px;font-weight:800;font-size:14px;box-shadow:0 14px 28px rgba(29,78,216,0.24);">${label}</a>
    </div>
  `;
}

function card(rows: [label: string, value: string][]): string {
  const cells = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:0 0 12px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.03em;">${label}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#0f172a;font-weight:600;">${value}</p>
          </td>
        </tr>`
    )
    .join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:22px 0;">
      ${cells}
    </table>
  `;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:26px 0;">`;
}

// ─── Auth Email Templates ───────────────────────────────────────────────────

export function loginCodeEmail(code: string): SendEmailOptions {
  return {
    to: "", // set by caller
    subject: "Your MakeChurchEasy Login Code",
    html: wrap(
      "Login verification",
      `
        ${heading("Your login code")}
        ${paragraph("Enter the code below to sign in to your MakeChurchEasy account. It expires in 1 minute.")}
        <div style="margin:28px 0;text-align:center;">
          <span style="display:inline-block;padding:14px 32px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:28px;font-weight:700;color:#0f172a;letter-spacing:0.08em;font-family:monospace;">${code}</span>
        </div>
        ${paragraph("If you didn't request this, you can safely ignore this email.", { color: "#94a3b8", mt: 8 })}
      `
    ),
  };
}

export function verificationEmail(actionUrl: string): SendEmailOptions {
  return {
    to: "",
    subject: "Verify your email address — MakeChurchEasy",
    html: wrap(
      "Email verification",
      `
        ${heading("Verify your email")}
        ${paragraph("Click the button below to verify your email address and continue setting up your MakeChurchEasy account.")}
        ${button(actionUrl, "Verify Email Address")}
        ${paragraph("If you didn't create an account, you can safely ignore this email.", { color: "#94a3b8" })}
      `
    ),
  };
}

export function verificationCodeEmail(code: string): SendEmailOptions {
  return {
    to: "",
    subject: "Your MakeChurchEasy Verification Code",
    html: wrap(
      "Email verification",
      `
        ${heading("Verify your email")}
        ${paragraph("Enter the code below to verify your email address. It expires in 10 minutes.")}
        <div style="margin:28px 0;text-align:center;">
          <span style="display:inline-block;padding:14px 32px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:28px;font-weight:700;color:#0f172a;letter-spacing:0.08em;font-family:monospace;">${code}</span>
        </div>
        ${paragraph("If you didn't create an account, you can safely ignore this email.", { color: "#94a3b8", mt: 8 })}
      `
    ),
  };
}

export function welcomeEmail(params: {
  userName: string;
  userEmail: string;
  trialDays: number;
  trialEndsAt: string;
}): SendEmailOptions {
  const { userName, userEmail, trialDays, trialEndsAt } = params;
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: "Welcome to MakeChurchEasy! 🎉",
    html: wrap(
      "Welcome",
      `
        ${heading("Welcome to MakeChurchEasy!")}
        ${paragraph(`Hi ${userName}, your email is verified and your account is ready. MakeChurchEasy helps your church deliver powerful presentations, translate services in real time, and transcribe sermons — all from one app.`)}
        ${card([
        ["Trial", `${trialDays} days of full access`],
        ["Expires", endDate],
      ])}
        ${paragraph("<strong style=\"color:#0f172a;\">Here's what you can do:</strong>")}
        ${paragraph("• <strong>Bible Presentations</strong> — Display scriptures beautifully on screen<br>• <strong>Live Translation</strong> — Translate your service into 50+ languages<br>• <strong>Speech-to-Scripture</strong> — Transcribe sermons and auto-display verses<br>• <strong>AI Summaries</strong> — Auto-generate sermon notes and bulletins")}
        ${button(APP_URL + "/dashboard", "Go to Dashboard")}
        ${paragraph(`<strong style="color:#0f172a;\">Download the desktop app:</strong>`)}
        ${paragraph(`<a href="${APP_URL}/downloads" style="color:{{brand.primaryColor}};font-weight:600;">Download MakeChurchEasy →</a>`)}
        ${paragraph(`Need help getting started? Join our <a href="${COMMUNITY_URL}" style="color:{{brand.primaryColor}};">community</a> for guides and support.`, { color: "#94a3b8", mt: 12 })}
      `
    ),
  };
}

export function passwordResetEmail(actionUrl: string): SendEmailOptions {
  return {
    to: "",
    subject: "Reset your password — MakeChurchEasy",
    html: wrap(
      "Password reset",
      `
        ${heading("Reset your password")}
        ${paragraph("We received a request to reset the password for your MakeChurchEasy account. Click the button below to set a new password.")}
        ${button(actionUrl, "Reset Password")}
        ${paragraph("If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.", { color: "#94a3b8" })}
      `
    ),
  };
}

export function migrationEmail(actionUrl: string): SendEmailOptions {
  return {
    to: "",
    subject: "Set your password — MakeChurchEasy",
    html: wrap(
      "Set your password",
      `
        ${heading("Set your password")}
        ${paragraph("You previously signed in to MakeChurchEasy using Google. To continue using your account, please set a password by clicking the button below.")}
        ${button(actionUrl, "Set Password")}
        ${paragraph("If you didn't request this, you can safely ignore this email.", { color: "#94a3b8" })}
      `
    ),
  };
}

export function passwordChangedEmail(params: {
  userName: string;
  userEmail: string;
  changedBy?: "migration" | "reset" | "manual";
}): SendEmailOptions {
  const { userName, userEmail, changedBy } = params;
  const contextMap = {
    migration: "Your password has been set after migrating from your previous authentication method.",
    reset: "Your password has been reset successfully.",
    manual: "Your password has been changed.",
  };
  const context = changedBy ? contextMap[changedBy] : "Your password has been changed.";

  return {
    to: userEmail,
    subject: "Your password has been changed — MakeChurchEasy",
    html: wrap(
      "Password changed",
      `
        ${heading("Password changed")}
        ${paragraph(`Hi ${userName}, ${context}`)}
        ${card([["Time", new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })]])}
        ${paragraph("If you did not make this change, please contact our support team immediately so we can secure your account.")}
        ${button(`mailto:${SUPPORT_EMAIL}`, "Contact Support")}
        ${paragraph("For your security, we recommend enabling two-factor authentication in your account settings.", { color: "#94a3b8", mt: 16 })}
      `
    ),
  };
}

// ─── Email Change Templates ─────────────────────────────────────────────────

export function emailChangeVerificationEmail(
  newEmail: string,
  token: string
): SendEmailOptions {
  const confirmUrl = `${APP_URL}/settings/email/confirm?token=${token}`;
  return {
    to: newEmail,
    subject: "Verify your new email address — MakeChurchEasy",
    html: wrap(
      "Email change",
      `
        ${heading("Verify your new email")}
        ${paragraph(`You requested to change your MakeChurchEasy account email to <strong style="color:#0f172a;">${newEmail}</strong>.`)}
        ${paragraph("Click the button below to confirm this change. This link expires in 24 hours.")}
        ${button(confirmUrl, "Verify Email Address")}
        ${paragraph("If you didn't request this change, you can safely ignore this email. Your current email will remain active.", { color: "#94a3b8" })}
        ${paragraph("For security, you can only change your email once every 30 days.", { color: "#94a3b8", mt: 4 })}
      `
    ),
  };
}

export function emailChangeNotificationEmail(
  oldEmail: string,
  newEmail: string
): SendEmailOptions {
  return {
    to: oldEmail,
    subject: "Your MakeChurchEasy email was changed",
    html: wrap(
      "Email changed",
      `
        ${heading("Email address changed")}
        ${paragraph(`Your MakeChurchEasy account email has been changed from <strong style="color:#0f172a;">${oldEmail}</strong> to <strong style="color:#0f172a;">${newEmail}</strong>.`)}
        ${paragraph(`If you did not make this change, please contact support immediately at <a href="mailto:${SUPPORT_EMAIL}" style="color:{{brand.primaryColor}};">${SUPPORT_EMAIL}</a>.`)}
      `
    ),
  };
}

export function emailChangeConfirmedEmail(
  newEmail: string
): SendEmailOptions {
  return {
    to: newEmail,
    subject: "Your MakeChurchEasy email has been updated",
    html: wrap(
      "Email updated",
      `
        ${heading("Email address verified")}
        ${paragraph(`Your MakeChurchEasy account email has been successfully updated to <strong style="color:#0f172a;">${newEmail}</strong>.`)}
        ${paragraph("All future notifications and account communications will be sent to this address.")}
        ${paragraph("For security, you can only change your email once every 30 days.", { color: "#94a3b8", mt: 4 })}
      `
    ),
  };
}

// ─── Subscription Email Templates ───────────────────────────────────────────

interface SubscriptionEmailParams {
  userName: string;
  userEmail: string;
  planName: string;
  billingCycle?: string;
  credits?: number;
  expiresAt?: string;
  amountPaid?: string;
}

/** Plan-specific feature lists for welcome emails */
const PLAN_EMAIL_FEATURES: Record<string, string[]> = {
  basic: [
    "Countdowns to keep your services running on time",
    "Slideshow mode for worship lyrics and announcements",
    "30 songs, 20 images, and 10 videos in your library",
    "50 AI credits for Speech-to-Scripture",
    "Lower thirds and tickers for live graphics",
  ],
  growth: [
    "Countdowns to keep your services running on time",
    "Speech-to-Scripture — never type a verse again",
    "Mobile Control from your phone or tablet",
    "Live Translation for multilingual congregations",
    "EasyWorship library import in one click",
    "Free sermon transcription with every service",
    "MultiView for multi-camera setups",
    "Tickers and lower thirds for live graphics",
    "2,000 AI credits per month",
    "Unlimited themes, devices, and cloud sync",
  ],
};

export function subscriptionActivatedEmail(
  params: SubscriptionEmailParams
): SendEmailOptions {
  const { userName, userEmail, planName, billingCycle, credits, expiresAt, amountPaid } = params;
  const renewDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : null;

  const planKey = planName.toLowerCase();
  const features = PLAN_EMAIL_FEATURES[planKey] || [];

  const featureListHtml =
    features.length > 0
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
          <tr><td>
            <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.03em;font-weight:600;">What you've unlocked</p>
            ${features
        .map(
          (f) => `
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="20" valign="top" style="padding:0 8px 8px 0;">
                    <span style="display:inline-block;width:18px;height:18px;background:#ecfdf5;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#059669;">✓</span>
                  </td>
                  <td style="padding:0 0 8px;font-size:14px;color:#334155;line-height:1.5;">${f}</td>
                </tr>
              </table>`
        )
        .join("")}
          </td></tr>
        </table>
      `
      : "";

  return {
    to: userEmail,
    subject: `Your ${planName} subscription is active — MakeChurchEasy`,
    html: wrap(
      "Subscription active",
      `
        ${heading(`Welcome to ${planName}!`)}
        ${paragraph(`Hi ${userName}, your <strong style="color:#0f172a;">${planName}</strong> subscription is now active.`)}
        ${card(
        [
          ["Plan", `${planName}${billingCycle ? ` (${billingCycle})` : ""}`],
          ...(credits != null
            ? [["Credits", credits === -1 ? "Unlimited" : String(credits)] as [string, string]]
            : []),
          ...(amountPaid ? [["Amount paid", amountPaid] as [string, string]] : []),
          ...(renewDate ? [["Renews", renewDate] as [string, string]] : []),
        ]
      )}
        ${featureListHtml}
        ${button(`${APP_URL}/`, "Open Dashboard")}
        ${paragraph(`Your desktop app will pick up the new plan automatically. Need help? Visit our <a href="${COMMUNITY_URL}" style="color:{{brand.primaryColor}};">community</a>.`, { color: "#94a3b8" })}
      `
    ),
  };
}

export function subscriptionRenewedEmail(
  params: {
    userName: string;
    userEmail: string;
    planName: string;
    expiresAt: string;
    amountPaid?: string;
  }
): SendEmailOptions {
  const { userName, userEmail, planName, expiresAt, amountPaid } = params;
  const renewDate = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: `Your ${planName} subscription has renewed — MakeChurchEasy`,
    html: wrap(
      "Subscription renewed",
      `
        ${heading("Subscription renewed")}
        ${paragraph(`Hi ${userName}, your <strong style="color:#0f172a;">${planName}</strong> subscription has been renewed successfully.`)}
        ${card([
        ["Plan", planName],
        ...(amountPaid ? [["Amount charged", amountPaid] as [string, string]] : []),
        ["Next renewal", renewDate],
      ])}
      `
    ),
  };
}

export function adminManagedSubscriptionEmail(params: {
  userName: string;
  userEmail: string;
  planName: string;
  billingCycle: string;
  expiresAt: string;
  mode: "started" | "renewed";
  amountPaid?: string;
  paymentReference?: string;
}): SendEmailOptions {
  const { userName, userEmail, planName, billingCycle, expiresAt, mode, amountPaid, paymentReference } = params;
  const accessUntil = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const isRenewal = mode === "renewed";

  return {
    to: userEmail,
    subject: `Your ${planName} subscription has ${isRenewal ? "renewed" : "started"} — MakeChurchEasy`,
    html: wrap(
      isRenewal ? "Subscription renewed" : "Subscription started",
      `
        ${heading(isRenewal ? "Subscription renewed" : "Subscription started")}
        ${paragraph(`Hi ${userName}, your <strong style="color:#0f172a;">${planName}</strong> subscription has been ${isRenewal ? "renewed" : "started"}.`)}
        ${paragraph("Your payment was confirmed by the MakeChurchEasy admin team, so your access is active immediately.")}
        ${card([
        ["Plan", `${planName} (${billingCycle})`],
        ...(amountPaid ? [["Amount paid", amountPaid] as [string, string]] : []),
        ...(paymentReference ? [["Payment reference", paymentReference] as [string, string]] : []),
        ["Access until", accessUntil],
      ])}
        ${button(`${APP_URL}/`, "Open Dashboard")}
        ${paragraph("Your desktop app will pick up the subscription automatically the next time it syncs.", { color: "#94a3b8" })}
      `
    ),
  };
}

export function subscriptionCancelledEmail(
  params: {
    userName: string;
    userEmail: string;
    planName: string;
    expiresAt: string;
  }
): SendEmailOptions {
  const { userName, userEmail, planName, expiresAt } = params;
  const accessUntil = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: `Your ${planName} subscription has been cancelled — MakeChurchEasy`,
    html: wrap(
      "Subscription cancelled",
      `
        ${heading("Subscription cancelled")}
        ${paragraph(`Hi ${userName}, your <strong style="color:#0f172a;">${planName}</strong> subscription has been cancelled.`)}
        ${paragraph(`You'll continue to have access until <strong style="color:#0f172a;">${accessUntil}</strong>. After that, your account will return to the Free plan.`)}
        ${button(`${APP_URL}/dashboard`, "Resubscribe")}
      `
    ),
  };
}

export function subscriptionExpiredEmail(
  params: {
    userName: string;
    userEmail: string;
    planName: string;
    expiredAt: string;
  }
): SendEmailOptions {
  const { userName, userEmail, planName, expiredAt } = params;
  const expiryDate = new Date(expiredAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: `Your ${planName} subscription has expired — MakeChurchEasy`,
    html: wrap(
      "Subscription expired",
      `
        ${heading("Your subscription has expired")}
        ${paragraph(`Hi ${userName}, your <strong style="color:#0f172a;">${planName}</strong> subscription expired on <strong style="color:#0f172a;">${expiryDate}</strong>.`)}
        ${paragraph("Your account has been returned to the Free plan. You can upgrade again at any time to restore your paid features and credits.")}
        ${button(`${APP_URL}/dashboard`, "View Plans")}
      `
    ),
  };
}

export function paymentFailedEmail(
  params: {
    userName: string;
    userEmail: string;
    planName: string;
    gracePeriodEndsAt?: string | null;
    retryUrl?: string;
  }
): SendEmailOptions {
  const { userName, userEmail, planName, gracePeriodEndsAt, retryUrl } = params;
  const graceDate = gracePeriodEndsAt
    ? new Date(gracePeriodEndsAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : null;
  return {
    to: userEmail,
    subject: `Payment failed for your ${planName} subscription — MakeChurchEasy`,
    html: wrap(
      "Payment failed",
      `
        ${heading("Payment failed")}
        ${paragraph(`Hi ${userName}, we couldn't process your payment for the <strong style="color:#0f172a;">${planName}</strong> subscription.`)}
        ${paragraph(graceDate
        ? `Your paid access stays active during the grace period. If the payment is not completed by <strong style="color:#0f172a;">${graceDate}</strong>, your account will move to the Free plan.`
        : "Your paid access stays active for the grace period. If the payment is not completed in time, your account will move to the Free plan.")}
        ${paragraph("Please update your payment method or retry the payment. If the issue persists, contact your bank or payment provider.")}
        ${button(retryUrl || `${APP_URL}/billing`, "Fix Payment")}
      `
    ),
  };
}

// ─── Trial Email Templates ──────────────────────────────────────────────────

interface TrialEmailParams {
  userName: string;
  userEmail: string;
  trialDays: number;
  trialEndsAt: string;
}

export function trialActivatedEmail(params: TrialEmailParams): SendEmailOptions {
  const { userName, userEmail, trialDays, trialEndsAt } = params;
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: `Your ${trialDays}-day Growth Trial is live! — MakeChurchEasy`,
    html: wrap(
      "Trial activated",
      `
        ${heading("Your Growth Trial is live!")}
        ${paragraph(`Hi ${userName}, your <strong style="color:#0f172a;">${trialDays}-day Growth Trial</strong> is now active. You have full access to premium features including translation, speech-to-scripture, AI summaries, and more.`)}
        ${card([
        ["Trial ends", endDate],
        ["Credits", "Full trial allocation"],
        ["Features", "Translation, Speech-to-Scripture, AI, and more"],
      ])}
        ${paragraph("<strong style=\"color:#0f172a;\">Quick setup checklist:</strong>")}
        ${paragraph("1. Download MakeChurchEasy<br>2. Pair your first device<br>3. Connect OBS<br>4. Run your first presentation")}
        ${button(`${APP_URL}/dashboard`, "View Dashboard")}
        ${paragraph("Upgrade anytime to keep your access after the trial. No charge until you decide.", { color: "#94a3b8" })}
      `
    ),
  };
}

/** Sent to activated-trial experiment users before their first useful setup. */
export function activationRequiredWelcomeEmail(params: {
  userName: string;
  userEmail: string;
  trialDays?: number;
}): SendEmailOptions {
  const { userName, userEmail, trialDays = 7 } = params;
  return {
    to: userEmail,
    subject: "Your first MakeChurchEasy setup starts here",
    html: wrap(
      "First setup",
      `
        ${heading("Let's get your first presentation running")}
        ${paragraph(`Hi ${userName}, your MakeChurchEasy account is ready. Your Growth access starts when you connect OBS, so your trial time is reserved for when you can actually use the product.`)}
        ${card([
          ["First step", "Open MakeChurchEasy Desktop"],
          ["Then", "Connect OBS and present one verse"],
          ["Trial", `${trialDays} days after activation`],
        ])}
        ${button(`${APP_URL}/dashboard`, "Continue Setup")}
        ${paragraph(`If anything blocks you, reply to this email or use our <a href="${COMMUNITY_URL}" style="color:{{brand.primaryColor}};">community support</a>.`, { color: "#94a3b8" })}
      `,
    ),
  };
}

/** @deprecated Use trialActivatedEmail instead */
export const welcomeTrialActivatedEmail = trialActivatedEmail;

export function trialDay1ActivationEmail(params: TrialEmailParams): SendEmailOptions {
  const { userName, userEmail, trialDays, trialEndsAt } = params;
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: "Get your first presentation running — MakeChurchEasy",
    html: wrap(
      "Activation",
      `
        ${heading("Ready to get started?")}
        ${paragraph(`Hi ${userName}, your Growth Trial is going strong! Here's a quick checklist to get your first presentation running:`)}
        ${card([
        ["Trial status", `${trialDays} days remaining`],
        ["Trial ends", endDate],
      ])}
        ${paragraph("<strong style=\"color:#0f172a;\">Quick setup checklist:</strong>")}
        ${paragraph("✓ Download MakeChurchEasy<br>✓ Pair your first device<br>✓ Connect OBS<br>✓ Run your first presentation")}
        ${button(`${APP_URL}/dashboard`, "Complete Setup")}
        ${paragraph("Need help? Visit our community for guides and support.", { color: "#94a3b8" })}
  `
    ),
  };
}

export function activationNudgeEmail(params: {
  userName: string;
  userEmail: string;
  trialDays: number;
  activationRequired?: boolean;
}): SendEmailOptions {
  const { userName, userEmail, trialDays, activationRequired = false } = params;
  return {
    to: userEmail,
    subject: "Need a hand getting MakeChurchEasy ready?",
    html: wrap(
      "Activation reminder",
      `
        ${heading("Let's get your first result")}
        ${paragraph(`Hi ${userName}, the fastest way to see MakeChurchEasy's value is to connect OBS and present one Bible verse. ${activationRequired ? `Your ${trialDays}-day trial starts after that first activation, so you have the full window to test it.` : "Your trial is already running, so this is a good time to try it."}`)}
        ${paragraph("1. Open MakeChurchEasy Desktop<br>2. Connect OBS<br>3. Open Bible and push one verse to OBS")}
        ${button(`${APP_URL}/dashboard`, "Continue Setup")}
        ${paragraph(`If something stopped you, <a href="${APP_URL}/dashboard?activationSurvey=1" style="color:{{brand.primaryColor}};font-weight:600;">tell us what happened</a>.`, { color: "#94a3b8" })}
      `,
    ),
  };
}

export function trialDay3FeatureDiscoveryEmail(params: TrialEmailParams): SendEmailOptions {
  const { userName, userEmail, trialDays, trialEndsAt } = params;
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: "Have you tried Speech-to-Scripture yet? — MakeChurchEasy",
    html: wrap(
      "Feature discovery",
      `
        ${heading("Try Speech-to-Scripture")}
        ${paragraph(`Hi ${userName}, have you tried our Speech-to-Scripture feature yet? It transcribes sermons in real time and displays scripture on screen automatically.`)}
        ${card([
        ["Trial status", `${trialDays} days remaining`],
        ["Trial ends", endDate],
      ])
      }
        ${paragraph("<strong style=\"color:#0f172a;\">Features to explore:</strong>")}
        ${paragraph("• <strong>Speech-to-Scripture</strong> — Transcribe sermons in real time<br>• <strong>Live Translation</strong> — Translate to 50+ languages<br>• <strong>AI Summaries</strong> — Auto-generate sermon notes")}
        ${button(`${APP_URL}/library`, "Explore Features")}
        ${paragraph("These features are included in your trial and available with the Growth plan.", { color: "#94a3b8" })}
  `
    ),
  };
}

export function trialDay5FeatureDrivingEmail(params: TrialEmailParams): SendEmailOptions {
  const { userName, userEmail, trialDays, trialEndsAt } = params;
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: "Most churches start here — MakeChurchEasy",
    html: wrap(
      "Feature driving",
      `
        ${heading("Most churches start here")}
        ${paragraph(`Hi ${userName}, you're halfway through your Growth Trial! Here are the features most churches use first:`)}
        ${card([
        ["Trial status", `${trialDays} days remaining`],
        ["Trial ends", endDate],
      ])
      }
        ${paragraph("<strong style=\"color:#0f172a;\">Popular features:</strong>")}
        ${paragraph("• <strong>Translation</strong> — Reach your entire congregation in their language<br>• <strong>AI Summaries</strong> — Auto-generate sermon notes and bulletins<br>• <strong>OBS Integration</strong> — Direct broadcast control from the app")}
        ${button(`${APP_URL}/library`, "Try These Features")}
        ${paragraph("You have full access during your trial. Upgrade anytime to keep using these features.", { color: "#94a3b8" })}
  `
    ),
  };
}

export function trialEndingSoonEmail(params: TrialEmailParams): SendEmailOptions {
  const { userName, userEmail, trialDays, trialEndsAt } = params;
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: `Your trial ends in ${trialDays} day${trialDays === 1 ? "" : "s"} — MakeChurchEasy`,
    html: wrap(
      "Trial ending soon",
      `
        ${heading("Trial ending soon")}
        ${paragraph(`Hi ${userName}, your Growth Trial ends in <strong style="color:#0f172a;">${trialDays} day${trialDays === 1 ? "" : "s"}</strong> on ${endDate}.`)}
        ${paragraph("After your trial ends, your account will return to the Free plan with limited access. Upgrade now to keep all Growth features.")}
        ${button(`${APP_URL}/dashboard`, "Upgrade Now")}
  `
    ),
  };
}

export function trial1DayRemainingEmail(params: TrialEmailParams): SendEmailOptions {
  const { userName, userEmail, trialDays, trialEndsAt } = params;
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: "Your trial ends tomorrow — MakeChurchEasy",
    html: wrap(
      "Trial ending",
      `
        ${heading("Your trial ends tomorrow")}
        ${paragraph(`Hi ${userName}, your Growth Trial ends tomorrow on ${endDate}.`)}
        ${paragraph("Here's what you've accomplished during your trial:")}
        ${card([
        ["Trial ends", "Tomorrow"],
        ["Upgrade to keep", "Translation, Speech-to-Scripture, AI Summaries"],
      ])
      }
        ${paragraph("Upgrade now to avoid interruption and keep all your premium features.")}
        ${button(`${APP_URL}/dashboard`, "Upgrade Now")}
        ${paragraph("You can also continue with the Free plan with limited access.", { color: "#94a3b8" })}
  `
    ),
  };
}

export function trialExpiredEmail(
  params: {
    userName: string;
    userEmail: string;
    freeCredits?: number;
  }
): SendEmailOptions {
  const { userName, userEmail, freeCredits = 25 } = params;
  return {
    to: userEmail,
    subject: "Your trial has ended — MakeChurchEasy",
    html: wrap(
      "Trial ended",
      `
        ${heading("Trial ended")}
        ${paragraph(`Hi ${userName}, your Growth Trial has ended. Your account has been returned to the Free plan.`)}
        ${card([
        ["Free plan limits", `${freeCredits.toLocaleString()} Credits/month, 1 Device`],
        ["Upgrade to restore", "Translation, Speech-to-Scripture, AI Features"],
      ])
      }
        ${paragraph("Upgrade anytime to unlock more features and credits.")}
        ${button(`${APP_URL}/dashboard`, "View Plans")}
  `
    ),
  };
}

export function reEngagementEmail(
  params: {
    userName: string;
    userEmail: string;
  }
): SendEmailOptions {
  const { userName, userEmail } = params;
  return {
    to: userEmail,
    subject: "We miss you at MakeChurchEasy — Come back and save 20%",
    html: wrap(
      "We miss you",
      `
        ${heading("We miss you!")}
        ${paragraph(`Hi ${userName}, it's been a week since your Growth Trial ended. Your church community is waiting — and we'd love to have you back.`)}
        ${paragraph("While you were away, here's what churches using MakeChurchEasy have been doing:")}
        ${paragraph("• <strong>Delivered 1,000+ presentations</strong> across congregations<br>• <strong>Translated services</strong> for multilingual communities<br>• <strong>Transcribed sermons</strong> with Speech-to-Scripture<br>• <strong>Generated sermon notes</strong> with AI Summaries")}
        ${card([
        ["Special offer", "20% off your first 3 months"],
        ["Use code", "COMEBACK20"],
        ["Expires", "7 days from today"],
      ])}
        ${button(`${APP_URL}/dashboard`, "Upgrade Now — Save 20%")}
        ${paragraph("This offer is only available for a limited time. Don't miss out on making your church services more impactful.", { color: "#94a3b8" })}
        ${paragraph(`Questions? Reply to this email or reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:{{brand.primaryColor}};">${SUPPORT_EMAIL}</a>.`, { color: "#94a3b8", mt: 8 })}
  `
    ),
  };
}

// ─── Lifecycle Email Templates ──────────────────────────────────────────────

export function newDeviceLoginEmail(
  params: {
    userName: string;
    userEmail: string;
    deviceName: string;
    deviceOs: string;
    loginTime: string;
  }
): SendEmailOptions {
  const { userName, userEmail, deviceName, deviceOs, loginTime } = params;
  return {
    to: userEmail,
    subject: "New device connected to your MakeChurchEasy account",
    html: wrap(
      "New device login",
      `
        ${heading("New device connected")}
        ${paragraph(`Hi ${userName}, a new device was connected to your MakeChurchEasy account:`)}
        ${card([
        ["Device", `${deviceName} (${deviceOs})`],
        ["Login time", loginTime],
      ])
      }
        ${paragraph("If this wasn't you, please contact our support team immediately so we can secure your account.")}
        ${button(`mailto:${SUPPORT_EMAIL}`, "Contact Support")}
        ${paragraph(`For your security, we recommend reviewing your <a href="${APP_URL}/settings" style="color:{{brand.primaryColor}};">account settings</a> and ensuring two-factor authentication is enabled.`, { color: "#94a3b8", mt: 16 })}
  `
    ),
  };
}

export function subscriptionExpiringSoonEmail(
  params: {
    userName: string;
    userEmail: string;
    planName: string;
    expiresAt: string;
    daysLeft: number;
  }
): SendEmailOptions {
  const { userName, userEmail, planName, expiresAt, daysLeft } = params;
  const expiryDate = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: `Your ${planName} subscription expires in ${daysLeft} days`,
    html: wrap(
      "Subscription expiring",
      `
        ${heading("Subscription expiring soon")}
        ${paragraph(`Hi ${userName}, your <strong style="color:#0f172a;">${planName}</strong> subscription expires in <strong style="color:#0f172a;">${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong> on ${expiryDate}.`)}
        ${paragraph("To keep your access to all features without interruption, renew your subscription before it expires.")}
        ${button(`${APP_URL}/dashboard`, "Renew Subscription")}
        ${paragraph("After expiry, your account will return to the Free plan with limited access.", { color: "#94a3b8" })}
  `
    ),
  };
}

export function paymentReceiptEmail(
  params: {
    userName: string;
    userEmail: string;
    planName: string;
    amount: string;
    billingCycle: string;
    paidAt: string;
    receiptNumber: string;
    invoiceUrl?: string;
  }
): SendEmailOptions {
  const { userName, userEmail, planName, amount, billingCycle, paidAt, receiptNumber, invoiceUrl } = params;
  return {
    to: userEmail,
    subject: `Payment receipt — ${planName} `,
    html: wrap(
      "Payment receipt",
      `
        ${heading("Payment receipt")}
        ${paragraph(`Hi ${userName}, your payment has been processed successfully.`)}
        ${card([
        ["Plan", planName],
        ["Amount", amount],
        ["Billing cycle", billingCycle],
        ["Paid on", paidAt],
        ["Receipt number", receiptNumber],
      ])
      }
        ${invoiceUrl ? button(invoiceUrl, "View invoice") : ""}
        ${paragraph(`You can also view all receipts in your <a href="${APP_URL}/billing" style="color:{{brand.primaryColor}};">billing history</a>.`, { color: "#94a3b8" })}
  `
    ),
  };
}

export function planUpgradeEmail(
  params: {
    userName: string;
    userEmail: string;
    fromPlan: string;
    toPlan: string;
    newFeatures: string[];
  }
): SendEmailOptions {
  const { userName, userEmail, fromPlan, toPlan, newFeatures } = params;
  const featuresList =
    newFeatures.length > 0
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;border-collapse:collapse;">
          ${newFeatures
            .map(
              (feature) => `
                <tr>
                  <td width="20" valign="top" style="padding:0 8px 8px 0;">
                    <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#fff7ed;color:{{brand.accentColor}};font-size:12px;font-weight:800;line-height:18px;text-align:center;">•</span>
                  </td>
                  <td style="padding:0 0 8px;font-size:14px;color:#475569;line-height:1.6;">
                    ${escapeEmailText(feature)}
                  </td>
                </tr>`
            )
            .join("")}
        </table>
      `
      : "";
  return {
    to: userEmail,
    subject: `Welcome to ${toPlan}!`,
    html: wrap(
      "Plan upgraded",
      `
        ${heading("You've upgraded!")}
        ${paragraph(`Hi ${userName}, congratulations on upgrading from <strong style="color:#0f172a;">${fromPlan}</strong> to <strong style="color:#0f172a;">${toPlan}</strong>!`)}
        ${paragraph("Here are the features you've just unlocked:")}
        ${featuresList}
        ${button(`${APP_URL}/dashboard`, "Go to Dashboard")}
        ${paragraph("Your new plan is active immediately. Enjoy the new features!", { color: "#94a3b8" })}
      `
    ),
  };
}

export function adminTemporaryPlanGrantedEmail(params: {
  userName: string;
  userEmail: string;
  previousPlan: string;
  newPlan: string;
  expiresAt: string;
  reason?: string;
}): SendEmailOptions {
  const { userName, userEmail, previousPlan, newPlan, expiresAt, reason } = params;
  const endDate = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    to: userEmail,
    subject: `Temporary ${newPlan} access is active — MakeChurchEasy`,
    html: wrap(
      "Temporary plan access",
      `
        ${heading("Temporary access updated")}
        ${paragraph(`Hi ${userName}, your MakeChurchEasy plan has been changed from <strong style="color:#0f172a;">${previousPlan}</strong> to <strong style="color:#0f172a;">${newPlan}</strong>.`)}
        ${card([
        ["Current plan", newPlan],
        ["Access ends", endDate],
        ["After this date", "Your account returns to the Free plan"],
        ...(reason ? [["Note", reason] as [string, string]] : []),
      ])}
        ${paragraph("Your desktop app will pick up this plan automatically the next time it checks your account.")}
        ${button(`${APP_URL}/dashboard`, "Open Dashboard")}
      `
    ),
  };
}

export function adminTemporaryPlanEndedEmail(params: {
  userName: string;
  userEmail: string;
  endedPlan: string;
  reason?: "expired" | "ended_by_admin";
}): SendEmailOptions {
  const { userName, userEmail, endedPlan, reason } = params;
  const endedByAdmin = reason === "ended_by_admin";

  return {
    to: userEmail,
    subject: "Your temporary MakeChurchEasy access has ended",
    html: wrap(
      "Temporary access ended",
      `
        ${heading("Temporary access ended")}
        ${paragraph(`Hi ${userName}, your temporary <strong style="color:#0f172a;">${endedPlan}</strong> access has ${endedByAdmin ? "been ended by an admin" : "expired"}.`)}
        ${card([
        ["Current plan", "Free"],
        ["What happens now", "Your account continues on the Free plan"],
      ])}
        ${paragraph("Bible presentation, worship presentation, media management, OBS integration, themes, and lower thirds are still available according to your Free plan limits.")}
        ${button(`${APP_URL}/subscription/plans`, "View Plans")}
      `
    ),
  };
}

export function ambassadorWelcomeEmail(params: {
  name: string;
  credits: number;
  expiresAt: string;
}): SendEmailOptions {
  const { name, credits, expiresAt } = params;
  return {
    to: "",
    subject: "Welcome to the MakeChurchEasy Ambassador Program",
    html: wrap(
      "Ambassador Program",
      `
        ${heading("Congratulations!")}
        ${paragraph(`Hi ${name},`)}
        ${paragraph("You have been selected as a <strong style=\"color:#1D4ED8;\">MakeChurchEasy Ambassador</strong>. Your account has been upgraded to Ambassador status.")}
        ${paragraph("<strong>Your Ambassador Benefits:</strong>")}
        ${card([
        ["Plan", "Growth (Full Access)"],
        ["Credits", `${credits.toLocaleString()} credits`],
        ["Access Until", expiresAt],
      ])}
        ${paragraph("Thank you for helping churches discover MakeChurchEasy. As an Ambassador, you have full access to Growth features to share with your community.")}
        ${button(`${APP_URL}/dashboard`, "Go to Dashboard")}
        ${paragraph("If you have any questions, reply to this email or contact our support team.", { color: "#94a3b8" })}
      `
    ),
  };
}

export interface DiscountOfferEmailParams {
  toEmail: string;
  name?: string;
  churchName?: string;
  headline?: string;
  discountPercent?: number;
  durationMonths?: number;
  trialExtensionDays?: number;
  promoCode?: string;
  claimUrl: string;
  planName?: string;
  billingCycle?: string;
  expiresAt?: string;
  customNote?: string;
}

export function discountOfferEmail(params: DiscountOfferEmailParams): SendEmailOptions {
  const {
    toEmail,
    name,
    churchName,
    headline,
    discountPercent,
    durationMonths = 1,
    trialExtensionDays,
    promoCode,
    claimUrl,
    planName = "Growth",
    billingCycle = "monthly",
    expiresAt,
    customNote,
  } = params;

  const recipientLabel = churchName || name || "Church Leader";
  const subject = headline || (discountPercent ? `Special Offer: ${discountPercent}% off MakeChurchEasy` : "Special Offer from MakeChurchEasy");

  let offerSummary = "";
  if (discountPercent) {
    offerSummary = `${discountPercent}% off for ${durationMonths} month${durationMonths > 1 ? "s" : ""}`;
  } else if (trialExtensionDays) {
    offerSummary = `${trialExtensionDays} extra days on your Free Trial`;
  }

  const cardRows: [string, string][] = [];
  if (planName) cardRows.push(["Plan", planName]);
  if (offerSummary) cardRows.push(["Discount", offerSummary]);
  if (billingCycle) cardRows.push(["Billing", billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)]);
  if (expiresAt) cardRows.push(["Expires On", new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })]);

  const promoBox = promoCode
    ? `
      <div style="background:#f8fafc;border:2px dashed #6366f1;border-radius:16px;padding:24px;text-align:center;margin:24px 0;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;">YOUR PROMO CODE</p>
        <div style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:26px;font-weight:900;letter-spacing:0.1em;color:#4338ca;background:#ffffff;padding:12px 24px;border-radius:10px;display:inline-block;border:1px solid #e0e7ff;box-shadow:0 2px 8px rgba(99,102,241,0.08);">${promoCode}</div>
        <p style="margin:12px 0 0;font-size:14px;font-weight:700;color:#1e293b;">${offerSummary}</p>
      </div>
    `
    : trialExtensionDays
      ? `
      <div style="background:#f0fdf4;border:2px dashed #10b981;border-radius:16px;padding:24px;text-align:center;margin:24px 0;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#059669;">TRIAL EXTENDED</p>
        <div style="font-size:26px;font-weight:900;letter-spacing:0.04em;color:#047857;">+${trialExtensionDays} DAYS FREE</div>
        <p style="margin:12px 0 0;font-size:14px;font-weight:700;color:#1e293b;">Your trial has been extended! Continue using all features without interruption.</p>
      </div>
    `
      : "";

  const html = wrap(
    "Special Discount",
    `
      <div style="display:inline-block;padding:5px 14px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">EXCLUSIVE MINISTRY OFFER</div>
      ${heading(headline || (discountPercent ? `Get ${discountPercent}% Off MakeChurchEasy` : "Special Discount For Your Ministry"))}
      ${paragraph(`Dear ${escapeEmailText(recipientLabel)},`)}
      ${paragraph(customNote || "We want to help your church present scripture, worship songs, and church media with complete excellence and zero stress. We've unlocked a special discount tailored for your ministry:")}
      ${promoBox}
      ${cardRows.length > 0 ? card(cardRows) : ""}
      <div style="margin:28px 0;text-align:center;">
        <a href="${claimUrl}" style="display:inline-block;padding:15px 36px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:800;font-size:15px;box-shadow:0 14px 28px rgba(79,70,229,0.32);">Claim Discount Now &rarr;</a>
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;text-align:center;">
        Clicking the button will automatically apply your discount at checkout. You can also enter the promo code <strong>${promoCode || ""}</strong> on the plans page.
      </p>
      ${paragraph("If you have any questions or need setup assistance for your service, just reply directly to this email.", { color: "#94a3b8", mt: 24 })}
    `
  );

  return {
    to: toEmail,
    subject,
    html,
  };
}

