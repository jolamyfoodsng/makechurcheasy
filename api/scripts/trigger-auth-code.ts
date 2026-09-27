/**
 * trigger-auth-code.ts — Diagnostic and test trigger for authentication codes.
 *
 * Usage:
 *   npx tsx scripts/trigger-auth-code.ts [email] [type: verification|login] [code]
 *
 * Example:
 *   npx tsx scripts/trigger-auth-code.ts victorheirobo@gmail.com verification
 *   npx tsx scripts/trigger-auth-code.ts victorheirobo@gmail.com login 482910
 */

import { sendEmail, verificationCodeEmail, loginCodeEmail } from "../src/lib/emailTemplates";
import { getEmailProviderChain, sendTransactionalEmail } from "../src/lib/emailProvider";

async function main() {
  const targetEmail = process.argv[2] || "victorheirobo@gmail.com";
  const type = (process.argv[3] || "verification").toLowerCase();
  const rawCode = process.argv[4];
  const code = rawCode && /^\d{6}$/.test(rawCode)
    ? rawCode
    : Math.floor(100000 + Math.random() * 900000).toString();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  MakeChurchEasy Auth Code Trigger");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`• Target recipient: ${targetEmail}`);
  console.log(`• Code type:        ${type}`);
  console.log(`• Generated code:   ${code}`);
  console.log(`• NODE_ENV:         ${process.env.NODE_ENV || "not set (defaulting to test mode)"}`);
  console.log(`• Provider chain:   ${getEmailProviderChain().join(" → ")}`);
  console.log(`• Cloudflare Acct:  ${process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID ? "configured" : "NOT set"}`);
  console.log(`• Cloudflare Token: ${process.env.CLOUDFLARE_EMAIL_API_TOKEN ? "configured" : "NOT set"}`);
  console.log(`• EMAIL_FROM:       ${process.env.EMAIL_FROM || "default (noreply@notifications.makechurcheazy.com)"}`);
  console.log("───────────────────────────────────────────────────────────────\n");

  const emailOpts = type === "login" ? loginCodeEmail(code) : verificationCodeEmail(code);
  emailOpts.to = targetEmail;

  console.log(`[1] Triggering sendEmail()...`);
  const success = await sendEmail(emailOpts);
  console.log(`\n• sendEmail() result: ${success ? "SUCCESS ✅" : "FAILED ❌"}`);

  // Also test direct transactional Cloudflare dispatch if credentials exist
  if (process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID && process.env.CLOUDFLARE_EMAIL_API_TOKEN) {
    console.log(`\n[2] Testing direct Cloudflare API dispatch...`);
    const txResult = await sendTransactionalEmail({
      from: { email: process.env.EMAIL_FROM || "noreply@notifications.makechurcheazy.com", name: "MakeChurchEasy" },
      to: [targetEmail],
      subject: emailOpts.subject,
      html: emailOpts.html,
      category: "transactional",
    });
    console.log("• Cloudflare dispatch result:", txResult);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error triggering auth code:", err);
  process.exit(1);
});
