import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import clientPromise from "@/lib/mongodb";
import { verifySessionToken } from "@/lib/jwt";

export const PASSKEY_COOKIE = "session-token";
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function getPasskeyRp(req: Request) {
  const requestOrigin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheazy.com";
  const origin = new URL(requestOrigin).origin;
  const hostname = new URL(origin).hostname;
  const rpID = process.env.PASSKEY_RP_ID || (hostname === "localhost" || hostname === "127.0.0.1" ? hostname : hostname.split(".").slice(-2).join("."));
  const configuredOrigins = (process.env.PASSKEY_ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheazy.com")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (process.env.NODE_ENV !== "production" && (hostname === "localhost" || hostname === "127.0.0.1")) configuredOrigins.push(origin);
  const allowedOrigins = [...new Set(configuredOrigins.map((value) => new URL(value).origin))];
  if (!allowedOrigins.includes(origin)) throw new Error("This site is not configured for passkeys.");
  return { origin, rpID, allowedOrigins };
}

export async function getPasskeyUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PASSKEY_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload?.sub) return null;
  const client = await clientPromise;
  const { ObjectId } = await import("mongodb");
  const user = await client.db().collection("users").findOne({ _id: new ObjectId(payload.sub) });
  if (!user || user.isActive === false || (user.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion)) return null;
  return user;
}

export async function saveChallenge(challenge: string, purpose: string, userId?: string) {
  const client = await clientPromise;
  const collection = client.db().collection("passkeyChallenges");
  const now = new Date();
  await collection.deleteMany({ expiresAt: { $lte: now } });
  await collection.insertOne({ challenge, purpose, userId: userId || null, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS) });
}

export async function consumeChallenge(challenge: string, purpose: string, userId?: string) {
  const client = await clientPromise;
  const query: Record<string, unknown> = { challenge, purpose, expiresAt: { $gt: new Date() } };
  if (userId) query.userId = userId;
  const record = await client.db().collection("passkeyChallenges").findOneAndDelete(query);
  return Boolean(record);
}

export function passkeyIdFromResponse(response: { id?: unknown }) {
  return typeof response?.id === "string" ? response.id : "";
}

export async function signPasskeySecondFactorTicket(userId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required");
  const ticketId = randomUUID();
  await saveChallenge(ticketId, "passkey-2fa", userId);
  return new SignJWT({ sub: userId, purpose: "passkey-2fa" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").setJti(ticketId).sign(new TextEncoder().encode(secret));
}

export async function verifyPasskeySecondFactorTicket(ticket: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(ticket, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    if (payload.purpose !== "passkey-2fa" || typeof payload.sub !== "string" || typeof payload.jti !== "string") return null;
    return await consumeChallenge(payload.jti, "passkey-2fa", payload.sub) ? payload.sub : null;
  } catch { return null; }
}
