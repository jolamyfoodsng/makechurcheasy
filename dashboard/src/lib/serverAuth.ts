import "server-only";

import { cookies } from "next/headers";
import type { MongoUser } from "@/lib/authTypes";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3004";
const SESSION_COOKIE_NAME = "session-token";

export async function getInitialMongoUser(): Promise<MongoUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return null;
  }

  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/status`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data?.authenticated && data.user) {
      return data.user as MongoUser;
    }
  } catch (error) {
    console.error("[serverAuth] Failed to preload auth status:", error);
  }

  return null;
}
