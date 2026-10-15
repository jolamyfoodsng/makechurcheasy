/**
 * useCameraLink.ts — sends the live camera to the screen windows as real live video.
 *
 * The Studio already has the camera open. Each screen window (projector, TV or phone link, OBS)
 * that wants the camera says "hello" through the app's local server; the Studio then sets up a
 * direct live video link to it (WebRTC, the same thing a video call uses, but on this computer or
 * your own network, nothing goes to the internet). If a link can't be made, the screen window uses
 * the backup pictures from useCameraRelay.
 */
import { useEffect, useRef } from "react";
import { studioBaseUrl } from "./studioEngine";

interface RtcMessage {
  type?: string;
  from?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

type Peer = { pc: RTCPeerConnection; ready: boolean; queued: RTCIceCandidateInit[] };

export function useCameraLink(stream: MediaStream | null, active: boolean): void {
  // The links outlive a restarted camera picture: when the Studio reopens the camera (another camera,
  // a hiccup), the new picture is swapped into the open links instead of closing them, so the screen
  // never drops the camera and has to reconnect.
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const streamRef = useRef<MediaStream | null>(stream);
  streamRef.current = stream;
  useEffect(() => {
    if (!stream) return;
    for (const { pc } of peersRef.current.values()) {
      const track = stream.getVideoTracks()[0];
      if (!track) continue;
      const sender = pc.getSenders().find((x) => x.track?.kind === "video");
      if (sender && sender.track !== track) void sender.replaceTrack(track).catch(() => undefined);
    }
  }, [stream]);

  const hasStream = Boolean(stream);
  useEffect(() => {
    if (!active || !hasStream || typeof RTCPeerConnection === "undefined") return undefined;
    let stopped = false;
    let base = "";
    let since = 0;
    let primed = false;
    const peers = peersRef.current;

    const baseUrl = async () => {
      if (!base) base = await studioBaseUrl();
      return base;
    };
    const post = async (to: string, msg: Record<string, unknown>) => {
      try {
        await fetch(`${await baseUrl()}/api/studio-rtc`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ ...msg, to, from: "studio" }),
        });
      } catch {
        /* the backup pictures still work */
      }
    };

    const closePeer = (id: string, tell: boolean) => {
      const peer = peers.get(id);
      if (!peer) return;
      peers.delete(id);
      try {
        peer.pc.close();
      } catch {
        /* ignore */
      }
      if (tell) void post(id, { type: "bye" });
    };

    const openPeer = async (id: string) => {
      const existing = peers.get(id);
      if (existing && existing.pc.connectionState !== "failed" && existing.pc.connectionState !== "closed") return;
      if (existing) closePeer(id, false);
      const pc = new RTCPeerConnection({ iceServers: [] });
      const peer = { pc, ready: false, queued: [] as RTCIceCandidateInit[] };
      peers.set(id, peer);
      const live = streamRef.current;
      if (!live) { closePeer(id, false); return; }
      live.getTracks().forEach((track) => pc.addTrack(track, live));
      // On the same computer or network there is room for a sharp picture.
      pc.getSenders().forEach((sender) => {
        try {
          const params = sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          params.encodings[0].maxBitrate = 6_000_000;
          void sender.setParameters(params).catch(() => undefined);
        } catch {
          /* default quality */
        }
      });
      pc.onicecandidate = (event) => {
        if (event.candidate) void post(id, { type: "candidate", candidate: event.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "closed" || state === "disconnected") {
          // Give a short blip a moment, then let the window ask again.
          window.setTimeout(() => {
            const now = peers.get(id);
            if (now && now.pc === pc && pc.connectionState !== "connected") closePeer(id, false);
          }, 4000);
        }
      };
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await post(id, { type: "offer", sdp: offer.sdp });
      } catch {
        closePeer(id, false);
      }
    };

    const handle = async (msg: RtcMessage) => {
      const id = msg.from;
      if (!id || id === "studio") return;
      if (msg.type === "hello") {
        await openPeer(id);
      } else if (msg.type === "answer" && msg.sdp) {
        const peer = peers.get(id);
        if (!peer) return;
        try {
          await peer.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          peer.ready = true;
          for (const cand of peer.queued.splice(0)) await peer.pc.addIceCandidate(cand).catch(() => undefined);
        } catch {
          closePeer(id, false);
        }
      } else if (msg.type === "candidate" && msg.candidate) {
        const peer = peers.get(id);
        if (!peer) return;
        if (peer.ready) await peer.pc.addIceCandidate(msg.candidate).catch(() => undefined);
        else peer.queued.push(msg.candidate);
      } else if (msg.type === "bye") {
        closePeer(id, false);
      }
    };

    const poll = async () => {
      try {
        const res = await fetch(`${await baseUrl()}/api/studio-rtc?to=studio&since=${since}`, { cache: "no-store" });
        const data = (await res.json()) as { seq?: number; messages?: RtcMessage[] };
        const first = !primed;
        primed = true;
        if (typeof data.seq === "number") since = Math.max(since, data.seq);
        // Old messages from before this camera went live are stale: windows ask again every 2 s.
        if (first || stopped) return;
        for (const msg of data.messages ?? []) await handle(msg);
      } catch {
        /* local server busy: try again next time */
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 300);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      for (const id of Array.from(peers.keys())) closePeer(id, true);
    };
  }, [hasStream, active]);
}
