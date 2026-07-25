"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  read: boolean;
  createdAt: string;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function badgeClass(type: string, read: boolean) {
  if (read) return "bg-slate-100 text-slate-500";
  if (type.includes("suspend") || type.includes("error")) return "bg-red-100 text-red-700";
  if (type.includes("warning") || type.includes("cancel")) return "bg-amber-100 text-amber-700";
  if (type.includes("success") || type.includes("granted") || type.includes("activated")) return "bg-emerald-100 text-emerald-700";
  return "bg-indigo-100 text-indigo-700";
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch (error) {
      console.error("[NotificationsPage] Failed to load notifications:", error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const unreadItems = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  async function markAllRead() {
    setMarking(true);
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to mark notifications as read");
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("[NotificationsPage] Failed to mark notifications as read:", error);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500 mt-1">
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"} across your account activity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={marking || unreadItems === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <CheckCheck className="w-4 h-4" />
          Mark all as read
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-sm text-slate-500">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
              <Bell className="w-6 h-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">No notifications yet</h2>
            <p className="mt-2 text-sm text-slate-500">Important account changes and admin actions will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`px-5 py-4 ${notification.read ? "bg-white" : "bg-indigo-50/40"}`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-sm font-semibold text-slate-900">{notification.title}</h2>
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${badgeClass(notification.type, notification.read)}`}>
                        {notification.read ? "Read" : "Unread"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{notification.message}</p>
                    {notification.actionUrl && (
                      <Link
                        href={notification.actionUrl}
                        className="inline-flex mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Open related page
                      </Link>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(notification.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
