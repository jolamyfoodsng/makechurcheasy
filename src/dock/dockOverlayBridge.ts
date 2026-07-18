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
  private pendingModePacket: BridgePacket | null = null;

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(RELAY_URL);
      ws.onopen = () => {
        this.connected = true;
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

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 500);
  }

  publish(packet: BridgePacket): void {
    const enriched = { ...packet, senderId: this.senderId };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(enriched));
      return;
    }

    // Queue the latest mode packet so it isn't lost during connection
    if (packet.type === "mode-change") {
      this.pendingModePacket = enriched;
    }

    this.connect();
  }

  private flushPending(): void {
    if (this.pendingModePacket && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(this.pendingModePacket));
      this.pendingModePacket = null;
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
