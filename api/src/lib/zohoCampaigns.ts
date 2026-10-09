/** Zoho Campaigns subscriber API for verified MakeChurchEasy signups. */

export type ZohoSignupWelcomeResult =
  | { status: "sent" }
  | { status: "disabled"; errorCode: string }
  | { status: "confirmation-required" }
  | {
      status: "failed";
      stage: "oauth" | "subscribe" | "network";
      errorCode: string;
      httpStatus?: number;
    };

interface ZohoOAuthResponse {
  access_token?: string;
  error?: string;
}

interface ZohoSubscribeResponse {
  status?: string;
  code?: string | number;
  message?: string;
}

interface ZohoCampaignsConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  listKey: string;
}

function getZohoCampaignsConfig():
  | { config: ZohoCampaignsConfig; errorCode?: never }
  | { config?: never; errorCode: string } {
  const clientId = process.env.ZOHO_CAMPAIGNS_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_CAMPAIGNS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_CAMPAIGNS_REFRESH_TOKEN?.trim();
  const listKey = (
    process.env.ZOHO_CAMPAIGNS_NEW_SIGNUPS_LIST_KEY ||
    process.env.ZOHO_CAMPAIGNS_SIGNUP_LIST_KEY
  )?.trim();

  if (!clientId || !clientSecret || !refreshToken || !listKey) {
    return { errorCode: "configuration_incomplete" };
  }

  // The app already verifies the address. A Zoho confirmation would block
  // list entry and require the person to verify the same address a second time.
  if (process.env.ZOHO_CAMPAIGNS_SIGNUP_FORM_DISABLED !== "true") {
    return { errorCode: "signup_form_not_disabled" };
  }

  return { config: { clientId, clientSecret, refreshToken, listKey } };
}

function safeErrorCode(value: unknown, fallback: string): string {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const code = String(value).trim().replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  return code || fallback;
}

function getNetworkErrorCode(error: unknown): string {
  if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
    return "request_timeout";
  }
  const causeCode = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return safeErrorCode(causeCode, "network_error");
}

/** Adds or updates an already email-verified contact in the signup list. */
export async function sendVerifiedSignupWelcomeThroughZoho(params: {
  email: string;
  firstName?: string | null;
}): Promise<ZohoSignupWelcomeResult> {
  const configResult = getZohoCampaignsConfig();
  if (!configResult.config) {
    console.error("[Zoho Campaigns] Signup integration is not ready:", configResult.errorCode);
    return { status: "disabled", errorCode: configResult.errorCode };
  }
  const config = configResult.config;

  try {
    const tokenBody = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    });
    const tokenResponse = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
      signal: AbortSignal.timeout(10_000),
    });
    const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as ZohoOAuthResponse;

    if (!tokenResponse.ok || !tokenPayload.access_token) {
      const errorCode = safeErrorCode(tokenPayload.error, `http_${tokenResponse.status}`);
      console.error("[Zoho Campaigns] OAuth refresh failed:", {
        httpStatus: tokenResponse.status,
        errorCode,
      });
      return {
        status: "failed",
        stage: "oauth",
        errorCode,
        httpStatus: tokenResponse.status,
      };
    }

    const contactInfo = JSON.stringify({
      "Contact Email": params.email.trim().toLowerCase(),
      "First Name": params.firstName?.trim() || "Friend",
    });
    const subscribeBody = new URLSearchParams({
      resfmt: "JSON",
      listkey: config.listKey,
      contactinfo: contactInfo,
      source: "MakeChurchEasy verified signup",
    });
    const subscribeResponse = await fetch("https://campaigns.zoho.com/api/v1.1/json/listsubscribe", {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${tokenPayload.access_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: subscribeBody,
      signal: AbortSignal.timeout(10_000),
    });
    const subscribePayload = (await subscribeResponse.json().catch(() => ({}))) as ZohoSubscribeResponse;

    if (
      !subscribeResponse.ok ||
      String(subscribePayload.code) !== "0" ||
      subscribePayload.status !== "success"
    ) {
      const errorCode = safeErrorCode(subscribePayload.code, `http_${subscribeResponse.status}`);
      console.error("[Zoho Campaigns] Contact enrollment failed:", {
        httpStatus: subscribeResponse.status,
        errorCode,
      });
      return {
        status: "failed",
        stage: "subscribe",
        errorCode,
        httpStatus: subscribeResponse.status,
      };
    }

    if (/confirmation email is sent/i.test(subscribePayload.message || "")) {
      console.error("[Zoho Campaigns] Signup list requested a second confirmation.");
      return { status: "confirmation-required" };
    }

    return { status: "sent" };
  } catch (error) {
    const errorCode = getNetworkErrorCode(error);
    console.error("[Zoho Campaigns] Signup request failed:", { errorCode });
    return { status: "failed", stage: "network", errorCode };
  }
}
