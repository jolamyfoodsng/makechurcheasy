import { useEffect, useState, useCallback, useRef } from "react";
import Icon from "../DockIcon";
import { dockObsClient } from "../dockObsClient";
import { getDockPlan, showUpgradeModal } from "../dockEntitlement";
import {
  PLATFORM_INFO,
  PLATFORM_KEY_GUIDES,
  type BroadcastChannel,
  type BroadcastPersonProfile,
  type BroadcastPlatform,
  type BroadcastStoreState,
  addChannelToProfile,
  addPersonProfile,
  deleteChannel,
  deletePersonProfile,
  getActiveProfile,
  getMultistreamPlanAllocation,
  loadBroadcastStore,
  setActiveProfileId,
  subscribeBroadcastStore,
  syncBroadcastStoreFromNative,
  initBroadcastCrossProcessSync,
  toggleChannelEnabled,
  updateChannel,
  updatePersonProfile,
} from "../../services/broadcastSettingsService";

const handleOpenExternalLink = async (url: string) => {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};
import {
  ensureObsConnected,
  syncChannelToObs,
  syncProfileToObs,
} from "../../services/broadcastObsSyncService";
import {
  getMultistreamUsageInfo,
  recordMultistreamHeartbeat,
  reportMultistreamError,
  reportMultistreamStatus,
  subscribeMultistreamUsage,
  MULTISTREAM_EXHAUSTED_EVENT,
  type MultistreamUsageInfo,
} from "../../services/broadcastUsageService";
import { getMultistreamTarget, isCloudTargetFor } from "../../services/multistreamState";
import { MultistreamStatusPanel } from "../../components/MultistreamStatusPanel";

function PlatformBadgeIcon({ platform, size = 20 }: { platform: BroadcastPlatform; size?: number }) {
  switch (platform) {
    case "youtube":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#EF4444" />
          <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FFFFFF" />
        </svg>
      );
    case "facebook":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#1877F2" />
          <path
            d="M15.5 12.5H13V19H10.5V12.5H9V10.2H10.5V8.8C10.5 7.1 11.5 6 13.5 6C14.3 6 15 6.1 15 6.1V8.2H14.1C13.2 8.2 13 8.7 13 9.4V10.2H15.4L15.5 12.5Z"
            fill="#FFFFFF"
          />
        </svg>
      );
    case "instagram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#E1306C" />
          <rect x="6.5" y="6.5" width="11" height="11" rx="3.5" stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="2.5" stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx="15.2" cy="8.8" r="0.8" fill="#FFFFFF" />
        </svg>
      );
    case "tiktok":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#0F172A" />
          <path
            d="M14.5 7C14.8 8.1 15.6 9 16.7 9.3V11.2C15.8 11.2 15 10.9 14.3 10.4V14.3C14.3 16.3 12.7 18 10.7 18C8.7 18 7 16.3 7 14.3C7 12.3 8.6 10.7 10.6 10.7C10.8 10.7 11.1 10.7 11.3 10.8V12.7C11.1 12.6 10.9 12.5 10.7 12.5C9.7 12.5 8.9 13.3 8.9 14.3C8.9 15.3 9.7 16.1 10.7 16.1C11.7 16.1 12.5 15.3 12.5 14.3V6H14.5V7Z"
            fill="#00F2FE"
          />
        </svg>
      );
    case "kick":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#53FC18" />
          <path
            d="M8 7V17M8 12H11L14.5 7M11 12L15 17"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "twitch":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#9146FF" />
          <path
            d="M7 6H17V13L14 16H11L9.5 17.5V16H7V6Z"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill="none"
          />
          <rect x="10.5" y="9" width="1.5" height="3" fill="#FFFFFF" />
          <rect x="13.5" y="9" width="1.5" height="3" fill="#FFFFFF" />
        </svg>
      );
    case "custom":
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#334155" />
          <path
            d="M12 7C9.2 7 7 9.2 7 12M12 9C10.3 9 9 10.3 9 12M12 11A1 1 0 1 1 11.99 11M12 12V17M15 12C15 10.3 13.7 9 12 9M17 12C17 9.2 14.8 7 12 7"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function getPlatformSubtitle(platform: BroadcastPlatform, serverUrl?: string): string {
  switch (platform) {
    case "youtube":
      if (!serverUrl || serverUrl === "auto") return "YouTube Live • Auto Ingest";
      return `YouTube Live • ${serverUrl}`;
    case "facebook":
      return "Facebook Live";
    case "instagram":
      return "Instagram Live";
    case "tiktok":
      return "TikTok Live";
    case "kick":
      return "Kick Stream";
    case "twitch":
      if (!serverUrl || serverUrl === "auto") return "Twitch • Auto Ingest";
      return `Twitch • ${serverUrl}`;
    case "custom":
      return serverUrl ? `Custom RTMP • ${serverUrl}` : "Custom RTMP Server";
    default:
      return "Live Stream";
  }
}

export default function DockBroadcastTab() {
  const [store, setStore] = useState<BroadcastStoreState>(loadBroadcastStore);
  const [obsConnected, setObsConnected] = useState(dockObsClient.isConnected);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamTimecode, setStreamTimecode] = useState("00:00:00");
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);

  const dockPlan = getDockPlan();
  const allocation = getMultistreamPlanAllocation(dockPlan);
  const [usageInfo, setUsageInfo] = useState<MultistreamUsageInfo>(() =>
    getMultistreamUsageInfo(allocation.hours),
  );

  // Subscribe to multistream usage changes
  useEffect(() => {
    return subscribeMultistreamUsage((info) => {
      setUsageInfo(info);
    }, allocation.hours);
  }, [allocation.hours]);

  // Hours ran out mid-service: tell the operator. The current broadcast is not cut off.
  useEffect(() => {
    const onExhausted = () => {
      setStatusMessage({
        text: "This month's multi-stream hours are used up. This broadcast keeps going; next time OBS will stream to one destination.",
        type: "error",
      });
    };
    window.addEventListener(MULTISTREAM_EXHAUSTED_EVENT, onExhausted);
    return () => window.removeEventListener(MULTISTREAM_EXHAUSTED_EVENT, onExhausted);
  }, []);

  // Modals state
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<BroadcastPersonProfile | null>(null);
  const [personNameInput, setPersonNameInput] = useState("");
  const [personNicknameInput, setPersonNicknameInput] = useState("");
  const [personColorInput, setPersonColorInput] = useState("#F59E0B");

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<{ personId: string; channel: BroadcastChannel | null } | null>(null);
  const [channelPlatformInput, setChannelPlatformInput] = useState<BroadcastPlatform>("youtube");
  const [channelNameInput, setChannelNameInput] = useState("");
  const [channelKeyInput, setChannelKeyInput] = useState("");
  const [channelServerInput, setChannelServerInput] = useState("");
  const [showKeyInModal, setShowKeyInModal] = useState(false);

  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});

  const streamKeyInputRef = useRef<HTMLInputElement>(null);

  // Sync store & instant cross-process updates
  useEffect(() => {
    initBroadcastCrossProcessSync();
    syncBroadcastStoreFromNative().then((latest) => {
      setStore(latest);
    });

    const unsub = subscribeBroadcastStore((next) => {
      setStore(next);
    });

    const handleFocus = () => {
      syncBroadcastStoreFromNative().then((latest) => {
        setStore(latest);
      });
    };

    const handleCustomSync = (e: Event) => {
      const customEvent = e as CustomEvent<BroadcastStoreState>;
      if (customEvent.detail) {
        setStore(customEvent.detail);
      } else {
        setStore(loadBroadcastStore());
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleFocus);
      document.addEventListener("visibilitychange", handleFocus);
      window.addEventListener("mce-broadcast-store-updated", handleCustomSync);
    }

    return () => {
      unsub();
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleFocus);
        document.removeEventListener("visibilitychange", handleFocus);
        window.removeEventListener("mce-broadcast-store-updated", handleCustomSync);
      }
    };
  }, []);

  // Poll OBS stream status periodically & track elapsed multistreaming hours
  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      setObsConnected(dockObsClient.isConnected);
      if (!dockObsClient.isConnected) {
        setIsStreaming(false);
        return;
      }
      try {
        const status = await dockObsClient.getStreamStatus();
        const active = Boolean(status?.outputActive);

        if (mounted) {
          setIsStreaming(active);
          setStreamTimecode(status?.outputTimecode || "00:00:00");

          // Keep dock in sync if settings were updated in the main app
          const curStore = loadBroadcastStore();
          setStore((prev) => {
            if (curStore.updatedAt && curStore.updatedAt !== prev.updatedAt) {
              return curStore;
            }
            // Check if profiles or channel counts changed
            if (JSON.stringify(curStore.profiles) !== JSON.stringify(prev.profiles)) {
              return curStore;
            }
            return prev;
          });

          // Count multi-stream time only while OBS is really going through the cloud engine.
          const target = getMultistreamTarget();
          const cloudLive = active && Boolean(target && isCloudTargetFor(target.profileId, target));
          const liveDestinations = cloudLive && target ? target.destinations.filter((d) => d.ok) : [];
          void reportMultistreamStatus({
            active: cloudLive,
            profileName: target?.profileName || "",
            channels: liveDestinations.map((d) => ({ name: d.name, platform: d.platform })),
          });
          if (cloudLive && allocation.allowed) {
            const updated = recordMultistreamHeartbeat(allocation.hours);
            setUsageInfo(updated);
          }
        }
      } catch {
        if (mounted) setIsStreaming(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [allocation.allowed, allocation.hours]);

  const activeProfile = getActiveProfile(store);

  const showToast = useCallback((text: string, type: "success" | "error" | "info" = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4500);
  }, []);

  // Switch person profile
  const handleSelectPerson = useCallback((profileId: string) => {
    const updated = setActiveProfileId(profileId);
    setStore(updated);
    const profile = updated.profiles.find((p) => p.id === profileId);
    if (profile) {
      showToast(`Switched active profile to ${profile.nickname}`, "info");
    }
  }, [showToast]);

  // Apply a channel's key to OBS (connects first then syncs)
  const handleApplyChannelToObs = useCallback(async (channel: BroadcastChannel, personName: string) => {
    if (!channel.streamKey.trim()) {
      showToast(`Stream key for "${channel.name}" is empty. Please enter your stream key first.`, "error");
      return;
    }
    setIsSyncing(true);
    setSyncingChannelId(channel.id);
    try {
      if (!dockObsClient.isConnected) {
        showToast("Connecting to OBS Studio...", "info");
      }
      const res = await syncChannelToObs(
        channel,
        personName,
        dockObsClient,
        activeProfile?.id,
      );
      if (res.success) {
        setObsConnected(true);
        showToast(res.message, "success");
      } else {
        showToast(res.message, "error");
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || "Unknown error";
      showToast(`Failed to sync with OBS: ${msg}`, "error");
    } finally {
      setIsSyncing(false);
      setSyncingChannelId(null);
    }
  }, [showToast]);

  // Apply the primary enabled channel of the active person to OBS (connects first then syncs)
  const handleApplyActivePersonToObs = useCallback(async () => {
    if (!activeProfile) return;
    setIsSyncing(true);
    try {
      if (!dockObsClient.isConnected) {
        showToast("Connecting to OBS Studio...", "info");
      }
      const res = await syncProfileToObs(activeProfile, dockObsClient, store);
      if (res.success) {
        setObsConnected(true);
        showToast(res.message, res.warning ? "info" : "success");
      } else {
        showToast(res.message, "error");
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || "Unknown error";
      showToast(`Failed to sync profile with OBS: ${msg}`, "error");
    } finally {
      setIsSyncing(false);
    }
  }, [activeProfile, showToast, store]);

  // Toggle Stream in OBS
  const handleToggleStream = useCallback(async () => {
    if (!dockObsClient.isConnected) {
      showToast("Connecting to OBS Studio...", "info");
      const conn = await ensureObsConnected();
      if (!conn.connected) {
        showToast("Could not connect to OBS. Please ensure OBS Studio is open on this computer with WebSocket enabled.", "error");
        return;
      }
      setObsConnected(true);
    }
    try {
      if (isStreaming) {
        await dockObsClient.stopStream();
        setIsStreaming(false);
        showToast("Stopped live stream.", "info");
      } else {
        // Point OBS at this profile's destinations first. If multi-streaming isn't possible
        // (plan, hours, engine), this falls back to the main destination and says so.
        let warning: string | null = null;
        if (activeProfile) {
          const syncRes = await syncProfileToObs(activeProfile, dockObsClient, store);
          if (!syncRes.success) {
            showToast(syncRes.message, "error");
            return;
          }
          if (syncRes.warning) warning = syncRes.message;
        }
        await dockObsClient.startStream();
        setIsStreaming(true);
        showToast(warning ? `Live. ${warning}` : "Live stream started in OBS!", warning ? "info" : "success");
      }
    } catch (err: unknown) {
      console.error("[BroadcastTab] Stream toggle error:", err);
      const channels = activeProfile?.channels.filter((channel) => channel.enabled && channel.streamKey.trim()) || [];
      if (channels.length > 1) {
        void reportMultistreamError({
          stage: "obs_stream",
          code: "OBS_STREAM_TOGGLE_FAILED",
          message: "OBS could not start or stop the multi-stream session.",
          profileName: activeProfile?.nickname || activeProfile?.name || "",
          channels: channels.map((channel) => ({ name: channel.name, platform: channel.platform })),
        });
      }
      showToast("Failed to start/stop stream in OBS. Check OBS settings.", "error");
    }
  }, [activeProfile, isStreaming, showToast, store]);

  // Person Modal handlers
  const openNewPersonModal = () => {
    setEditingPerson(null);
    setPersonNameInput("");
    setPersonNicknameInput("");
    setPersonColorInput("#F59E0B");
    setShowPersonModal(true);
  };

  const openEditPersonModal = (p: BroadcastPersonProfile) => {
    setEditingPerson(p);
    setPersonNameInput(p.name);
    setPersonNicknameInput(p.nickname);
    setPersonColorInput(p.color);
    setShowPersonModal(true);
  };

  const handleSavePerson = () => {
    if (!personNameInput.trim()) {
      showToast("Please enter a person/profile name.", "error");
      return;
    }
    if (editingPerson) {
      updatePersonProfile(editingPerson.id, {
        name: personNameInput.trim(),
        nickname: personNicknameInput.trim() || personNameInput.trim(),
        color: personColorInput,
      });
      showToast(`Updated profile: ${personNicknameInput.trim() || personNameInput.trim()}`, "success");
    } else {
      const added = addPersonProfile(
        personNameInput.trim(),
        personNicknameInput.trim() || personNameInput.trim(),
        personColorInput,
      );
      showToast(`Created profile: ${added.nickname}`, "success");
    }
    setShowPersonModal(false);
  };

  const handleDeletePerson = (p: BroadcastPersonProfile) => {
    if (confirm(`Delete profile "${p.nickname}" and its tied channels?`)) {
      deletePersonProfile(p.id);
      showToast(`Deleted profile: ${p.nickname}`, "info");
    }
  };

  // Channel Modal handlers
  const openNewChannelModal = (personId: string) => {
    setEditingChannel({ personId, channel: null });
    setChannelPlatformInput("youtube");
    setChannelNameInput("");
    setChannelKeyInput("");
    setChannelServerInput(PLATFORM_INFO.youtube.defaultServer);
    setShowKeyInModal(false);
    setShowChannelModal(true);
  };

  const openEditChannelModal = (personId: string, ch: BroadcastChannel, focusKey = false) => {
    setEditingChannel({ personId, channel: ch });
    setChannelPlatformInput(ch.platform);
    setChannelNameInput(ch.name);
    setChannelKeyInput(ch.streamKey);
    const serverVal =
      ch.platform === "youtube" && (!ch.serverUrl || ch.serverUrl === "auto")
        ? "Primary YouTube ingest server"
        : ch.serverUrl;
    setChannelServerInput(serverVal);
    setShowKeyInModal(focusKey);
    setShowChannelModal(true);
    if (focusKey) {
      setTimeout(() => {
        streamKeyInputRef.current?.focus();
      }, 100);
    }
  };

  const handleSaveChannel = () => {
    if (!editingChannel) return;
    if (!channelNameInput.trim()) {
      showToast("Please enter a channel name.", "error");
      return;
    }
    if (editingChannel.channel) {
      updateChannel(editingChannel.personId, editingChannel.channel.id, {
        name: channelNameInput.trim(),
        platform: channelPlatformInput,
        streamKey: channelKeyInput.trim(),
        serverUrl: channelServerInput.trim() || PLATFORM_INFO[channelPlatformInput].defaultServer,
      });
      showToast(`Updated channel: ${channelNameInput.trim()}`, "success");
    } else {
      addChannelToProfile(editingChannel.personId, {
        name: channelNameInput.trim(),
        platform: channelPlatformInput,
        streamKey: channelKeyInput.trim(),
        serverUrl: channelServerInput.trim() || PLATFORM_INFO[channelPlatformInput].defaultServer,
        enabled: true,
      });
      showToast(`Added channel: ${channelNameInput.trim()}`, "success");
    }
    setShowChannelModal(false);
  };

  const handleDeleteChannel = (personId: string, ch: BroadcastChannel) => {
    if (confirm(`Remove "${ch.name}" from this profile?`)) {
      deleteChannel(personId, ch.id);
      showToast(`Removed channel: ${ch.name}`, "info");
    }
  };

  const toggleKeyVisibility = (chId: string) => {
    setVisibleKeyIds((prev) => ({ ...prev, [chId]: !prev[chId] }));
  };

  // Channels status helpers
  const enabledChannels = activeProfile?.channels.filter((c) => c.enabled) || [];
  const readyChannels = enabledChannels.filter((c) => c.streamKey.trim().length > 0);
  const firstChannelWithoutKey = activeProfile?.channels.find((c) => !c.streamKey.trim());
  const canStartStream = obsConnected && readyChannels.length > 0;

  return (
    <div
      className="dock-broadcast-container"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflowY: "auto",
        padding: "12px",
        gap: "14px",
        boxSizing: "border-box",
      }}
    >
      {/* Toast Feedback */}
      {statusMessage && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background:
              statusMessage.type === "success"
                ? "rgba(16, 185, 129, 0.15)"
                : statusMessage.type === "error"
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(99, 102, 241, 0.15)",
            border: `1px solid ${
              statusMessage.type === "success"
                ? "var(--dock-green, #10B981)"
                : statusMessage.type === "error"
                ? "var(--dock-red, #EF4444)"
                : "var(--dock-accent, #6366F1)"
            }`,
            color:
              statusMessage.type === "success"
                ? "#34D399"
                : statusMessage.type === "error"
                ? "#F87171"
                : "#818CF8",
          }}
        >
          <Icon
            name={statusMessage.type === "success" ? "check_circle" : statusMessage.type === "error" ? "error" : "info"}
            size={16}
          />
          <span style={{ flex: 1 }}>{statusMessage.text}</span>
        </div>
      )}

      {/* ═══ STEP 1: PROFILE SELECTOR (VISUAL LEADING TOP) ═══ */}
      <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              Speaker Profiles
            </span>

            {/* Sleek Multistream Badge */}
            {allocation.allowed ? (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: usageInfo.isExhausted
                    ? "rgba(239, 68, 68, 0.15)"
                    : isStreaming && enabledChannels.length > 1
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(99, 102, 241, 0.15)",
                  border: `1px solid ${
                    usageInfo.isExhausted
                      ? "rgba(239, 68, 68, 0.35)"
                      : isStreaming && enabledChannels.length > 1
                      ? "rgba(16, 185, 129, 0.35)"
                      : "rgba(99, 102, 241, 0.3)"
                  }`,
                  color: usageInfo.isExhausted
                    ? "#f87171"
                    : isStreaming && enabledChannels.length > 1
                    ? "#34d399"
                    : "#a5b4fc",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title={`Multistream quota: ${usageInfo.formattedRemaining} left of ${allocation.hours}h monthly limit.`}
              >
                <Icon name="cell_tower" size={12} />
                <span>
                  {usageInfo.isExhausted
                    ? "Quota Exceeded"
                    : isStreaming && enabledChannels.length > 1
                    ? `LIVE • ${usageInfo.formattedRemaining} left`
                    : `${usageInfo.formattedRemaining} left`}
                </span>
              </span>
            ) : (
              <span
                style={{
                  fontSize: "10.5px",
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: "10px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "var(--dock-text-dim, #94a3b8)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  showUpgradeModal(
                    "Simultaneous multi-platform broadcasting sends your stream to YouTube, Facebook, and multiple platforms at once directly from OBS. Upgrade to Growth (20 hrs) or Basic (10 hrs) to unlock."
                  )
                }
                title="Free plan streams to 1 channel at a time. Click to upgrade for 20h multistreaming."
              >
                <Icon name="lock" size={11} />
                <span>1 channel</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={openNewPersonModal}
            disabled={isStreaming}
            title={isStreaming ? "Cannot add profiles while streaming live" : "Add a new speaker profile"}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "transparent",
              color: isStreaming ? "var(--dock-text-dim, #64748b)" : "var(--dock-accent, #6366F1)",
              border: "none",
              borderRadius: "4px",
              cursor: isStreaming ? "not-allowed" : "pointer",
              opacity: isStreaming ? 0.4 : 1,
            }}
          >
            <Icon name="add" size={13} />
            <span>New Profile</span>
          </button>
        </div>

        {/* Clean Profile Pills Bar */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            paddingBottom: "3px",
            scrollbarWidth: "none",
          }}
        >
          {store.profiles.map((p) => {
            const isActive = p.id === store.activeProfileId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => !isStreaming && handleSelectPerson(p.id)}
                disabled={isStreaming}
                title={isStreaming ? "Cannot switch profiles while streaming live" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "18px",
                  fontSize: "13px",
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? "rgba(99, 102, 241, 0.18)" : "var(--dock-surface-alt, #202026)",
                  border: `1px solid ${
                    isActive ? "var(--dock-accent, #6366F1)" : "var(--dock-border, rgba(255,255,255,0.08))"
                  }`,
                  color: isActive ? "#ffffff" : "var(--dock-text-secondary, #d4d4d8)",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  opacity: isStreaming && !isActive ? 0.4 : 1,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: p.color || "#6366F1",
                  }}
                />
                <span>{p.nickname}</span>
              </button>
            );
          })}
        </div>

        {/* Active Profile Context & Quick Edit Row */}
        {activeProfile && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 2px",
              fontSize: "11px",
              color: "var(--dock-text-dim, #64748b)",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeProfile.name}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => !isStreaming && openEditPersonModal(activeProfile)}
                disabled={isStreaming}
                title={isStreaming ? "Cannot edit profile while streaming live" : "Edit Profile Name / Tag Color"}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--dock-text-dim, #64748b)",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  opacity: isStreaming ? 0.4 : 1,
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "2px",
                }}
              >
                <Icon name="edit" size={12} />
                <span>Edit</span>
              </button>
              {store.profiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => !isStreaming && handleDeletePerson(activeProfile)}
                  disabled={isStreaming}
                  title={isStreaming ? "Cannot delete profile while streaming live" : "Delete Profile"}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--dock-red, #ef4444)",
                    cursor: isStreaming ? "not-allowed" : "pointer",
                    opacity: isStreaming ? 0.4 : 1,
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Icon name="delete" size={13} />
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ═══ STEP 2: CHANNELS LIST (VISUAL LEADING MIDDLE) ═══ */}
      {activeProfile && (
        <section style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "var(--dock-text-dim, #94a3b8)",
                  textTransform: "uppercase",
                }}
              >
                Channels
              </span>
              <span style={{ fontSize: "10px", color: "var(--dock-text-dim, #64748b)" }}>
                ({enabledChannels.length} active)
              </span>
            </div>
            <button
              type="button"
              onClick={() => !isStreaming && openNewChannelModal(activeProfile.id)}
              disabled={isStreaming}
              title={isStreaming ? "Cannot add channel while live streaming" : "Add Channel"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 9px",
                fontSize: "11px",
                fontWeight: 600,
                background: "var(--dock-surface-alt, #202026)",
                color: isStreaming ? "var(--dock-text-dim, #64748b)" : "var(--dock-text, #ffffff)",
                border: "1px solid var(--dock-border, rgba(255,255,255,0.1))",
                borderRadius: "6px",
                cursor: isStreaming ? "not-allowed" : "pointer",
                opacity: isStreaming ? 0.4 : 1,
              }}
            >
              <Icon name="add" size={13} />
              <span>Add Channel</span>
            </button>
          </div>

          {activeProfile.channels.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px 16px",
                background: "var(--dock-surface, #18181c)",
                border: "1px dashed var(--dock-border, rgba(255,255,255,0.12))",
                borderRadius: "10px",
                color: "var(--dock-text-dim, #94a3b8)",
                fontSize: "12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Icon name="cell_tower" size={24} style={{ opacity: 0.5 }} />
              <div>No channels configured for {activeProfile.nickname} yet.</div>
              <button
                type="button"
                onClick={() => !isStreaming && openNewChannelModal(activeProfile.id)}
                disabled={isStreaming}
                title={isStreaming ? "Cannot add channel while live streaming" : "+ Add YouTube or Facebook"}
                style={{
                  marginTop: "4px",
                  padding: "6px 14px",
                  background: isStreaming ? "rgba(99, 102, 241, 0.4)" : "var(--dock-accent, #6366F1)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  opacity: isStreaming ? 0.4 : 1,
                }}
              >
                + Add YouTube or Facebook
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {activeProfile.channels.map((ch) => {
                const hasKey = Boolean(ch.streamKey.trim());
                const keyRevealed = Boolean(visibleKeyIds[ch.id]);

                return (
                  <div
                    key={ch.id}
                    style={{
                      background: "var(--dock-surface-alt, #202026)",
                      border: `1px solid ${
                        ch.enabled ? "var(--dock-border, rgba(255,255,255,0.12))" : "rgba(255,255,255,0.04)"
                      }`,
                      borderRadius: "10px",
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      opacity: ch.enabled ? 1 : 0.6,
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    {/* Row 1: Platform Icon, Channel Details, and Toggle Switch */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <div style={{ flexShrink: 0 }}>
                          <PlatformBadgeIcon platform={ch.platform} size={28} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--dock-text, #ffffff)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ch.name}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--dock-text-dim, #94a3b8)",
                              marginTop: "1px",
                            }}
                          >
                            {getPlatformSubtitle(ch.platform, ch.serverUrl)}
                          </div>
                        </div>
                      </div>

                      {/* Right: Toggle Switch */}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ch.enabled}
                          disabled={isStreaming}
                          onClick={() => !isStreaming && toggleChannelEnabled(activeProfile.id, ch.id)}
                          title={
                            isStreaming
                              ? "Cannot change channel state while live streaming"
                              : ch.enabled
                              ? "Channel enabled for live stream"
                              : "Channel disabled"
                          }
                          style={{
                            width: "36px",
                            height: "20px",
                            borderRadius: "10px",
                            background: ch.enabled ? "var(--dock-green, #10B981)" : "rgba(255, 255, 255, 0.15)",
                            border: "none",
                            padding: "2px",
                            cursor: isStreaming ? "not-allowed" : "pointer",
                            opacity: isStreaming ? 0.5 : 1,
                            display: "flex",
                            alignItems: "center",
                            transition: "background 0.2s ease",
                            position: "relative",
                          }}
                        >
                          <span
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              background: "#ffffff",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                              transform: ch.enabled ? "translateX(16px)" : "translateX(0px)",
                              transition: "transform 0.2s ease",
                            }}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Stream Key Status & Action Icons (No Nested Box!) */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "11px",
                        paddingTop: "6px",
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      {/* Key Status Left */}
                      {hasKey ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                          <span style={{ color: "var(--dock-text-dim, #64748b)" }}>Key:</span>
                          <span
                            style={{
                              fontFamily: "var(--dock-font-mono, monospace)",
                              color: "var(--dock-text-secondary, #cbd5e1)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "110px",
                            }}
                          >
                            {keyRevealed ? ch.streamKey : "••••••••••••••••"}
                          </span>
                          <button
                            type="button"
                            disabled={isStreaming}
                            onClick={() => !isStreaming && toggleKeyVisibility(ch.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: isStreaming ? "var(--dock-text-dim, #475569)" : "var(--dock-text-dim, #64748b)",
                              cursor: isStreaming ? "not-allowed" : "pointer",
                              padding: "2px",
                              display: "flex",
                              alignItems: "center",
                            }}
                            title={keyRevealed ? "Hide key" : "Show key"}
                          >
                            <Icon name={keyRevealed ? "visibility_off" : "visibility"} size={13} />
                          </button>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 600,
                              color: "var(--dock-green, #10B981)",
                              display: "flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            <Icon name="check" size={11} />
                            <span>
                              {activeProfile.activeChannelId === ch.id
                                ? "Active in OBS"
                                : "Ready"}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: "var(--dock-yellow, #F59E0B)", display: "flex", alignItems: "center", gap: "4px" }}>
                            <Icon name="warning" size={13} />
                            <span>Stream key missing</span>
                          </span>
                          <button
                            type="button"
                            disabled={isStreaming}
                            onClick={() => !isStreaming && openEditChannelModal(activeProfile.id, ch, true)}
                            title={isStreaming ? "Cannot add key while streaming live" : "+ Add Key"}
                            style={{
                              background: "rgba(245, 158, 11, 0.15)",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                              color: "var(--dock-yellow, #F59E0B)",
                              borderRadius: "4px",
                              padding: "2px 6px",
                              fontSize: "10px",
                              fontWeight: 600,
                              cursor: isStreaming ? "not-allowed" : "pointer",
                              opacity: isStreaming ? 0.4 : 1,
                            }}
                          >
                            + Add Key
                          </button>
                        </div>
                      )}

                      {/* Action Icons Right */}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => !isStreaming && handleApplyChannelToObs(ch, activeProfile.nickname)}
                          disabled={isSyncing || isStreaming}
                          title={isStreaming ? "Already live streaming in OBS" : `Sync ${ch.name} to OBS`}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: isStreaming ? "var(--dock-text-dim, #475569)" : "var(--dock-accent, #6366f1)",
                            cursor: isStreaming ? "not-allowed" : isSyncing ? "wait" : "pointer",
                            opacity: isStreaming ? 0.35 : 1,
                            padding: "3px 4px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Icon name={syncingChannelId === ch.id ? "sync" : "send"} size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => !isStreaming && openEditChannelModal(activeProfile.id, ch)}
                          disabled={isStreaming}
                          title={isStreaming ? "Cannot edit channel while streaming live" : "Edit Channel Settings"}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--dock-text-dim, #94a3b8)",
                            cursor: isStreaming ? "not-allowed" : "pointer",
                            opacity: isStreaming ? 0.35 : 1,
                            padding: "3px 4px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Icon name="edit" size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => !isStreaming && handleDeleteChannel(activeProfile.id, ch)}
                          disabled={isStreaming}
                          title={isStreaming ? "Cannot remove channel while streaming live" : "Remove Channel"}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--dock-red, #ef4444)",
                            cursor: isStreaming ? "not-allowed" : "pointer",
                            opacity: isStreaming ? 0.35 : 1,
                            padding: "3px 4px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Icon name="delete" size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ═══ STEP 3: MASTER BROADCAST ACTION (VISUAL LEADING BOTTOM) ═══ */}
      {activeProfile && (
        <section
          style={{
            background: "var(--dock-surface, #18181c)",
            border: "1px solid var(--dock-border, rgba(255,255,255,0.08))",
            borderRadius: "12px",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginTop: "auto",
          }}
        >
          <MultistreamStatusPanel
            compact
            profile={activeProfile}
            isStreaming={isStreaming}
            allowed={allocation.allowed}
            usage={usageInfo}
            applying={isSyncing}
            onApply={handleApplyActivePersonToObs}
            onUpgrade={() =>
              showUpgradeModal(
                "Multi-streaming sends one OBS stream to YouTube, Facebook and more at the same time. Basic includes 10 hours a month, Growth 20 hours."
              )
            }
          />

          {/* Status Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "var(--dock-text-dim, #94a3b8)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: obsConnected ? "var(--dock-green, #10B981)" : "var(--dock-red, #EF4444)",
                }}
              />
              <span style={{ color: obsConnected ? "var(--dock-text, #ffffff)" : "var(--dock-text-dim, #64748b)", fontWeight: 500 }}>
                {obsConnected ? "OBS Connected" : "OBS Disconnected"}
              </span>
            </div>
            <span>
              {isStreaming
                ? `LIVE • ${streamTimecode}`
                : readyChannels.length > 0
                ? `${readyChannels.length} channel${readyChannels.length !== 1 ? "s" : ""} ready`
                : "Awaiting stream key"}
            </span>
          </div>

          {/* Master Action Button */}
          {isStreaming ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button
                type="button"
                onClick={handleToggleStream}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "11px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 700,
                  background: "var(--dock-red, #EF4444)",
                  color: "#FFFFFF",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.35)",
                }}
              >
                <Icon name="stop" size={18} />
                <span>Stop Live Stream ({streamTimecode})</span>
              </button>
              <div style={{ textAlign: "center", fontSize: "11px", color: "var(--dock-green, #10B981)", fontWeight: 500 }}>
                Broadcasting live in OBS
              </div>
            </div>
          ) : canStartStream ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button
                type="button"
                onClick={handleToggleStream}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "11px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 700,
                  background: "var(--dock-green, #10B981)",
                  color: "#FFFFFF",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                }}
              >
                <Icon name="play_arrow" size={18} />
                <span>Start Live Stream</span>
              </button>
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  onClick={handleApplyActivePersonToObs}
                  disabled={isSyncing || isStreaming}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--dock-text-dim, #64748b)",
                    cursor: isSyncing || isStreaming ? "not-allowed" : "pointer",
                    opacity: isStreaming ? 0.4 : 1,
                    fontSize: "11px",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                  title={
                    isStreaming
                      ? "Cannot sync with OBS while streaming live"
                      : `Connects to OBS and sends ${activeProfile.nickname}'s stream settings to OBS`
                  }
                >
                  {isSyncing ? "Connecting & Syncing with OBS..." : "Sync stream key with OBS (without starting stream)"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                if (!obsConnected) {
                  showToast("Connecting to OBS Studio...", "info");
                  const conn = await ensureObsConnected();
                  if (conn.connected) {
                    setObsConnected(true);
                    showToast("Connected to OBS Studio!", "success");
                  } else {
                    showToast("Could not connect to OBS. Please ensure OBS is running with WebSocket enabled (in OBS: Tools → WebSocket Server Settings).", "error");
                  }
                } else if (firstChannelWithoutKey) {
                  openEditChannelModal(activeProfile.id, firstChannelWithoutKey, true);
                } else {
                  openNewChannelModal(activeProfile.id);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "11px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                background: !obsConnected ? "rgba(255,255,255,0.06)" : "rgba(245, 158, 11, 0.12)",
                border: `1px solid ${!obsConnected ? "rgba(255,255,255,0.08)" : "rgba(245, 158, 11, 0.35)"}`,
                color: !obsConnected ? "var(--dock-text-dim, #64748b)" : "var(--dock-yellow, #F59E0B)",
                cursor: "pointer",
              }}
            >
              {!obsConnected ? (
                <span>Connect OBS to Start</span>
              ) : (
                <>
                  <Icon name="vpn_key" size={15} />
                  <span>Enter Stream Key to Start</span>
                </>
              )}
            </button>
          )}
        </section>
      )}

      {/* ═══ MODAL: ADD / EDIT PERSON PROFILE ═══ */}
      {showPersonModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShowPersonModal(false)}
        >
          <div
            style={{
              background: "var(--dock-surface-alt, #182234)",
              border: "1px solid var(--dock-border, rgba(255,255,255,0.12))",
              borderRadius: "14px",
              padding: "16px",
              maxWidth: "360px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#fff" }}>
                {editingPerson ? "Edit Speaker Profile" : "Add Speaker Profile"}
              </span>
              <button
                type="button"
                onClick={() => setShowPersonModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--dock-text-dim, #94a3b8)", cursor: "pointer" }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--dock-text-dim, #94a3b8)" }}>
                Full Name / Description
              </label>
              <input
                type="text"
                placeholder="e.g. Church Account or Pastor Account"
                value={personNameInput}
                onChange={(e) => setPersonNameInput(e.target.value)}
                style={{
                  background: "var(--dock-surface, #0f172a)",
                  border: "1px solid var(--dock-border, #334155)",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--dock-text-dim, #94a3b8)" }}>
                Button Nickname (Short label)
              </label>
              <input
                type="text"
                placeholder="e.g. Church or Pastor"
                value={personNicknameInput}
                onChange={(e) => setPersonNicknameInput(e.target.value)}
                style={{
                  background: "var(--dock-surface, #0f172a)",
                  border: "1px solid var(--dock-border, #334155)",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: "10px", color: "var(--dock-text-dim, #64748b)" }}>
                This is the name shown on the quick switch button in the Dock.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--dock-text-dim, #94a3b8)" }}>
                Tag Color
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {["#F59E0B", "#EF4444", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPersonColorInput(c)}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: c,
                      border: personColorInput === c ? "2px solid #ffffff" : "2px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setShowPersonModal(false)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  background: "transparent",
                  color: "var(--dock-text-dim, #94a3b8)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePerson}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  background: "var(--dock-accent, #6366F1)",
                  color: "#ffffff",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: ADD / EDIT CHANNEL ═══ */}
      {showChannelModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShowChannelModal(false)}
        >
          <div
            style={{
              background: "var(--dock-surface-alt, #182234)",
              border: "1px solid var(--dock-border, rgba(255,255,255,0.12))",
              borderRadius: "14px",
              padding: "16px",
              maxWidth: "380px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#fff" }}>
                {editingChannel?.channel ? "Edit Channel" : "Add Channel"}
              </span>
              <button
                type="button"
                onClick={() => setShowChannelModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--dock-text-dim, #94a3b8)", cursor: "pointer" }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--dock-text-dim, #94a3b8)" }}>
                Platform
              </label>
              <select
                value={channelPlatformInput}
                onChange={(e) => {
                  const plat = e.target.value as BroadcastPlatform;
                  setChannelPlatformInput(plat);
                  setChannelServerInput(PLATFORM_INFO[plat].defaultServer);
                }}
                style={{
                  background: "var(--dock-surface, #0f172a)",
                  border: "1px solid var(--dock-border, #334155)",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  outline: "none",
                }}
              >
                <option value="youtube">YouTube Live</option>
                <option value="facebook">Facebook Live</option>
                <option value="instagram">Instagram Live</option>
                <option value="tiktok">TikTok Live</option>
                <option value="kick">Kick Stream</option>
                <option value="twitch">Twitch</option>
                <option value="custom">Custom RTMP Server</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--dock-text-dim, #94a3b8)" }}>
                Channel Nickname / Label
              </label>
              <input
                type="text"
                placeholder="e.g. Main YouTube Channel"
                value={channelNameInput}
                onChange={(e) => setChannelNameInput(e.target.value)}
                style={{
                  background: "var(--dock-surface, #0f172a)",
                  border: "1px solid var(--dock-border, #334155)",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--dock-text-dim, #94a3b8)" }}>
                  Stream Key
                </label>
                <button
                  type="button"
                  onClick={() => setShowKeyInModal((v) => !v)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--dock-text-dim, #64748b)",
                    fontSize: "10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Icon name={showKeyInModal ? "visibility_off" : "visibility"} size={12} />
                  <span>{showKeyInModal ? "Hide" : "Show"}</span>
                </button>
              </div>
              <input
                ref={streamKeyInputRef}
                type={showKeyInModal ? "text" : "password"}
                placeholder="Paste platform stream key..."
                value={channelKeyInput}
                onChange={(e) => setChannelKeyInput(e.target.value)}
                style={{
                  background: "var(--dock-surface, #0f172a)",
                  border: "1px solid var(--dock-border, #334155)",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontFamily: "var(--dock-font-mono, monospace)",
                  outline: "none",
                }}
              />

              {/* Where to get the key helper */}
              {PLATFORM_KEY_GUIDES[channelPlatformInput] && (
                <div
                  style={{
                    marginTop: "6px",
                    padding: "8px 10px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "6px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--dock-text-dim, #94a3b8)", lineHeight: 1.4 }}>
                    <strong style={{ color: "#fff" }}>How to get this key:</strong>{" "}
                    <span>{PLATFORM_KEY_GUIDES[channelPlatformInput].instructions}</span>
                  </div>
                  {PLATFORM_KEY_GUIDES[channelPlatformInput].url && (
                    <button
                      type="button"
                      onClick={() => handleOpenExternalLink(PLATFORM_KEY_GUIDES[channelPlatformInput].url!)}
                      style={{
                        alignSelf: "flex-start",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        background: "rgba(99, 102, 241, 0.15)",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        borderRadius: "5px",
                        color: "#a5b4fc",
                        fontSize: "10.5px",
                        fontWeight: 600,
                        padding: "3px 8px",
                        cursor: "pointer",
                      }}
                    >
                      <span>{PLATFORM_KEY_GUIDES[channelPlatformInput].actionLabel}</span>
                      <Icon name="open_in_new" size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {channelPlatformInput === "youtube" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--dock-text-dim, #94a3b8)" }}>
                  Stream Server (YouTube Ingest)
                </label>
                <select
                  value={
                    channelServerInput && channelServerInput !== "auto"
                      ? channelServerInput
                      : "Primary YouTube ingest server"
                  }
                  onChange={(e) => setChannelServerInput(e.target.value)}
                  style={{
                    background: "var(--dock-surface, #0f172a)",
                    border: "1px solid var(--dock-border, #334155)",
                    color: "#fff",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    outline: "none",
                  }}
                >
                  <option value="Primary YouTube ingest server">Primary YouTube ingest server (RTMPS - Default)</option>
                  <option value="Primary YouTube ingest server (legacy RTMP)">Primary YouTube ingest server (Standard RTMP - Matches YouTube Studio)</option>
                  <option value="Backup YouTube ingest server">Backup YouTube ingest server</option>
                  <option value="Backup YouTube ingest server (legacy RTMP)">Backup YouTube ingest server (legacy RTMP)</option>
                </select>
                <span style={{ fontSize: "10px", color: "var(--dock-text-dim, #64748b)" }}>
                  Standard RTMP matches your YouTube Studio URL (rtmp://a.rtmp.youtube.com/live2) for reliable delivery.
                </span>
              </div>
            )}

            {channelPlatformInput === "custom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--dock-text-dim, #94a3b8)" }}>
                  Streaming Server Address (RTMP URL)
                </label>
                <input
                  type="text"
                  placeholder="rtmp://server.com/live"
                  value={channelServerInput}
                  onChange={(e) => setChannelServerInput(e.target.value)}
                  style={{
                    background: "var(--dock-surface, #0f172a)",
                    border: "1px solid var(--dock-border, #334155)",
                    color: "#fff",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontFamily: "var(--dock-font-mono, monospace)",
                    outline: "none",
                  }}
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setShowChannelModal(false)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  background: "transparent",
                  color: "var(--dock-text-dim, #94a3b8)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveChannel}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  background: "var(--dock-accent, #6366F1)",
                  color: "#ffffff",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Save Channel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
