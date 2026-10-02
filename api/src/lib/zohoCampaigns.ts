/**
 * Adds newly verified MakeChurchEasy signups to the Zoho Campaigns list whose
 * active List Entry workflow sends the welcome message.
 *
 * This integration stays inactive until OAuth credentials, the list key, and
 * confirmation that the list's Zoho signup form is disabled are configured.
 * MakeChurchEasy has already verified the address before this function runs;
 * a second Zoho opt-in confirmation would be redundant.
 */

export type ZohoSignupWelcomeResult =
  | "sent"
  | "disabled"
  | "confirmation-required"
  | "failed";

interface ZohoOAuthResponse {
  access_token?: string;
  error?: string;
}

interface ZohoSubscribeResponse {
  status?: string;
  code?: string | number;
  message?: string;
}

function getZohoCampaignsConfig() {
  const clientId = process.env.ZOHO_CAMPAIGNS_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_CAMPAIGNS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_CAMPAIGNS_REFRESH_TOKEN?.trim();
  const listKey = (
    process.env.ZOHO_CAMPAIGNS_NEW_SIGNUPS_LIST_KEY ||
    process.env.ZOHO_CAMPAIGNS_SIGNUP_LIST_KEY
  )?.trim();

  // Explicitly require an operator-confirmed Zoho list setting. If that list
  // still has its signup form enabled, Zoho sends another confirmation email.
  const signupFormDisabled = process.env.ZOHO_CAMPAIGNS_SIGNUP_FORM_DISABLED === "true";

  if (!clientId || !clientSecret || !refreshToken || !listKey || !signupFormDisabled) {
    return null;
  }

  return { clientId, clientSecret, refreshToken, listKey };
}

async function getZohoAccessToken(config: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  });

  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => ({}))) as ZohoOAuthResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(`Zoho OAuth token refresh failed (${response.status})`);
  }

  return payload.access_token;
}

/**
 * Enrolls an email-verified signup in the active Zoho List Entry workflow.
 * The return value distinguishes an inactive integration from a failed send so
 * callers can preserve the existing transactional welcome fallback.
 */
export async function sendVerifiedSignupWelcomeThroughZoho(params: {
  email: string;
  firstName?: string | null;
}): Promise<ZohoSignupWelcomeResult> {
  const config = getZohoCampaignsConfig();
  if (!config) return "disabled";

  try {
    const accessToken = await getZohoAccessToken(config);
    const contactInfo = JSON.stringify({
      "Contact Email": params.email.trim().toLowerCase(),
      "First Name": params.firstName?.trim() || "Friend",
    });
    const body = new URLSearchParams({
      resfmt: "JSON",
      listkey: config.listKey,
      contactinfo: contactInfo,
      source: "MakeChurchEasy verified signup",
    });

    const response = await fetch("https://campaigns.zoho.com/api/v1.1/json/listsubscribe", {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as ZohoSubscribeResponse;

    if (!response.ok || String(payload.code) !== "0" || payload.status !== "success") {
      console.error("[Zoho Campaigns] Could not enroll verified signup:", {
        status: response.status,
        code: payload.code,
      });
      return "failed";
    }

    if (/confirmation email is sent/i.test(payload.message || "")) {
      console.error("[Zoho Campaigns] Signup list still requires Zoho email confirmation.");
      return "confirmation-required";
    }

    return "sent";
  } catch (error) {
    console.error("[Zoho Campaigns] Welcome workflow request failed:", error);
    return "failed";
  }
}
