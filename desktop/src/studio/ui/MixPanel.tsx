/**
 * MixPanel.tsx — Screen Mix: layers on the projector screen, like a very small OBS.
 *
 *   Behind the words: a looping video or picture, or the camera.
 *   In front of the words: a banner such as "Subscribe to our channel", and the church logo.
 *
 * Add one with one tap, then Show / Hide it while the service runs. Changes appear on
 * Program (and the projector) at once.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Camera, Film, Image as ImageIcon, MessageSquare, Plus, Settings2, Trash2, X } from "../../components/icons/NativeIcons";
import type { MediaItem } from "../../library/libraryTypes";
import { mediaPath } from "../studioSlides";
import {
  BANNER_PRESETS,
  CORNER_LABELS,
  isBackdrop,
  newLayerId,
  type MixCorner,
  type StudioMixLayer,
} from "../studioMix";

interface MixPanelProps {
  layers: StudioMixLayer[];
  media: MediaItem[];
  /** The church logo, if one is set (an overlay-server path or data URL). */
  logoUrl: string;
  onChange: (layers: StudioMixLayer[]) => void;
  onToggle: (id: string) => void;
  /** Verses show as a lower third (instead of full screen). */
  lowerThird: boolean;
  onLowerThird: (on: boolean) => void;
}

type Adding = "media" | "banner" | null;

async function listCameras(): Promise<{ cameras: Array<{ id: string; label: string }>; error: string }> {
  if (!navigator.mediaDevices?.getUserMedia) return { cameras: [], error: "This screen can't use a camera." };
  try {
    // Asking once makes the system show the camera names (and its permission prompt).
    const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    probe.getTracks().forEach((track) => track.stop());
  } catch {
    return { cameras: [], error: "Camera not allowed. Turn on camera access for MakeChurchEazy in your system settings." };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  return { cameras, error: cameras.length ? "" : "No camera found." };
}

function layerIcon(layer: StudioMixLayer) {
  if (layer.kind === "camera") return <Camera size={15} />;
  if (layer.kind === "video") return <Film size={15} />;
  if (layer.kind === "image") return <ImageIcon size={15} />;
  if (layer.kind === "logo") return <ImageIcon size={15} />;
  return <MessageSquare size={15} />;
}

function layerDetail(layer: StudioMixLayer): string {
  if (layer.kind === "banner") return layer.text || "";
  if (layer.kind === "camera") return "Camera";
  if (layer.kind === "video") return "Video, loops";
  if (layer.kind === "image") return "Picture";
  return "Church logo";
}

export default function MixPanel({ layers, media, logoUrl, onChange, onToggle, lowerThird, onLowerThird }: MixPanelProps) {
  const [adding, setAdding] = useState<Adding>(null);
  const [openId, setOpenId] = useState("");
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [cameraError, setCameraError] = useState("");

  const add = (layer: Omit<StudioMixLayer, "id" | "shown">) => {
    const next: StudioMixLayer = { ...layer, id: newLayerId(), shown: false };
    onChange([...layers, next]);
    setAdding(null);
    return next;
  };

  const update = (id: string, patch: Partial<StudioMixLayer>) => {
    onChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const remove = (id: string) => {
    onChange(layers.filter((l) => l.id !== id));
    if (openId === id) setOpenId("");
  };

  const move = (id: string, delta: -1 | 1) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;
    const group = layers.filter((l) => isBackdrop(l) === isBackdrop(layer));
    const at = group.findIndex((l) => l.id === id);
    const other = group[at + delta];
    if (!other) return;
    const next = [...layers];
    const a = next.findIndex((l) => l.id === id);
    const b = next.findIndex((l) => l.id === other.id);
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  };

  const addCamera = async () => {
    setAdding(null);
    const found = await listCameras();
    setCameras(found.cameras);
    setCameraError(found.error);
    const layer = add({ kind: "camera", name: "Camera", fit: "cover", deviceId: found.cameras[0]?.id ?? "" });
    setOpenId(layer.id);
  };

  const addLogo = () => {
    if (!logoUrl) {
      setCameraError("Add your church logo in Settings first, then add it here.");
      return;
    }
    add({ kind: "logo", name: "Church logo", logoUrl, corner: "top-right" });
  };

  const openEditor = async (layer: StudioMixLayer) => {
    const closing = openId === layer.id;
    setOpenId(closing ? "" : layer.id);
    if (!closing && layer.kind === "camera") {
      const found = await listCameras();
      setCameras(found.cameras);
      setCameraError(found.error);
    }
  };

  const renderEditor = (layer: StudioMixLayer) => (
    <div className="sx-mixedit">
      <label>Name
        <input value={layer.name} onChange={(e) => update(layer.id, { name: e.target.value })} />
      </label>
      {layer.kind === "banner" && (
        <>
          <label>Big line
            <input value={layer.text ?? ""} onChange={(e) => update(layer.id, { text: e.target.value })} />
          </label>
          <label>Small line
            <input value={layer.subtext ?? ""} onChange={(e) => update(layer.id, { subtext: e.target.value })} />
          </label>
          <label>Where
            <select value={layer.corner ?? "bottom-left"} onChange={(e) => update(layer.id, { corner: e.target.value as MixCorner })}>
              {(Object.keys(CORNER_LABELS) as MixCorner[]).map((c) => <option key={c} value={c}>{CORNER_LABELS[c]}</option>)}
            </select>
          </label>
          <label>Hide itself after
            <select value={layer.seconds ?? 0} onChange={(e) => update(layer.id, { seconds: Number(e.target.value) })}>
              <option value={0}>Stay until hidden</option>
              {[5, 10, 12, 15, 30, 60].map((s) => <option key={s} value={s}>{s} seconds</option>)}
            </select>
          </label>
        </>
      )}
      {layer.kind === "logo" && (
        <label>Where
          <select value={layer.corner ?? "top-right"} onChange={(e) => update(layer.id, { corner: e.target.value as MixCorner })}>
            {(Object.keys(CORNER_LABELS) as MixCorner[]).map((c) => <option key={c} value={c}>{CORNER_LABELS[c]}</option>)}
          </select>
        </label>
      )}
      {layer.kind === "video" && (
        <>
          <label className="sx-mixedit__check"><input type="checkbox" checked={layer.loop !== false} onChange={(e) => update(layer.id, { loop: e.target.checked })} /> Play again and again</label>
          <label className="sx-mixedit__check"><input type="checkbox" checked={layer.muted === true} onChange={(e) => update(layer.id, { muted: e.target.checked })} /> No sound</label>
        </>
      )}
      {(layer.kind === "video" || layer.kind === "image" || layer.kind === "camera") && (
        <label>Fill
          <select value={layer.fit ?? "cover"} onChange={(e) => update(layer.id, { fit: e.target.value as "cover" | "contain" })}>
            <option value="cover">Fill the screen</option>
            <option value="contain">Fit inside the screen</option>
          </select>
        </label>
      )}
      {layer.kind === "camera" && (
        <label>Camera
          <select value={layer.deviceId ?? ""} onChange={(e) => update(layer.id, { deviceId: e.target.value })}>
            <option value="">Default camera</option>
            {cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );

  const renderGroup = (title: string, hint: string, items: StudioMixLayer[]) => (
    <div className="sx-mixgroup">
      <div className="sx-mixgroup__head"><strong>{title}</strong><span>{hint}</span></div>
      {items.length === 0 && <div className="sx-empty">Nothing here yet. Use the + buttons above.</div>}
      {items.map((layer) => (
        <div key={layer.id} className={`sx-mixrow${layer.shown ? " is-shown" : ""}`}>
          <div className="sx-mixrow__main">
            <span className="sx-mixrow__icon">{layerIcon(layer)}</span>
            <span className="sx-mixrow__text">
              <span className="sx-mixrow__name">{layer.name}</span>
              <span className="sx-mixrow__sub">{layerDetail(layer)}</span>
            </span>
            <div className="studio-seg sx-mixrow__seg" role="group" aria-label={`${layer.name} on the screen`}>
              <button type="button" className={layer.shown ? "is-on" : ""} onClick={() => !layer.shown && onToggle(layer.id)}>Shown</button>
              <button type="button" className={!layer.shown ? "is-on" : ""} onClick={() => layer.shown && onToggle(layer.id)}>Hidden</button>
            </div>
            <button type="button" className="sx-iconbtn" onClick={() => void openEditor(layer)} aria-label="Change" title="Change"><Settings2 size={14} /></button>
            <button type="button" className="sx-iconbtn" onClick={() => move(layer.id, -1)} aria-label="Move up" title="Move up"><ArrowUp size={14} /></button>
            <button type="button" className="sx-iconbtn" onClick={() => move(layer.id, 1)} aria-label="Move down" title="Move down"><ArrowDown size={14} /></button>
            <button type="button" className="sx-iconbtn" onClick={() => remove(layer.id)} aria-label="Remove" title="Remove"><Trash2 size={14} /></button>
          </div>
          {openId === layer.id && renderEditor(layer)}
        </div>
      ))}
    </div>
  );

  const front = layers.filter((l) => !isBackdrop(l));
  const back = layers.filter(isBackdrop);

  return (
    <div className="sx-mix">
      <div className="sx-mix__bar">
        <span className="sx-mix__label">Add</span>
        <div className="sx-mix__add">
          <button type="button" className="studio-btn" onClick={() => setAdding(adding === "media" ? null : "media")}><Plus size={13} /> Video or picture</button>
          {adding === "media" && (
            <div className="sx-mix__pop" role="menu">
              {media.length === 0 && <div className="sx-empty">No pictures or videos yet. Add them on the Media page.</div>}
              {media.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => add({ kind: item.type === "video" ? "video" : "image", name: item.name, url: mediaPath(item), loop: true, muted: false, fit: "cover" })}
                >
                  {item.type === "video" ? <Film size={14} /> : <ImageIcon size={14} />}<span>{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="studio-btn" onClick={() => void addCamera()}><Plus size={13} /> Camera</button>
        <div className="sx-mix__add">
          <button type="button" className="studio-btn" onClick={() => setAdding(adding === "banner" ? null : "banner")}><Plus size={13} /> Lower third</button>
          {adding === "banner" && (
            <div className="sx-mix__pop" role="menu">
              {BANNER_PRESETS.map((p) => (
                <button key={p.name} type="button" role="menuitem" onClick={() => add({ kind: "banner", name: p.name, text: p.text, subtext: p.subtext, corner: "bottom-left", seconds: p.seconds })}>
                  <MessageSquare size={14} /><span>{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="studio-btn" onClick={addLogo}><Plus size={13} /> Logo</button>
        {cameraError && <span className="sx-vai__warn" role="alert">{cameraError}<button type="button" onClick={() => setCameraError("")} aria-label="Dismiss"><X size={12} /></button></span>}
      </div>

      <div className="sx-mix__cols">
        <div className="sx-mix__col">
          {renderGroup("In front of the words", "banners and the logo", front)}
          <div className="sx-mixgroup">
            <div className="sx-mixgroup__head"><strong>Bible verses</strong><span>how verses look over your video</span></div>
            <div className={`sx-mixrow${lowerThird ? " is-shown" : ""}`}>
              <div className="sx-mixrow__main">
                <span className="sx-mixrow__icon"><MessageSquare size={15} /></span>
                <span className="sx-mixrow__text">
                  <span className="sx-mixrow__name">Verses as a lower third</span>
                  <span className="sx-mixrow__sub">{lowerThird ? "Verses sit at the bottom, your video shows above" : "Verses fill the whole screen"}</span>
                </span>
                <div className="studio-seg sx-mixrow__seg" role="group" aria-label="Verses as a lower third">
                  <button type="button" className={lowerThird ? "is-on" : ""} onClick={() => onLowerThird(true)}>Shown</button>
                  <button type="button" className={!lowerThird ? "is-on" : ""} onClick={() => onLowerThird(false)}>Hidden</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="sx-mix__col">
          {renderGroup("Behind the words", "video, picture or camera", back)}
          <p className="studio-popover__hint">Shown layers appear on Program and on the projector right away. A camera is only switched on while it is Shown.</p>
        </div>
      </div>
    </div>
  );
}
