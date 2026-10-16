/**
 * playMutedVideo.ts — start a muted background video from code instead of the autoplay attribute.
 *
 * When a web view blocks `autoplay`, WebKit (macOS) draws its own big play button over the picture.
 * A video with no autoplay attribute and no controls never gets that button. Use it as a React ref:
 *   <video ref={playMutedVideo} loop muted playsInline src={...} />
 */
const started = new WeakSet<HTMLVideoElement>();

export function playMutedVideo(video: HTMLVideoElement | null): void {
  if (!video || started.has(video)) return;
  started.add(video);
  video.muted = true;
  video.controls = false;
  const kick = () => {
    if (!video.isConnected || !video.paused || video.ended) return;
    try {
      const promise = video.play();
      if (promise && typeof promise.catch === "function") promise.catch(() => undefined);
    } catch {
      /* not allowed yet: tried again on the next event */
    }
  };
  video.addEventListener("loadeddata", kick);
  video.addEventListener("canplay", kick);
  video.addEventListener("pause", () => window.setTimeout(kick, 250));
  document.addEventListener("visibilitychange", kick);
  const timer = window.setInterval(() => {
    if (!video.isConnected) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", kick);
      started.delete(video);
      return;
    }
    kick();
  }, 2000);
  kick();
}
