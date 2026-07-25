"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut, Monitor, Pencil, Search, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";

interface AdminDevice {
  id: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  appPlatform: string;
  status: string;
  lastSeen: string | null;
  firstSeen: string | null;
  createdAt: string | null;
  forceDisconnectAt: string | null;
  installationId: string;
  fingerprintHash: string;
  trialUsed: boolean;
  trialUsedAt: string | null;
  trialDecisionReason: string;
  trialWhitelist: boolean;
  trialAttempts: number;
  blockedAttempts: number;
  userId: string;
  userName: string;
  email: string;
  churchName: string;
  country: string;
  plan: string;
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-800 ${className ?? ""}`} />;
}

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/devices", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => setDevices(data.devices || []))
      .catch(() => setActionMessage({ type: "error", text: "Failed to load devices" }))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((device) =>
      [
        device.deviceName,
        device.deviceId,
        device.userName,
        device.email,
        device.churchName,
        device.country,
        device.plan,
        device.appVersion,
        device.appPlatform,
        device.fingerprintHash,
        device.installationId,
        device.trialDecisionReason,
      ].some((value) => String(value || "").toLowerCase().includes(q)),
    );
  }, [devices, search]);

  function flash(type: "success" | "error", text: string) {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 3500);
  }

  async function runDeviceAction(device: AdminDevice, action: "rename" | "force_disconnect" | "delete" | "trial_whitelist") {
    let deviceName = "";
    if (action === "rename") {
      deviceName = window.prompt("Device name", device.deviceName)?.trim() || "";
      if (!deviceName) return;
    } else if (action === "trial_whitelist") {
      const label = device.trialWhitelist ? "Remove trial whitelist" : "Whitelist device for trial override";
      if (!window.confirm(`${label}: ${device.deviceName || device.deviceId || device.id}?`)) return;
    } else {
      const label = action === "delete" ? "Remove device" : "Force disconnect";
      if (!window.confirm(`${label}: ${device.deviceName || device.deviceId}?`)) return;
    }

    setRunning(`${device.deviceId || device.id}:${action}`);
    try {
      const deviceKey = device.deviceId || device.id;
      const url = `/api/admin/users/${device.userId}/devices/${encodeURIComponent(deviceKey)}`;
      const res = await fetch(url, {
        method: action === "delete" ? "DELETE" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: action === "delete"
          ? undefined
          : JSON.stringify({
            action,
            deviceName,
            enabled: action === "trial_whitelist" ? !device.trialWhitelist : undefined,
          }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Device action failed");

      setDevices((prev) => {
        const targetKey = device.deviceId || device.id;
        if (action === "delete") return prev.filter((d) => (d.deviceId || d.id) !== targetKey);
        return prev.map((d) => {
          if ((d.deviceId || d.id) !== targetKey) return d;
          if (action === "rename") return { ...d, deviceName };
          if (action === "trial_whitelist") return { ...d, trialWhitelist: !d.trialWhitelist };
          return { ...d, forceDisconnectAt: data.forceDisconnectAt || new Date().toISOString() };
        });
      });
      flash("success", "Device updated");
    } catch (err: any) {
      flash("error", err?.message || "Device action failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Devices</h1>
        <p className="text-sm text-slate-400 mt-1">
          Active desktop, mobile, receiver, and companion devices across users.
        </p>
      </div>

      {actionMessage && (
        <div className={`px-4 py-2.5 rounded-xl text-sm ${actionMessage.type === "success" ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50" : "bg-red-900/40 text-red-300 border border-red-700/50"}`}>
          {actionMessage.text}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search device, user, church, country, plan, version"
          className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
        />
      </div>

      <div className="rounded-2xl bg-gray-900 border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Monitor className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No devices found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider">Device</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden lg:table-cell">Trial</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden xl:table-cell">Fingerprint</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden lg:table-cell">Church</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden lg:table-cell">Version</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider hidden xl:table-cell">Last Seen</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-slate-400 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((device) => (
                  <tr key={`${device.userId}:${device.deviceId || device.id}`} className="border-b border-slate-700/50 last:border-0 hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-100">{device.deviceName}</p>
                      <p className="text-xs text-slate-500">{device.deviceId || device.id}</p>
                      {device.forceDisconnectAt && (
                        <p className="text-[11px] text-amber-300 mt-1">Disconnect requested</p>
                      )}
                      {device.trialWhitelist && (
                        <p className="text-[11px] text-emerald-300 mt-1">Trial override whitelisted</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/users/${device.userId}`} className="font-medium text-indigo-300 hover:text-indigo-200">
                        {device.userName || "Unknown"}
                      </Link>
                      <p className="text-xs text-slate-500">{device.email}</p>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] border ${device.trialUsed ? "bg-amber-900/40 text-amber-300 border-amber-700/50" : "bg-gray-800 text-slate-400 border-slate-700"}`}>
                        {device.trialUsed ? "Used" : "Not used"}
                      </span>
                      <p className="text-xs text-slate-500 mt-1">
                        {device.blockedAttempts} blocked / {device.trialAttempts} events
                      </p>
                      {device.trialUsedAt && (
                        <p className="text-[11px] text-slate-600 mt-0.5">{new Date(device.trialUsedAt).toLocaleDateString()}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 hidden xl:table-cell">
                      <p className="font-mono text-xs text-slate-400 max-w-[180px] truncate" title={device.fingerprintHash}>
                        {device.fingerprintHash || "-"}
                      </p>
                      <p className="font-mono text-[11px] text-slate-600 max-w-[180px] truncate" title={device.installationId}>
                        {device.installationId || "-"}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <p className="text-slate-300">{device.churchName || "-"}</p>
                      <p className="text-xs text-slate-500">{device.country || "-"}</p>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <p className="text-slate-300">{device.appVersion || "-"}</p>
                      <p className="text-xs text-slate-500">{device.appPlatform || "-"}</p>
                    </td>
                    <td className="px-5 py-3.5 hidden xl:table-cell text-slate-400">
                      {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : "-"}
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        First: {device.firstSeen ? new Date(device.firstSeen).toLocaleDateString() : "-"}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => runDeviceAction(device, "rename")}
                          disabled={running === `${device.deviceId || device.id}:rename`}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                          title="Rename device"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => runDeviceAction(device, "trial_whitelist")}
                          disabled={running === `${device.deviceId || device.id}:trial_whitelist`}
                          className={`p-1.5 rounded-xl transition-colors ${device.trialWhitelist ? "text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10" : "text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"} disabled:opacity-40 disabled:cursor-not-allowed`}
                          title={device.trialWhitelist ? "Remove trial whitelist" : "Whitelist trial override"}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => runDeviceAction(device, "force_disconnect")}
                          disabled={running === `${device.deviceId || device.id}:force_disconnect`}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          title="Force disconnect"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => runDeviceAction(device, "delete")}
                          disabled={running === `${device.deviceId || device.id}:delete`}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remove device"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
