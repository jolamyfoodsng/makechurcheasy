/**
 * SlideshowControls.tsx — the slideshow bar in the centre panel (under Preview).
 *
 *  [Picture slideshow] 3 / 8   ⏮  ◀  ⏯  ▶   Every [5 s]   Loop  Shuffle   Stop
 *  ────────────── progress to the next item ──────────────
 *  [thumb][thumb][THUMB][thumb] …   click one to jump to it
 */
import { useEffect, useState, type ReactNode } from "react";
import { Film, Image as ImageIcon, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Square, StepBack } from "lucide-react";
import type { MediaItem } from "../../library/libraryTypes";
import { mediaPath } from "../studioSlides";
import { SLIDESHOW_INTERVALS, type SlideshowState } from "../useSlideshow";

interface SlideshowControlsProps {
  show: SlideshowState;
  items: Map<string, MediaItem>;
  base: string;
  itemMs: number;
  timeLeft: () => number;
  progressKey: number;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onRestart: () => void;
  onGoTo: (pos: number) => void;
  onInterval: (sec: number) => void;
  onLoop: (on: boolean) => void;
  onShuffle: (on: boolean) => void;
  onStop: () => void;
  videoControls?: ReactNode;
}

function thumbOf(item: MediaItem | undefined, base: string): string {
  if (!item) return "";
  const thumb = item.thumbnailUrl || (item.type === "image" ? mediaPath(item) : "");
  if (!thumb) return "";
  return /^(data:|https?:|blob:)/i.test(thumb) ? thumb : `${base}${thumb}`;
}

function seconds(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export default function SlideshowControls(props: SlideshowControlsProps) {
  const { show } = props;
  const isVideo = show.kind === "video";
  const [left, setLeft] = useState(props.timeLeft());

  // Progress to the next item (ticks while playing).
  useEffect(() => {
    setLeft(props.timeLeft());
    if (!show.playing) return undefined;
    const id = window.setInterval(() => setLeft(props.timeLeft()), 250);
    return () => window.clearInterval(id);
  }, [show.playing, props.progressKey, props.itemMs, props.timeLeft]);

  const done = props.itemMs > 0 ? Math.min(1, Math.max(0, 1 - left / props.itemMs)) : 0;
  const total = show.order.length;

  return (
    <div className="st-show" aria-label="Slideshow">
      <div className="st-show__row">
        <span className="st-show__kind">
          {isVideo ? <Film size={13} /> : <ImageIcon size={13} />}
          {isVideo ? "Video slideshow" : "Picture slideshow"}
        </span>
        <span className="st-show__count">{show.pos + 1} / {total}</span>

        <div className="st-show__transport" role="group" aria-label="Slideshow controls">
          <button type="button" className="st-iconbtn" onClick={props.onRestart} title="Start again from the first" aria-label="Start again from the first"><StepBack size={15} /></button>
          <button type="button" className="st-iconbtn" onClick={props.onPrev} title="Previous" aria-label="Previous"><SkipBack size={15} /></button>
          <button
            type="button"
            className="st-iconbtn st-show__play"
            onClick={show.playing ? props.onPause : props.onPlay}
            title={show.playing ? "Pause the slideshow" : show.finished ? "Play again" : "Continue"}
            aria-label={show.playing ? "Pause" : "Play"}
          >
            {show.playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" className="st-iconbtn" onClick={props.onNext} title="Next" aria-label="Next"><SkipForward size={15} /></button>
        </div>

        {!isVideo && (
          <label className="st-show__every">
            Every
            <select value={show.intervalSec} onChange={(e) => props.onInterval(Number(e.target.value))} className="st-sel" aria-label="Seconds per picture">
              {SLIDESHOW_INTERVALS.map((s) => <option key={s} value={s}>{s} s</option>)}
            </select>
          </label>
        )}

        <button type="button" className={`st-iconbtn${show.loop ? " is-on" : ""}`} onClick={() => props.onLoop(!show.loop)} aria-pressed={show.loop} title={show.loop ? "Loop is on: starts again after the last" : "Loop is off: stops after the last"} aria-label="Loop"><Repeat size={14} /></button>
        <button type="button" className={`st-iconbtn${show.shuffle ? " is-on" : ""}`} onClick={() => props.onShuffle(!show.shuffle)} aria-pressed={show.shuffle} title="Shuffle" aria-label="Shuffle"><Shuffle size={14} /></button>

        <span className="st-show__state">
          {show.finished ? "Finished" : show.playing ? `next in ${seconds(left)}` : "Paused"}
        </span>
        <button type="button" className="st-show__stop" onClick={props.onStop} title="Stop the slideshow (what's on the screen stays)">
          <Square size={12} /> Stop
        </button>
      </div>

      {isVideo && props.videoControls && <div className="st-show__video-controls">{props.videoControls}</div>}

      <div className="st-show__progress" aria-hidden="true">
        <span style={{ width: `${(done * 100).toFixed(1)}%` }} />
      </div>

      <div className="st-show__strip" role="list" aria-label="Slideshow items">
        {show.order.map((index, pos) => {
          const id = show.ids[index];
          const item = props.items.get(id);
          const thumb = thumbOf(item, props.base);
          const isNow = pos === show.pos;
          return (
            <button
              key={`${id}-${pos}`}
              type="button"
              role="listitem"
              className={`st-show__thumb${isNow ? " is-now" : ""}${pos < show.pos ? " is-done" : ""}`}
              onClick={() => props.onGoTo(pos)}
              title={`${pos + 1}. ${item?.name ?? "Item"}`}
              aria-label={`Show ${pos + 1}: ${item?.name ?? "item"}`}
              aria-current={isNow ? "true" : undefined}
            >
              {thumb ? <img src={thumb} alt="" loading="lazy" /> : (isVideo ? <Film size={14} /> : <ImageIcon size={14} />)}
              <span className="st-show__num">{pos + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
