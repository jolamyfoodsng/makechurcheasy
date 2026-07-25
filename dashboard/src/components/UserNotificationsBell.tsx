"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface UserNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(value: string) {
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function UserNotificationsBell({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=8", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch (error) {
      console.error("[UserNotificationsBell] Failed to fetch notifications:", error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadLabel = useMemo(() => {
    if (unreadCount <= 0) return null;
    return unreadCount > 9 ? "9+" : String(unreadCount);
  }, [unreadCount]);

  async function markAllRead() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
        setUnreadCount(0);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleNotificationClick(notification: UserNotification) {
    if (!notification.read) {
      await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: [notification.id] }),
      }).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refresh();
        }}
        className={`relative p-2 rounded-lg transition-colors ${isAdmin ? "text-slate-400 hover:bg-gray-800" : "text-slate-500 hover:bg-slate-100"}`}
        aria-label="Open notifications"
      >
        <Bell className="w-[20px] h-[20px]" />
        {unreadLabel && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-red-500 text-white ${isAdmin ? "border-2 border-slate-900" : "border-2 border-white"}`}>
            {unreadLabel}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border overflow-hidden z-50 ${isAdmin ? "bg-gray-900 border-slate-700" : "bg-white border-slate-200"}`}>
          <div className={`px-4 py-3 border-b flex items-center justify-between ${isAdmin ? "border-slate-700" : "border-slate-100"}`}>
            <div>
              <p className={`text-sm font-semibold ${isAdmin ? "text-slate-50" : "text-slate-900"}`}>Notifications</p>
              <p className={`text-xs ${isAdmin ? "text-slate-400" : "text-slate-500"}`}>{unreadCount} unread</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={loading || unreadCount === 0}
                className={`text-xs font-medium transition-colors disabled:opacity-40 ${isAdmin ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}
              >
                Mark all read
              </button>
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className={`text-xs font-medium ${isAdmin ? "text-indigo-300 hover:text-indigo-200" : "text-indigo-600 hover:text-indigo-700"}`}
              >
                View all
              </Link>
            </div>
          </div>

          <div className={`max-h-[420px] overflow-y-auto ${isAdmin ? "divide-y divide-slate-800" : "divide-y divide-slate-100"}`}>
            {notifications.length === 0 ? (
              <div className={`px-4 py-8 text-sm text-center ${isAdmin ? "text-slate-400" : "text-slate-500"}`}>
                No new notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleNotificationClick(notification)}
                  className={`w-full text-left px-4 py-3 transition-colors ${isAdmin ? "hover:bg-slate-800/80" : "hover:bg-slate-50"} ${notification.read ? "" : isAdmin ? "bg-indigo-500/5" : "bg-indigo-50/50"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${notification.read ? isAdmin ? "bg-slate-600" : "bg-slate-300" : "bg-indigo-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-sm font-medium ${isAdmin ? "text-slate-100" : "text-slate-900"}`}>{notification.title}</p>
                        <span className={`text-[11px] shrink-0 ${isAdmin ? "text-slate-500" : "text-slate-400"}`}>{timeAgo(notification.createdAt)}</span>
                      </div>
                      <p className={`text-xs mt-1 leading-5 ${isAdmin ? "text-slate-400" : "text-slate-500"}`}>{notification.message}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
