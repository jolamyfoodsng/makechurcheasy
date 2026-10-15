import { describe, expect, it, vi } from "vitest";

vi.mock("./studioEngine", () => ({ studioBaseUrl: async () => "http://127.0.0.1:45678" }));

import { startNativeCamera, stopNativeCamera } from "./nativeCamera";

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
