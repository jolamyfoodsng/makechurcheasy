import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { signSessionToken } from "@/lib/jwt";
import { getPlanConfig } from "@/lib/db";
import { claimTrialForUserIfEligible } from "@/lib/trialAbuse";
import { getPlatformSettings } from "@/lib/platformSettings";
import { sendEmail, welcomeEmail } from "@/lib/emailTemplates";
import { nanoid } from "nanoid";
import { isKnownCountryCode, normalizeCountryCode } from "@/lib/countryNormalization";
import { detectRequestCountry, resolveSignupLanguage } from "@/lib/signupDefaults";
import { notifyTelegramNewSignup } from "@/lib/telegramNotifications";

function appOrigin(appUrl: string): string {
  try {
    return new URL(appUrl).origin;
  } catch {
    return "https://makechurcheazy.com";
  }
}

function isAllowedOrigin(origin: string, appUrl: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.origin === appOrigin(appUrl)) return true;
    return process.env.NODE_ENV !== "production" && parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function sanitizeReturnUrl(value: string | null | undefined, origin: string): string {
  if (!value) return origin;
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return origin;
    return parsed.toString();
  } catch {
    return origin;
  }
}

/**
 * GET /api/auth/google/callback
 *
 * Handles the OAuth callback from Google. Exchanges the authorization code
 * for tokens, fetches user info, and creates/finds the MongoDB user.
 * Sets a JWT session cookie and redirects to the dashboard.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheazy.com";

  // Decode state: { o: clientOrigin, r: returnUrl } — or fall back to legacy plain string
  let clientOrigin = appUrl;
  let returnUrl = appUrl;
  if (state) {
    try {
      const parsed = JSON.parse(state);
      const parsedOrigin = typeof parsed.o === "string" ? parsed.o : appOrigin(appUrl);
      clientOrigin = isAllowedOrigin(parsedOrigin, appUrl)
        ? new URL(parsedOrigin).origin
        : appOrigin(appUrl);
      returnUrl = sanitizeReturnUrl(typeof parsed.r === "string" ? parsed.r : null, clientOrigin);
    } catch {
      // Legacy plain-string state (just the return URL)
      const decoded = decodeURIComponent(state);
      try {
        const decodedOrigin = new URL(decoded).origin;
        clientOrigin = isAllowedOrigin(decodedOrigin, appUrl)
          ? decodedOrigin
          : appOrigin(appUrl);
      } catch { /* keep default */ }
      returnUrl = sanitizeReturnUrl(decoded, clientOrigin);
    }
  }

  if (error) {
    return NextResponse.redirect(`${clientOrigin}/login?error=google_cancelled`);
  }

  if (!code) {
    return NextResponse.redirect(`${clientOrigin}/login?error=no_code`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${clientOrigin}/login?error=google_not_configured`);
  }

  const redirectUri = `${clientOrigin}/api/auth/google/callback`;

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      [key: string]: unknown;
    };

    if (!tokenData.access_token) {
      console.error("[google/callback] Token exchange failed:", tokenData);
      return NextResponse.redirect(`${clientOrigin}/login?error=token_exchange_failed`);
    }

    // Fetch user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleUser = (await userInfoRes.json()) as {
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!googleUser.email) {
      return NextResponse.redirect(`${clientOrigin}/login?error=no_email`);
    }

    const client = await clientPromise;
    const db = client.db();
    const normalizedEmail = googleUser.email.trim().toLowerCase();
    const detectedCountry = detectRequestCountry(req.headers);
    const normalizedCountry = detectedCountry && await isKnownCountryCode(detectedCountry)
      ? await normalizeCountryCode(detectedCountry)
      : "";
    const signupLanguage = resolveSignupLanguage(req.headers, normalizedCountry || "US");

    // Find or create user
    let user = await db.collection("users").findOne(
      { email: normalizedEmail },
      { collation: { locale: "en", strength: 2 } }
    );

    const now = new Date().toISOString();

    if (user) {
      if (user.isActive === false) {
        return NextResponse.redirect(`${clientOrigin}/login?error=account_unavailable`);
      }

      // Existing user — update avatar and mark email as verified
      const updateFields: Record<string, any> = {
        lastLogin: now,
        emailVerified: true,
      };
      if (!user.emailVerifiedAt) {
        updateFields.emailVerifiedAt = now;
      }
      if (googleUser.picture && !user.avatar) {
        updateFields.avatar = googleUser.picture;
      }
      if (googleUser.name && !user.name) {
        updateFields.name = googleUser.name;
      }
      if (!user.country && normalizedCountry) {
        updateFields.country = normalizedCountry;
      }
      if (!user.language) {
        updateFields.language = signupLanguage;
      }
      // If user has no provider set, or was firebase, update to google
      if (!user.provider || user.provider === "firebase") {
        updateFields.provider = "google";
      }

      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: updateFields }
      );
      user = { ...user, ...updateFields };
    } else {
      const platformSettings = await getPlatformSettings();
      if (!platformSettings.system.allowRegistrations) {
        return NextResponse.redirect(`${clientOrigin}/login?error=registrations_disabled`);
      }

      // New user — create account
      const planConfig = await getPlanConfig();

      const newUser: Record<string, any> = {
        name: googleUser.name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        avatar: googleUser.picture || "",
        provider: "google",
        emailVerified: true,
        emailVerifiedAt: now,
        appId: `VC-${nanoid(6).toUpperCase()}`,
        churchName: "",
        country: normalizedCountry,
        language: signupLanguage,
        phone: "",
        role: "user",
        tokenVersion: 0,
        credits: planConfig.plans.free.credits,
        plan: "free",
        trialId: null as string | null,
        onboardingCompleted: true,
        lifecycleEmails: {},
        createdAt: now,
        lastLogin: now,
      };

      const result = await db.collection("users").insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };

      await notifyTelegramNewSignup({
        name: newUser.name,
        country: normalizedCountry,
        createdAt: now,
        source: "Google signup",
      });

      // Create trial only if the claim is eligible.
      try {
        const trialClaim = await claimTrialForUserIfEligible({
          userId: result.insertedId.toString(),
          email: normalizedEmail,
          req,
          source: "google_callback",
        });
        const record = trialClaim.trialRecord;
        if (record) {
          const welcomeData = {
            endsAt: record.endsAt,
            durationDays: record.durationDays,
          };
          await db.collection("users").updateOne(
            { _id: result.insertedId },
            {
              $set: {
                credits: planConfig.plans.trial.credits,
                trialId: record._id?.toString(),
                "lifecycleEmails.welcomeSent": true,
              },
            }
          );
          user.credits = planConfig.plans.trial.credits;
          user.trialId = record._id?.toString() || null;
          if (platformSettings.notifications.welcomeEmail) {
            sendEmail(
              welcomeEmail({
                userName: user.name || "there",
                userEmail: user.email,
                trialDays: welcomeData.durationDays,
                trialEndsAt: welcomeData.endsAt,
              })
            ).catch((err) => console.error("[google/callback] Failed to send welcome email:", err));
          }
        } else if (!trialClaim.eligible) {
          console.warn("[google/callback] Trial not granted:", {
            userId: result.insertedId.toString(),
            reason: trialClaim.reason,
            matchedSignalTypes: trialClaim.matchedSignalTypes,
          });
        }
      } catch (err) {
        console.error("[google/callback] Failed to create trial:", err);
      }
    }

    // Sign JWT
    const tokenVersion = user.tokenVersion ?? 0;
    const jwt = await signSessionToken(user._id.toString(), tokenVersion);

    const response = NextResponse.redirect(returnUrl);
    response.cookies.set("session-token", jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err) {
    console.error("[google/callback] Error:", err);
    return NextResponse.redirect(`${appUrl}/login?error=google_auth_failed`);
  }
}
