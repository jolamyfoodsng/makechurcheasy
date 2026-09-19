/**
 * jwt.ts — JWT session management using jose
 *
 * Signs and verifies session tokens stored in httpOnly cookies.
 * Replaces Firebase Auth token verification.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const ALGORITHM = "HS256";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload extends JWTPayload {
  sub: string;        // MongoDB user ID
  tokenVersion: number;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is required");
  return new TextEncoder().encode(secret);
}

/**
 * Sign a session JWT for the given user.
 */
export async function signSessionToken(
  userId: string,
  tokenVersion: number
): Promise<string> {
  return new SignJWT({ sub: userId, tokenVersion })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

/**
 * Verify a session JWT and return its payload.
 * Returns null if the token is invalid or expired.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALGORITHM],
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export { SESSION_MAX_AGE };
