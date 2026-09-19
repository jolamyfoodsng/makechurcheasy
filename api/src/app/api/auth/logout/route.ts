import { NextResponse } from "next/server";
import { clearAuthCookie, getAuthUser } from "@/lib/auth";

export async function POST() {
  // Clear the session cookie
  const response = clearAuthCookie();
  // Replace the default NextResponse.next() with a proper JSON response
  const json = NextResponse.json({ success: true });
  json.cookies.set("session-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return json;
}
