/**
 * dockOverlayBridge.ts — Persistent local WebSocket bridge to overlay HTML.
 *
 * Connects once to the local relay (ws://127.0.0.1:17891) and keeps the
 * connection open. Live control messages (mode-change, verse updates, etc.)
 * are published through this bridge instead of OBS WebSocket, reducing
 * latency from hundreds of milliseconds to single-digit milliseconds.
 *
 * The relay is owned by the MakeChurchEasy Rust backend and all connections
 * are local (127.0.0.1), so there is no security risk from exposing it.
 */

const RELAY_URL = "ws://127.0.0.1:17891";
const RELAY_FAILURE_COOLDOWN_MS = 60_000;
const MAX_FAST_RECONNECT_ATTEMPTS = 3;

export interface BridgePacket {
  channel?: string;
  type?: string;
  senderId?: string;
  [key: string]: unknown;
}

type BridgeHandler = (packet: BridgePacket) => void;

let nextId = 0;
function generateSenderId(): string {
  return `dock-${++nextId}-${Date.now()}`;
}

class DockOverlayBridge {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Set<BridgeHandler> = new Set();
  private connected = false;
  private senderId = generateSenderId();
  private pendingPackets: Map<string, BridgePacket> = new Map();
  private reconnectAttempts = 0;
  private nextConnectAt = 0;
  private disabledUntil = 0;

  private shouldAttemptLocalRelay(): boolean {
    if (Date.now() < this.disabledUntil) return false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mceRelay") === "1") return true;
      if (params.get("mceRelay") === "0") return false;
      const host = window.location.hostname;
      return host === "tauri.localhost"
        || host === "localhost"
        || host === "127.0.0.1"
        || host === "::1";
    } catch {
      return false;
    }
  }

  connect(): void {
    if (typeof WebSocket === "undefined") return;
    if (!this.shouldAttemptLocalRelay()) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const now = Date.now();
    if (now < this.nextConnectAt) {
      this.scheduleReconnect(this.nextConnectAt - now);
      return;
    }

    try {
      const ws = new WebSocket(RELAY_URL);
      ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.nextConnectAt = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.flushPending();
      };
      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data) as BridgePacket;
          // Ignore our own messages
          if (packet.senderId === this.senderId) return;
          for (const handler of this.handlers) {
            handler(packet);
          }
        } catch {
          // Ignore malformed messages
        }
      };
      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.scheduleReconnect();
      };
      ws.onerror = () => {
        ws.close();
      };
      this.ws = ws;
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(delayOverride?: number): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_FAST_RECONNECT_ATTEMPTS) {
      this.disabledUntil = Date.now() + RELAY_FAILURE_COOLDOWN_MS;
      this.pendingPackets.clear();
      this.reconnectAttempts = 0;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, RELAY_FAILURE_COOLDOWN_MS);
      return;
    }
    const delay = delayOverride ?? Math.min(10_000, 500 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.nextConnectAt = Date.now() + delay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  publish(packet: BridgePacket): void {
    if (!this.shouldAttemptLocalRelay()) return;
    const enriched = { ...packet, senderId: this.senderId };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(enriched));
      return;
    }

    const key = `${String(packet.channel ?? "general")}:${String(packet.type ?? "message")}`;
    this.pendingPackets.set(key, enriched);

    this.connect();
  }

  private flushPending(): void {
    if (this.ws?.readyState !== WebSocket.OPEN || this.pendingPackets.size === 0) return;
    const packets = Array.from(this.pendingPackets.values());
    this.pendingPackets.clear();
    for (const packet of packets) {
      this.ws.send(JSON.stringify(packet));
    }
  }

  subscribe(handler: BridgeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const overlayBridge = new DockOverlayBridge();
