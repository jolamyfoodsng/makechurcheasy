/**
 * ThemeRenderer — draws a ThemeLayout into a host element.
 *
 * One file, used in two places:
 *   • the app (editor canvas, theme thumbnails, dock previews) via import
 *   • the OBS overlays via public/theme-renderer.js (scripts/build-theme-renderer.mjs)
 *
 * Performance rules it follows:
 *   • The layer DOM is built once per layout hash. New content only swaps text.
 *   • Animations use the Web Animations API on transform / opacity / clip-path.
 *   • `will-change` is set only while an animation runs.
 *   • Loops pause while the theme is hidden; the stage is visibility:hidden.
 *   • Text auto-fit is a bounded binary search (≤ 7 measurements) per change.
 */
import {
  isSplitPreset,
  layerKeyframes,
  loopKeyframes,
  splitKeyframes,
  timing,
  totalDuration,
} from "./animations";
import { fillTokens, hasTokens, isVerseTextPattern, resolveTokens, splitVerseLines, type ResolvedTokens } from "./content";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  type LayerAnchor,
  type LayerAnimation,
  type ThemeContent,
  type ThemeLayer,
  type ThemeLayout,
} from "./types";

export interface ThemeRendererOptions {
  /** Rewrites image URLs (e.g. to the overlay asset server). */
  resolveAsset?: (src: string) => string;
  /** Scale the 1920×1080 stage to fit the host (default true). */
  autoScale?: boolean;
  /** Skip all animations (thumbnails, editor while dragging). */
  static?: boolean;
  /** Max wait for fonts/images before the first show, ms. Default 1500. */
  preloadTimeoutMs?: number;
}

interface LayerNode {
  layer: ThemeLayer;
  pos: HTMLDivElement;
  el: HTMLDivElement;
  surface: HTMLDivElement | null;
  shine: HTMLDivElement | null;
  text: HTMLDivElement | null;
  usesTokens: boolean;
  isVerse: boolean;
  lastValue: string;
  empty: boolean;
  loopAnims: Animation[];
}

const STYLE_ID = "mtl-renderer-style";
const BASE_CSS = `
.mtl-host{position:absolute;inset:0;overflow:hidden;pointer-events:none;contain:strict}
.mtl-stage{position:absolute;left:0;top:0;width:${DESIGN_WIDTH}px;height:${DESIGN_HEIGHT}px;transform-origin:0 0;visibility:hidden}
.mtl-stage.is-visible{visibility:visible}
.mtl-pos{position:absolute;box-sizing:border-box}
.mtl-el{position:relative;box-sizing:border-box;width:100%;height:100%;overflow:hidden}
.mtl-el.is-auto{height:auto}
.mtl-surface{position:absolute;left:0;top:0;bottom:0;width:100%}
.mtl-surface.is-drift{width:200%}
.mtl-shine{position:absolute;top:0;bottom:0;left:0;width:35%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.22),transparent)}
.mtl-text{position:relative;box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100%;overflow-wrap:break-word}
.mtl-el.is-auto .mtl-text{height:auto}
.mtl-text-inner{display:block}
.mtl-line{display:inline}
.mtl-line.is-block{display:block}
.mtl-num{font-size:.55em;vertical-align:super;line-height:0;margin-right:.25em;font-weight:inherit;opacity:.85}
.mtl-w{display:inline-block;white-space:pre}
.mtl-img{display:block;width:100%;height:100%}
.mtl-hidden{display:none!important}
`;

const ANCHOR_SHIFT: Record<LayerAnchor, [number, number]> = {
  "top-left": [0, 0], "top-center": [-50, 0], "top-right": [-100, 0],
  "middle-left": [0, -50], center: [-50, -50], "middle-right": [-100, -50],
  "bottom-left": [0, -100], "bottom-center": [-50, -100], "bottom-right": [-100, -100],
};

export function hashLayout(layout: ThemeLayout): string {
  const s = JSON.stringify(layout);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

function safeUrl(src: string): string {
  const v = (src || "").trim();
  if (/^(https?:|data:image\/|blob:|\/|\.\/|[\w-]+\/)/i.test(v) && !/^javascript:/i.test(v)) return v;
  return "";
}

function gradientCss(layer: ThemeLayer): string {
  const g = layer.style.gradient;
  if (!g || !g.stops?.length) return "";
  const stops = g.stops.map((s) => `${s.color} ${s.at}%`).join(", ");
  return g.type === "radial" ? `radial-gradient(circle at 30% 50%, ${stops})` : `linear-gradient(${g.angle ?? 90}deg, ${stops})`;
}

function ensureBaseStyle(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = BASE_CSS;
  doc.head.appendChild(style);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function finished(anims: Animation[]): Promise<void> {
  return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => undefined);
}

export class ThemeRenderer {
  private host: HTMLElement;
  private doc: Document;
  private opts: Required<Pick<ThemeRendererOptions, "autoScale" | "static" | "preloadTimeoutMs">> & ThemeRendererOptions;
  private root: HTMLDivElement;
  private stage: HTMLDivElement;
  private nodes: LayerNode[] = [];
  private layout: ThemeLayout | null = null;
  private hash = "";
  private preload: Promise<void> = Promise.resolve();
  private visibleState = false;
  private running: Animation[] = [];
  private queue: Promise<void> = Promise.resolve();
  private pending: { kind: "show"; content: ThemeContent } | { kind: "hide" } | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private onWindowResize = () => this.rescale();
  private content: ThemeContent | null = null;
  /** ms spent on the last content swap (DOM + fit), for perf checks. */
  lastSwapMs = 0;

  constructor(host: HTMLElement, options: ThemeRendererOptions = {}) {
    this.host = host;
    this.doc = host.ownerDocument;
    this.opts = { autoScale: true, static: false, preloadTimeoutMs: 1500, ...options };
    ensureBaseStyle(this.doc);
    this.root = this.doc.createElement("div");
    this.root.className = "mtl-host";
    this.stage = this.doc.createElement("div");
    this.stage.className = "mtl-stage";
    this.root.appendChild(this.stage);
    host.appendChild(this.root);
    if (this.opts.autoScale) {
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => this.rescale());
        this.resizeObserver.observe(this.root);
      } else {
        window.addEventListener("resize", this.onWindowResize);
      }
      this.rescale();
    }
  }

  get visible(): boolean {
    return this.visibleState;
  }

  get layoutHash(): string {
    return this.hash;
  }

  /** Builds the layer DOM. No-op when the layout hasn't changed. */
  setLayout(layout: ThemeLayout): boolean {
    const nextHash = hashLayout(layout);
    if (nextHash === this.hash) return false;
    const wasVisible = this.visibleState;
    this.cancelRunning();
    this.stopLoops();
    this.stage.textContent = "";
    this.nodes = [];
    this.layout = layout;
    this.hash = nextHash;
    this.build(layout);
    this.preload = this.preloadAssets(layout);
    if (this.content) this.applyAllContent(this.content);
    if (wasVisible) {
      this.startLoops();
    }
    return true;
  }

  /** Show content. Animates in from hidden, or swaps content while visible. Calls are coalesced. */
  show(content: ThemeContent): Promise<void> {
    this.pending = { kind: "show", content };
    return this.drain();
  }

  /** Play everything out, then hide. */
  hide(): Promise<void> {
    this.pending = { kind: "hide" };
    return this.drain();
  }

  /** Editor/thumbnail use: render content visible with no animation. */
  renderStatic(content: ThemeContent | null) {
    this.cancelRunning();
    this.content = content;
    if (content) this.applyAllContent(content);
    this.stage.classList.add("is-visible");
    this.visibleState = true;
  }

  destroy() {
    this.cancelRunning();
    this.stopLoops();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.onWindowResize);
    this.root.remove();
    this.nodes = [];
    this.layout = null;
    this.hash = "";
  }

  rescale() {
    const w = this.root.clientWidth || this.host.clientWidth || DESIGN_WIDTH;
    const h = this.root.clientHeight || this.host.clientHeight || DESIGN_HEIGHT;
    const scale = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);
    this.stage.style.transform = `scale(${scale})`;
  }

  // ───────────────────────────── queue ─────────────────────────────

  private drain(): Promise<void> {
    this.queue = this.queue.then(async () => {
      while (this.pending) {
        const job = this.pending;
        this.pending = null;
        if (job.kind === "show") await this.runShow(job.content);
        else await this.runHide();
      }
    }).catch((err) => {
      console.error("[ThemeRenderer]", err);
    });
    return this.queue;
  }

  private async runShow(content: ThemeContent) {
    if (!this.layout) return;
    await this.withTimeout(this.preload);
    if (!this.visibleState) {
      this.content = content;
      this.timeSwap(() => this.applyAllContent(content));
      await this.playIn(this.nodes);
      return;
    }
    const prev = this.content;
    this.content = content;
    if (this.layout.swap === "all") {
      await this.playOut(this.nodes);
      this.timeSwap(() => this.applyAllContent(content));
      await this.playIn(this.nodes);
      return;
    }
    const tokens = resolveTokens(content);
    const changed = this.nodes.filter((n) => n.usesTokens && this.valueFor(n, tokens, content) !== n.lastValue);
    if (!changed.length && prev) return;
    await this.playOut(changed, 0.6);
    this.timeSwap(() => {
      for (const n of changed) this.applyContent(n, tokens, content);
    });
    await this.playIn(changed.filter((n) => !n.empty), 0.8);
  }

  private async runHide() {
    if (!this.visibleState) return;
    await this.playOut(this.nodes);
    this.cancelRunning();
    this.stopLoops();
    this.stage.classList.remove("is-visible");
    this.visibleState = false;
  }

  private withTimeout(p: Promise<void>): Promise<void> {
    return Promise.race([p, new Promise<void>((r) => setTimeout(r, this.opts.preloadTimeoutMs))]);
  }

  private timeSwap(fn: () => void) {
    const t0 = performance.now();
    fn();
    this.lastSwapMs = performance.now() - t0;
  }

  // ───────────────────────────── build ─────────────────────────────

  private build(layout: ThemeLayout) {
    const byId = new Map<string, LayerNode>();
    for (const layer of layout.layers) {
      if (layer.hidden) continue;
      const node = this.createNode(layer);
      byId.set(layer.id, node);
      this.nodes.push(node);
    }
    for (const node of this.nodes) {
      const parent = node.layer.parentId ? byId.get(node.layer.parentId) : undefined;
      (parent ? parent.el : this.stage).appendChild(node.pos);
    }
  }

  private createNode(layer: ThemeLayer): LayerNode {
    const d = this.doc;
    const s = layer.style || {};
    const pos = d.createElement("div");
    pos.className = "mtl-pos";
    pos.dataset.layerId = layer.id;
    const [sx, sy] = ANCHOR_SHIFT[layer.anchor] || ANCHOR_SHIFT["top-left"];
    const auto = layer.h === "auto";
    Object.assign(pos.style, {
      left: `${layer.x}px`,
      top: `${layer.y}px`,
      width: `${Math.max(1, layer.w)}px`,
      height: auto ? "auto" : `${Math.max(1, layer.h as number)}px`,
      transform: `translate(${sx}%, ${sy}%)${layer.rotation ? ` rotate(${layer.rotation}deg)` : ""}`,
      opacity: String(layer.opacity ?? 1),
    } as Partial<CSSStyleDeclaration>);

    const el = d.createElement("div");
    el.className = auto ? "mtl-el is-auto" : "mtl-el";
    const es = el.style;
    if (s.radius) es.borderRadius = `${s.radius}px`;
    if (s.borderWidth) es.border = `${s.borderWidth}px solid ${s.borderColor || "rgba(255,255,255,.2)"}`;
    if (s.shadow) es.boxShadow = s.shadow;
    if (s.clipPath) es.clipPath = s.clipPath;
    if (s.backdropBlur) {
      es.setProperty("backdrop-filter", `blur(${s.backdropBlur}px)`);
      es.setProperty("-webkit-backdrop-filter", `blur(${s.backdropBlur}px)`);
    }
    pos.appendChild(el);

    let surface: HTMLDivElement | null = null;
    let shine: HTMLDivElement | null = null;
    const bg = gradientCss(layer) || s.fill || "";
    if (bg && layer.type !== "image") {
      surface = d.createElement("div");
      surface.className = layer.loop?.preset === "drift" ? "mtl-surface is-drift" : "mtl-surface";
      surface.style.background = bg;
      el.appendChild(surface);
    }
    if (layer.loop?.preset === "shimmer") {
      shine = d.createElement("div");
      shine.className = "mtl-shine";
      el.appendChild(shine);
    }

    let text: HTMLDivElement | null = null;
    if (layer.type === "image") {
      const src = safeUrl(s.src ? (this.opts.resolveAsset ? this.opts.resolveAsset(s.src) : s.src) : "");
      if (src) {
        const img = d.createElement("img");
        img.className = "mtl-img";
        img.decoding = "async";
        img.alt = "";
        img.src = src;
        img.style.objectFit = s.fit || "cover";
        el.appendChild(img);
      }
    } else if (layer.type === "text") {
      text = d.createElement("div");
      text.className = "mtl-text";
      const ts = text.style;
      const [pt, pr, pb, pl] = s.padding || [0, 0, 0, 0];
      ts.padding = `${pt}px ${pr}px ${pb}px ${pl}px`;
      ts.justifyContent = s.verticalAlign === "top" ? "flex-start" : s.verticalAlign === "bottom" ? "flex-end" : "center";
      ts.textAlign = s.align || "left";
      ts.color = s.color || "#ffffff";
      ts.fontFamily = s.fontFamily ? `"${s.fontFamily}", system-ui, sans-serif` : "system-ui, sans-serif";
      ts.fontSize = `${s.fontSize || 40}px`;
      ts.fontWeight = String(s.fontWeight || 400);
      ts.fontStyle = s.italic ? "italic" : "normal";
      ts.lineHeight = String(s.lineHeight || 1.3);
      if (s.letterSpacing) ts.letterSpacing = `${s.letterSpacing}px`;
      if (s.textTransform) ts.textTransform = s.textTransform;
      if (s.textShadow) ts.textShadow = s.textShadow;
      el.appendChild(text);
    }

    return {
      layer,
      pos,
      el,
      surface,
      shine,
      text,
      usesTokens: layer.type === "text" && hasTokens(layer.content),
      isVerse: layer.type === "text" && isVerseTextPattern(layer.content),
      lastValue: "\u0000",
      empty: false,
      loopAnims: [],
    };
  }

  // ───────────────────────────── content ─────────────────────────────

  private valueFor(n: LayerNode, tokens: ResolvedTokens, content: ThemeContent): string {
    if (n.layer.type !== "text") return "";
    if (n.isVerse) return `${content.lineCount ?? ""}|${tokens.text}`;
    return fillTokens(n.layer.content || "", tokens);
  }

  private applyAllContent(content: ThemeContent) {
    const tokens = resolveTokens(content);
    for (const n of this.nodes) this.applyContent(n, tokens, content);
  }

  private applyContent(n: LayerNode, tokens: ResolvedTokens, content: ThemeContent) {
    if (n.layer.type !== "text" || !n.text) return;
    const value = this.valueFor(n, tokens, content);
    if (value === n.lastValue) return;
    n.lastValue = value;
    const d = this.doc;
    const s = n.layer.style;
    const split = isSplitPreset(n.layer.in.preset) || isSplitPreset(n.layer.out.preset);
    const lineRise = n.layer.in.preset === "line-rise" || n.layer.out.preset === "line-rise";
    const inner = d.createElement("div");
    inner.className = "mtl-text-inner";

    const appendWords = (parent: HTMLElement, body: string) => {
      if (!split || lineRise) {
        parent.appendChild(d.createTextNode(body));
        return;
      }
      const parts = body.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          parent.appendChild(d.createTextNode(" "));
        } else {
          const w = d.createElement("span");
          w.className = "mtl-w";
          w.textContent = part;
          parent.appendChild(w);
        }
      }
    };

    let isEmpty: boolean;
    if (n.isVerse) {
      const lines = splitVerseLines(tokens.text, content.lineCount);
      isEmpty = lines.length === 0;
      lines.forEach((line, i) => {
        const span = d.createElement("span");
        span.className = lineRise ? "mtl-line is-block" : "mtl-line";
        if (line.number && s.verseNumbers !== false) {
          const num = d.createElement("sup");
          num.className = "mtl-num";
          num.textContent = line.number;
          if (s.verseNumberColor) num.style.color = s.verseNumberColor;
          span.appendChild(num);
        }
        appendWords(span, line.body);
        if (!lineRise && i < lines.length - 1) span.appendChild(d.createTextNode(" "));
        inner.appendChild(span);
      });
    } else {
      isEmpty = value.length === 0;
      if (lineRise) {
        const span = d.createElement("span");
        span.className = "mtl-line is-block";
        span.textContent = value;
        inner.appendChild(span);
      } else {
        appendWords(inner, value);
      }
    }

    n.text.replaceChildren(inner);
    n.empty = isEmpty && n.layer.hideWhenEmpty !== false;
    n.pos.classList.toggle("mtl-hidden", n.empty);
    if (!n.empty) this.fitText(n);
  }

  /** Shrinks the font until the text fits its box (fixed height) or maxLines (auto height). */
  private fitText(n: LayerNode) {
    const t = n.text;
    if (!t) return;
    const s = n.layer.style;
    const max = s.fontSize || 40;
    const min = Math.max(8, s.minFontSize || Math.round(max * 0.6));
    const lh = s.lineHeight || 1.3;
    const [pt, , pb] = s.padding || [0, 0, 0, 0];
    const fixed = n.layer.h !== "auto";
    const limitFor = (size: number) =>
      fixed ? (n.layer.h as number) - pt - pb : s.maxLines ? s.maxLines * lh * size + 1 : Infinity;
    const inner = t.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const fits = (size: number) => {
      t.style.fontSize = `${size}px`;
      return inner.offsetHeight <= limitFor(size) + 1;
    };
    if (limitFor(max) === Infinity || fits(max)) {
      t.style.fontSize = `${max}px`;
      return;
    }
    let lo = min;
    let hi = max;
    for (let i = 0; i < 7 && hi - lo > 1; i++) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    t.style.fontSize = `${lo}px`;
  }

  // ───────────────────────────── motion ─────────────────────────────

  private animate(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation {
    const h = el as HTMLElement;
    h.style.willChange = "transform, opacity";
    const anim = h.animate(frames, opts);
    this.running.push(anim);
    // "out" animations hold their last frame (fill: forwards), so they stay
    // tracked until the next in/hide cancels them. "in" animations are
    // released as soon as they finish.
    const holds = opts.fill === "forwards";
    const clear = () => {
      h.style.willChange = "";
      if (!holds) this.running = this.running.filter((a) => a !== anim);
    };
    anim.finished.then(clear, clear);
    return anim;
  }

  private animateNode(n: LayerNode, anim: LayerAnimation, dir: "in" | "out", speed: number): Animation[] {
    if (this.opts.static || anim.preset === "none" || anim.duration <= 0) return [];
    const scaled: LayerAnimation = { ...anim, duration: anim.duration * speed, delay: anim.delay * speed };
    const out: Animation[] = [];
    const frames = layerKeyframes(anim.preset, anim.distance ?? 40);
    if (frames) {
      const layerTiming = isSplitPreset(anim.preset)
        ? { ...scaled, duration: Math.min(180, scaled.duration) }
        : scaled;
      out.push(this.animate(n.el, frames, timing(layerTiming, dir)));
    }
    if (isSplitPreset(anim.preset) && n.text) {
      const parts = n.text.querySelectorAll(anim.preset === "line-rise" ? ".mtl-line" : ".mtl-w");
      const stagger = (anim.stagger ?? 35) * speed;
      const count = parts.length;
      parts.forEach((part, i) => {
        // Out plays last word first so the text "unwinds".
        const idx = dir === "in" ? i : count - 1 - i;
        out.push(this.animate(part, splitKeyframes((anim.distance ?? 18) * 0.6), timing(scaled, dir, idx * stagger)));
      });
    }
    return out;
  }

  private async playIn(nodes: LayerNode[], speed = 1) {
    this.stage.classList.add("is-visible");
    const wasVisible = this.visibleState;
    this.visibleState = true;
    // Cancel any held "out" frames on these nodes so the in starts clean.
    this.cancelOn(nodes);
    const anims: Animation[] = [];
    for (const n of nodes) {
      if (n.empty) continue;
      anims.push(...this.animateNode(n, n.layer.in, "in", speed));
    }
    if (!wasVisible) this.startLoops();
    await finished(anims);
  }

  private async playOut(nodes: LayerNode[], speed = 1) {
    if (!nodes.length) return;
    const outs = nodes.filter((n) => !n.empty).map((n) => n.layer.out);
    if (!totalDuration(outs)) return;
    this.cancelOn(nodes);
    const anims: Animation[] = [];
    for (const n of nodes) {
      if (n.empty) continue;
      anims.push(...this.animateNode(n, n.layer.out, "out", speed));
    }
    await finished(anims);
  }

  private cancelOn(nodes: LayerNode[]) {
    const els = new Set<Element>();
    for (const n of nodes) {
      els.add(n.el);
      n.text?.querySelectorAll(".mtl-w,.mtl-line").forEach((e) => els.add(e));
    }
    this.running = this.running.filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      if (target && els.has(target)) {
        a.cancel();
        return false;
      }
      return true;
    });
  }

  private cancelRunning() {
    const all = this.running;
    this.running = [];
    for (const a of all) a.cancel();
  }

  private startLoops() {
    if (this.opts.static) return;
    for (const n of this.nodes) {
      const loop = n.layer.loop;
      if (!loop || loop.preset === "none") continue;
      if (n.loopAnims.length) {
        n.loopAnims.forEach((a) => a.play());
        continue;
      }
      const frames = loopKeyframes(loop.preset);
      const target = loop.preset === "shimmer" ? n.shine : n.surface;
      if (!frames || !target) continue;
      n.loopAnims.push(
        target.animate(frames, {
          duration: Math.max(800, loop.duration || 8000),
          iterations: Infinity,
          direction: loop.preset === "shimmer" ? "normal" : "alternate",
          easing: "ease-in-out",
        }),
      );
    }
  }

  private stopLoops() {
    for (const n of this.nodes) n.loopAnims.forEach((a) => a.pause());
  }
  /** Waits for fonts and images so the first "in" never shows fallback fonts. */
  private async preloadAssets(layout: ThemeLayout): Promise<void> {
    const doc = this.doc;
    const linkLoads: Promise<unknown>[] = [];
    for (const href of layout.fontImports || []) {
      const url = safeUrl(href);
      if (!url) continue;
      const existing = Array.from(doc.querySelectorAll<HTMLLinkElement>("link[data-mtl-font]")).some((l) => l.dataset.mtlFont === url);
      if (existing) continue;
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.dataset.mtlFont = url;
      linkLoads.push(new Promise((r) => { link.onload = r; link.onerror = r; }));
      doc.head.appendChild(link);
    }
    await Promise.all(linkLoads);
    const loads: Promise<unknown>[] = [];
    for (const layer of layout.layers) {
      const s = layer.style || {};
      if (layer.type === "text" && s.fontFamily && doc.fonts?.load) {
        loads.push(doc.fonts.load(`${s.italic ? "italic " : ""}${s.fontWeight || 400} 32px "${s.fontFamily}"`).catch(() => undefined));
      }
      if (layer.type === "image" && s.src) {
        const src = safeUrl(this.opts.resolveAsset ? this.opts.resolveAsset(s.src) : s.src);
        if (src) {
          const img = new Image();
          img.src = src;
          loads.push(img.decode().catch(() => undefined));
        }
      }
    }
    await Promise.all(loads);
    await nextFrame();
    // Fonts may have changed metrics: refit what's on screen.
    for (const n of this.nodes) if (n.text && !n.empty && n.lastValue !== "\u0000") this.fitText(n);
  }
}
