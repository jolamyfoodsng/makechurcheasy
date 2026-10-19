/**
 * ScenePicker.tsx — "What's on the screen": one choice instead of separate Words and Camera switches.
 *
 *   Full screen           the words (Bible, songs, notes) fill the screen, no camera.
 *   Lower third           the words as a bar across the bottom, no camera.
 *   Camera                just the camera, no words.
 *   Camera + lower third  the camera with the words as a bar across the bottom.
 *
 * Straight to screen: picking one puts it on the screen at once. Preview first: it is set up in
 * Preview and goes on the screen with Send to Screen. The camera only opens for the camera choices.
 *
 * Media and Docs (`fillLabel`): just two choices, the picture / document or the camera.
 */
import { Monitor, PanelBottom, Video } from "../../components/icons/NativeIcons";
import { comboLabel, useShortcutBindings, type ShortcutId } from "../shortcuts";

export type StudioScene = "fullscreen" | "lower-third" | "camera" | "camera-lt";

/** The keyboard shortcut for each choice (Alt+1 … Alt+4 by default; changeable in Settings). */
export const SCENE_SHORTCUT: Record<StudioScene, ShortcutId> = {
  fullscreen: "look-fullscreen",
  "lower-third": "look-lowerthird",
  camera: "scene-camera",
  "camera-lt": "scene-camera-lt",
};

const SCENES: { id: StudioScene; label: string; title: string; icon: React.ReactNode }[] = [
  { id: "fullscreen", label: "Full screen", title: "The words (Bible, songs, notes) fill the screen, no camera", icon: <Monitor size={16} /> },
  { id: "lower-third", label: "Lower third", title: "The words as a bar across the bottom, no camera", icon: <PanelBottom size={16} /> },
  { id: "camera", label: "Camera", title: "Just the camera, no words", icon: <Video size={16} /> },
  { id: "camera-lt", label: "Camera + lower third", title: "The camera with the words as a bar across the bottom", icon: <span className="st-lo__t2icons"><Video size={14} /><PanelBottom size={14} /></span> },
];

interface ScenePickerProps {
  /** The choice that matches what is set up now (none when it is a mix the picker doesn't offer). */
  active: StudioScene | null;
  onChoose: (scene: StudioScene) => void;
  /** Media / Docs: name of the "no camera" choice ("Media", "Document"); only it and Camera are offered. */
  fillLabel?: string;
}

/** The choices shown: all four, or the picture and the camera for Media / Docs. */
export function sceneChoices(fillLabel?: string): typeof SCENES {
  if (!fillLabel) return SCENES;
  return [
    { id: "fullscreen", label: fillLabel, title: `The ${fillLabel.toLowerCase()} fills the screen, no camera`, icon: <Monitor size={16} /> },
    { id: "camera", label: "Camera", title: "Just the camera", icon: <Video size={16} /> },
  ];
}

export default function ScenePicker({ active, onChoose, fillLabel }: ScenePickerProps) {
  const bindings = useShortcutBindings();
  const keyText = (scene: StudioScene) => {
    const combo = bindings[SCENE_SHORTCUT[scene]]?.[0];
    return combo ? ` (${comboLabel(combo)})` : "";
  };
  return (
    <div className="st-lo__tiles2 st-lo__tiles3" role="group" aria-label="What's on the screen">
      {sceneChoices(fillLabel).map((scene) => (
        <button
          key={scene.id}
          type="button"
          className={`st-lo__t${active === scene.id ? " is-on" : ""}`}
          aria-pressed={active === scene.id}
          title={`${scene.title}${keyText(scene.id)}`}
          onClick={() => onChoose(scene.id)}
        >
          {scene.icon}
          <span>{scene.label}</span>
        </button>
      ))}
    </div>
  );
}
