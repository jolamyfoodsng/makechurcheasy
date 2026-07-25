"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  CreditCard,
  Crown,
  UserX,
  Trash2,
  Settings,
  Clock,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface AuditLog {
  id: string;
  adminId: string;
  adminName?: string;
  action: string;
  targetUserId: string;
  targetUserName?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

const ACTION_LABELS: Record<string, string> = {
  plan_change: "Plan Change",
  admin_subscription_start: "Admin Subscription Start",
  admin_subscription_renew: "Admin Subscription Renew",
  temporary_plan_grant: "Temporary Plan Grant",
  temporary_plan_revoke: "Temporary Plan Revoke",
  temporary_plan_expired: "Temporary Plan Expired",
  credit_grant: "Credit Grant",
  ambassador_grant: "Ambassador Grant",
  ambassador_revoke: "Ambassador Revoke",
  ambassador_expired: "Ambassador Expired",
  account_suspend: "Account Suspend",
  account_unsuspend: "Account Unsuspend",
  account_delete: "Account Delete",
  role_change: "Role Change",
  trial_action: "Trial Action",
  device_remove: "Device Remove",
  device_rename: "Device Rename",
  force_logout: "Force Logout",
  credits_reset: "Credits Reset",
  settings_update: "Settings Update",
};

const ACTION_COLORS: Record<string, string> = {
  plan_change:
    "bg-violet-900/50 text-violet-300 border border-violet-700/50",
  admin_subscription_start:
    "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
  admin_subscription_renew:
    "bg-sky-900/50 text-sky-300 border border-sky-700/50",
  temporary_plan_grant:
    "bg-indigo-900/50 text-indigo-300 border border-indigo-700/50",
  temporary_plan_revoke:
    "bg-red-900/50 text-red-300 border border-red-700/50",
  temporary_plan_expired:
    "bg-gray-800 text-slate-400 border border-slate-700",
  credit_grant:
    "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
  ambassador_grant:
    "bg-amber-900/50 text-amber-300 border border-amber-700/50",
  ambassador_revoke: "bg-red-900/50 text-red-300 border border-red-700/50",
  ambassador_expired: "bg-gray-800 text-slate-400 border border-slate-700",
  account_suspend: "bg-red-900/50 text-red-300 border border-red-700/50",
  account_unsuspend:
    "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
  account_delete: "bg-red-900/50 text-red-300 border border-red-700/50",
  role_change: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
  trial_action:
    "bg-amber-900/50 text-amber-300 border border-amber-700/50",
  device_remove: "bg-red-900/50 text-red-300 border border-red-700/50",
  device_rename: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
  force_logout: "bg-orange-900/50 text-orange-300 border border-orange-700/50",
  credits_reset: "bg-orange-900/50 text-orange-300 border border-orange-700/50",
  settings_update: "bg-indigo-900/50 text-indigo-300 border border-indigo-700/50",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  plan_change: <Settings className="w-3.5 h-3.5" />,
  admin_subscription_start: <CreditCard className="w-3.5 h-3.5" />,
  admin_subscription_renew: <CreditCard className="w-3.5 h-3.5" />,
  temporary_plan_grant: <Clock className="w-3.5 h-3.5" />,
  temporary_plan_revoke: <Clock className="w-3.5 h-3.5" />,
  temporary_plan_expired: <Clock className="w-3.5 h-3.5" />,
  credit_grant: <CreditCard className="w-3.5 h-3.5" />,
  ambassador_grant: <Crown className="w-3.5 h-3.5" />,
  ambassador_revoke: <Crown className="w-3.5 h-3.5" />,
  ambassador_expired: <Clock className="w-3.5 h-3.5" />,
  account_suspend: <UserX className="w-3.5 h-3.5" />,
  account_unsuspend: <Shield className="w-3.5 h-3.5" />,
  account_delete: <Trash2 className="w-3.5 h-3.5" />,
  role_change: <Shield className="w-3.5 h-3.5" />,
  trial_action: <Clock className="w-3.5 h-3.5" />,
  device_remove: <Trash2 className="w-3.5 h-3.5" />,
  device_rename: <Settings className="w-3.5 h-3.5" />,
  force_logout: <UserX className="w-3.5 h-3.5" />,
  credits_reset: <CreditCard className="w-3.5 h-3.5" />,
  settings_update: <Settings className="w-3.5 h-3.5" />,
};

const ALL_ACTIONS = ["all", ...Object.keys(ACTION_LABELS)];

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-gray-800 ${className ?? ""}`}
    />
  );
}

export default function AdminAuditLogsPage() {
  const t = useTranslations();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const [totalPages, setTotalPages] = useState(1);
  const perPage = 25;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(perPage),
    });
    if (actionFilter !== "all") params.set("action", actionFilter);

    fetch(`/api/admin/audit-logs?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [page, actionFilter]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  const ACTION_LABEL_MAP: Record<string, string> = {
    plan_change: String(t("admin.auditLogs.actionLabels.planChange")),
    admin_subscription_start: String(t("admin.auditLogs.actionLabels.adminSubscriptionStart")),
    admin_subscription_renew: String(t("admin.auditLogs.actionLabels.adminSubscriptionRenew")),
    temporary_plan_grant: String(t("admin.auditLogs.actionLabels.temporaryPlanGrant")),
    temporary_plan_revoke: String(t("admin.auditLogs.actionLabels.temporaryPlanRevoke")),
    temporary_plan_expired: String(t("admin.auditLogs.actionLabels.temporaryPlanExpired")),
    credit_grant: String(t("admin.auditLogs.actionLabels.creditGrant")),
    ambassador_grant: String(t("admin.auditLogs.actionLabels.ambassadorGrant")),
    ambassador_revoke: String(
      t("admin.auditLogs.actionLabels.ambassadorRevoke")
    ),
    ambassador_expired: String(
      t("admin.auditLogs.actionLabels.ambassadorExpired")
    ),
    account_suspend: String(
      t("admin.auditLogs.actionLabels.accountSuspend")
    ),
    account_unsuspend: "Account Unsuspend",
    account_delete: String(t("admin.auditLogs.actionLabels.accountDelete")),
    role_change: String(t("admin.auditLogs.actionLabels.roleChange")),
    trial_action: String(t("admin.auditLogs.actionLabels.trialAction")),
    device_remove: "Device Remove",
    device_rename: "Device Rename",
    force_logout: "Force Logout",
    credits_reset: "Credits Reset",
    settings_update: "Settings Update",
  };

  function getActionLabel(action: string): string {
    return ACTION_LABEL_MAP[action] || action;
  }

  function detailSummary(log: AuditLog): string {
    const d = log.details || {};
    switch (log.action) {
      case "plan_change":
        return `${d.previousPlan} → ${d.newPlan}`;
      case "admin_subscription_start":
        return `${d.previousPlan} → ${d.newPlan}, ${d.billingCycle}, expires ${d.expiresAt ? new Date(String(d.expiresAt)).toLocaleDateString() : "?"
          }`;
      case "admin_subscription_renew":
        return `${d.newPlan} renewed, ${d.billingCycle}, expires ${d.expiresAt ? new Date(String(d.expiresAt)).toLocaleDateString() : "?"
          }`;
      case "temporary_plan_grant":
        return `${d.previousPlan} → ${d.newPlan}, returns to ${d.returnPlan}, expires ${d.expiresAt ? new Date(String(d.expiresAt)).toLocaleDateString() : "?"
          }`;
      case "temporary_plan_revoke":
        return `${d.temporaryPlan} ended, restored to ${d.restoredPlan}`;
      case "temporary_plan_expired":
        return `${d.temporaryPlan} expired, restored to ${d.restoredPlan}`;
      case "credit_grant":
        return `+${d.amount} credits (balance: ${d.newCredits})`;
      case "ambassador_grant":
        return `${d.durationMonths}mo, ${d.credits} credits, expires ${d.expiresAt ? new Date(String(d.expiresAt)).toLocaleDateString() : "?"
          }`;
      case "ambassador_revoke":
        return `Reverted to ${d.revertedPlan}`;
      case "ambassador_expired":
        return `Auto-expired, reverted to ${d.previousPlan}`;
      case "role_change":
        return `${d.previousRole} → ${d.newRole}`;
      case "trial_action":
        return `${d.action || "unknown"}${d.duration ? ` (${d.duration}d)` : ""
          }`;
      case "settings_update":
        return `Section: ${d.section || "unknown"}`;
      case "device_remove":
      case "device_rename":
      case "force_logout":
        return `${d.deviceName || d.deviceId || d.scope || "account"}`;
      case "credits_reset":
        return `${d.previousCredits} -> ${d.newCredits}`;
      default:
        return Object.entries(d)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-50">
          {t("admin.auditLogs.title")}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {t("admin.auditLogs.description")}
        </p>
      </div>

      {/* Action Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {ALL_ACTIONS.map((a) => (
          <button
            key={a}
            onClick={() => setActionFilter(a)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors ${actionFilter === a
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
          >
            {a === "all" ? t("admin.auditLogs.all") : getActionLabel(a)}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl bg-gray-900 border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <Clock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {t("admin.auditLogs.noLogsFound")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                    {t("admin.auditLogs.columns.action")}
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden md:table-cell">
                    {t("admin.auditLogs.columns.admin")}
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden md:table-cell">
                    {t("admin.auditLogs.columns.targetUser")}
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden lg:table-cell">
                    {t("admin.auditLogs.columns.details")}
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                    {t("admin.auditLogs.columns.time")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-slate-700/50 last:border-0 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${ACTION_COLORS[log.action] ||
                          "bg-gray-800 text-slate-400"
                          }`}
                      >
                        {ACTION_ICONS[log.action] || null}
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className="text-slate-300">
                        {log.adminName ||
                          (log.adminId === "system"
                            ? t("admin.auditLogs.system")
                            : log.adminId.slice(0, 8))}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className="text-slate-300">
                        {log.targetUserName ||
                          log.targetUserId?.slice(0, 8) ||
                          "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className="text-xs text-slate-400 max-w-xs truncate block">
                        {detailSummary(log)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-700">
            <p className="text-xs text-slate-500">
              {t("admin.auditLogs.pagination", {
                page,
                totalPages,
                total,
              })}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
