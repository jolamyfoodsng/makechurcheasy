import { describe, expect, it, vi } from "vitest";

vi.mock("./studioEngine", () => ({ studioBaseUrl: async () => "http://127.0.0.1:45678" }));

import { isNativeId, isNdiId, nativeOption, nativeTarget, startNativeCamera, stopNativeCamera } from "./nativeCamera";

describe("native camera lifecycle", () => {
  it("keeps stop behind an in-flight start so actions finish in request order", async () => {
    let finishStart!: (response: Response) => void;
    const startResponse = new Promise<Response>((resolve) => { finishStart = resolve; });
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/api/studio-cam/start")) return startResponse;
      return new Response('{"ok":true}');
    });
    vi.stubGlobal("fetch", fetchMock);

    const starting = startNativeCamera(1);
    const stopping = stopNativeCamera();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(calls[0]).toContain("/api/studio-cam/start");

    finishStart(new Response('{"ok":true}'));
    await expect(starting).resolves.toMatchObject({ ok: true });
    await stopping;
    expect(calls[1]).toContain("/api/studio-cam/stop");
  });
});

describe("NDI sources in the camera list", () => {
  it("gives NDI sources their own ids and asks the app to open them by name", async () => {
    const ndi = nativeOption({ ndi: "MEDIA-PC (vMix - Output 1)", name: "MEDIA-PC (vMix - Output 1)" });
    expect(ndi).toEqual({ id: "ndi:MEDIA-PC (vMix - Output 1)", label: "MEDIA-PC (vMix - Output 1) (NDI)" });
    expect(isNdiId(ndi.id) && isNativeId(ndi.id)).toBe(true);
    expect(nativeTarget(ndi.id)).toEqual({ ndi: "MEDIA-PC (vMix - Output 1)" });
    const cam = nativeOption({ index: 2, name: "FaceTime HD Camera" });
    expect(cam.id).toBe("n:2");
    expect(isNdiId(cam.id)).toBe(false);
    expect(nativeTarget(cam.id)).toBe(2);

    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response('{"ok":true}');
    }));
    await startNativeCamera(nativeTarget(ndi.id));
    await startNativeCamera(nativeTarget(cam.id));
    expect(JSON.parse(bodies[0])).toEqual({ ndi: "MEDIA-PC (vMix - Output 1)" });
    expect(JSON.parse(bodies[1])).toEqual({ index: 2 });
  });
});
