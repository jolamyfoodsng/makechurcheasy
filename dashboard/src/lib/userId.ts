/**
 * Simple user ID store for the dashboard.
 *
 * In production this would come from NextAuth session.
 * For now, uses localStorage with a fallback.
 */

const USER_ID_KEY = "userId";

export function getUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}

export function setUserId(userId: string): void {
  localStorage.setItem(USER_ID_KEY, userId);
}

export function clearUserId(): void {
  localStorage.removeItem(USER_ID_KEY);
}
