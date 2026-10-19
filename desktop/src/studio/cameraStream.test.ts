import { describe, expect, it, vi } from "vitest";

vi.mock("./studioEngine", () => ({ studioBaseUrl: async () => "http://127.0.0.1:45678" }));

import { readCameraStream } from "./nativeCamera";

function part(seq: number, bytes: number[]): Uint8Array {
  const head = new TextEncoder().encode(`--mceframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${bytes.length}\r\nX-Frame-Seq: ${seq}\r\n\r\n`);
  const out = new Uint8Array(head.length + bytes.length + 2);
  out.set(head);
  out.set(bytes, head.length);
  out.set([13, 10], head.length + bytes.length);
  return out;
}

describe("camera stream", () => {
  it("hands over every picture, even when the network splits them anywhere", async () => {
    const all = new Uint8Array([...part(1, [0xff, 0xd8, 1]), ...part(2, [0xff, 0xd8, 2, 2]), ...part(3, [0xff, 0xd8, 3])]);
    // Arrives in awkward pieces: through a header, through a picture, two parts at once.
    const cuts = [7, 30, 61, 62, 90, all.length];
    let at = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const end = cuts.shift();
        if (end === undefined) { controller.close(); return; }
        controller.enqueue(all.slice(at, end));
        at = end;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const frames: Array<[number, number]> = [];
    await readCameraStream("http://x/api/studio-camera/stream", (blob, seq) => frames.push([seq, blob.size]), new AbortController().signal);
    expect(frames).toEqual([[1, 3], [2, 4], [3, 3]]);
  });
});
