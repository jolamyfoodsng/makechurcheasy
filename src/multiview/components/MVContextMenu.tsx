/**
 * MVContextMenu.tsx — Right-click context menu for canvas regions
 *
 * Shows contextual actions: copy, paste, duplicate, delete,
 * lock/unlock, slot ordering, rename, alignment.
 */

import { useEffect, useRef } from "react";
import { useEditor } from "../editorStore";
import { shortcutLabel, SHORTCUT_MAP } from "../shortcuts";
import type { OBSSceneRegion, RegionId } from "../types";

interface ContextMenuProps {
  x: number;
  y: number;
  regionId: RegionId | null;
  onClose: () => void;
}

export function MVContextMenu({ x, y, regionId, onClose }: ContextMenuProps) {
  const { state, dispatch, deleteSelected, duplicateSelected, alignRegions, distributeRegions } = useEditor();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  // Focus first item on mount for keyboard navigation
  useEffect(() => {
    const firstItem = ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    firstItem?.focus();
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // Arrow key navigation within menu
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
        if (!items?.length) return;
        const current = document.activeElement;
        const idx = Array.from(items).indexOf(current as HTMLButtonElement);
        const next = e.key === "ArrowDown"
          ? (idx + 1) % items.length
          : (idx - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const regions = state.layout?.regions ?? [];
  const region = regionId ? regions.find((r) => r.id === regionId) : null;
  const isSelected = regionId ? state.selectedRegionIds.includes(regionId) : false;
  const hasSelection = state.selectedRegionIds.length > 0;
  const hasMultiSelection = state.selectedRegionIds.length >= 2;
  const isOBSScene = region?.type === "obs-scene" && !!(region as OBSSceneRegion).sceneName;

  // Content-aware label for remove action
  const isBible = region?.name?.startsWith("Bible:");
  const isWorship = region?.name?.startsWith("Worship:");
  const removeLabel = isBible ? "Remove Bible Theme" : isWorship ? "Remove Worship Theme" : "Remove Scene";
  const slotIndex = region ? regions.filter((r) => r.type === "obs-scene").sort((a, b) => a.zIndex - b.zIndex).findIndex((r) => r.id === region.id) + 1 : 0;

  const sc = (id: string) => {
    const def = SHORTCUT_MAP.get(id);
    return def ? shortcutLabel(def.keys) : "";
  };

  const action = (fn: () => void) => () => { fn(); onClose(); };

  // Clamp position to viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 10000,
  };

  return (
    <div ref={ref} className="mv-context-menu" style={style} role="menu" aria-label="Context menu">
      {region && !isSelected && (
        <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "SELECT_REGION", regionId: region.id, additive: false }))} title="Select">
          <span className="mv-ctx-label">Select "{region.name}"{slotIndex > 0 ? ` (Slot ${slotIndex})` : ""}</span>
        </button>
      )}

      {hasSelection && (
        <>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "COPY" }))} title="Copy">
            <span className="mv-ctx-label">Copy</span>
            <span className="mv-ctx-shortcut">{sc("copy")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => {
            dispatch({ type: "COPY" });
            dispatch({ type: "DELETE_REGIONS", regionIds: state.selectedRegionIds });
          })} title="Cut">
            <span className="mv-ctx-label">Cut</span>
            <span className="mv-ctx-shortcut">{sc("cut")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(duplicateSelected)} title="Duplicate">
            <span className="mv-ctx-label">Duplicate</span>
            <span className="mv-ctx-shortcut">{sc("duplicate")}</span>
          </button>
          <div className="mv-ctx-divider" />
        </>
      )}

      {state.clipboard.length > 0 && (
        <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "PASTE" }); })} title="Paste">
          <span className="mv-ctx-label">Paste</span>
          <span className="mv-ctx-shortcut">{sc("paste")}</span>
        </button>
      )}

      {hasSelection && (
        <>
          <div className="mv-ctx-divider" />
          <button className="mv-ctx-item" role="menuitem" onClick={action(deleteSelected)} title="mv-ctx-shortcut">
            <span className="mv-ctx-label">{isOBSScene ? removeLabel : "Delete"}</span>
            <span className="mv-ctx-shortcut">{sc("delete")}</span>
          </button>
        </>
      )}

      {region && isSelected && (
        <>
          <div className="mv-ctx-divider" />
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "TOGGLE_LOCK", regionId: region.id }))} title="mv-ctx-shortcut">
            <span className="mv-ctx-label">{region.locked ? "Unlock" : "Lock"}</span>
            <span className="mv-ctx-shortcut">{sc("lock-region")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "TOGGLE_VISIBILITY", regionId: region.id }))} title="mv-ctx-label">
            <span className="mv-ctx-label">{region.visible ? "Hide" : "Show"}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => {
            window.dispatchEvent(new CustomEvent("mv:rename-region", { detail: { regionId: region.id } }));
          })} title="Rename">
            <span className="mv-ctx-label">Rename</span>
            <span className="mv-ctx-shortcut">{sc("rename-region")}</span>
          </button>
        </>
      )}

      {region && isSelected && state.selectedRegionIds.length === 1 && (
        <>
          <div className="mv-ctx-divider" />
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "REORDER_REGION", regionId: region.id, direction: "top" }); })} title="Bring to Front">
            <span className="mv-ctx-label">Bring to Front</span>
            <span className="mv-ctx-shortcut">{sc("bring-to-front")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "REORDER_REGION", regionId: region.id, direction: "up" }); })} title="Bring Forward">
            <span className="mv-ctx-label">Bring Forward</span>
            <span className="mv-ctx-shortcut">{sc("bring-forward")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "REORDER_REGION", regionId: region.id, direction: "down" }); })} title="Send">
            <span className="mv-ctx-label">Send Backward</span>
            <span className="mv-ctx-shortcut">{sc("send-backward")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "REORDER_REGION", regionId: region.id, direction: "bottom" }); })} title="Go back">
            <span className="mv-ctx-label">Send to Back</span>
            <span className="mv-ctx-shortcut">{sc("send-to-back")}</span>
          </button>
        </>
      )}

      {hasMultiSelection && (
        <>
          <div className="mv-ctx-divider" />
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => alignRegions("left"))} title="Align Left">
            <span className="mv-ctx-label">Align Left</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => alignRegions("center-h"))} title="Align Center H">
            <span className="mv-ctx-label">Align Center H</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => alignRegions("right"))} title="Align Right">
            <span className="mv-ctx-label">Align Right</span>
          </button>
          {state.selectedRegionIds.length >= 3 && (
            <>
              <div className="mv-ctx-divider" />
              <button className="mv-ctx-item" role="menuitem" onClick={action(() => distributeRegions("horizontal"))} title="Distribute Horizontally">
                <span className="mv-ctx-label">Distribute Horizontally</span>
              </button>
              <button className="mv-ctx-item" role="menuitem" onClick={action(() => distributeRegions("vertical"))} title="Distribute Vertically">
                <span className="mv-ctx-label">Distribute Vertically</span>
              </button>
            </>
          )}
        </>
      )}

      {!hasSelection && !region && (
        <>
          {state.clipboard.length === 0 && (
            <div className="mv-ctx-item mv-ctx-item--disabled">
              <span className="mv-ctx-label" style={{ opacity: 0.4 }}>No selection</span>
            </div>
          )}
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "SELECT_ALL" }))} title="Select">
            <span className="mv-ctx-label">Select All</span>
            <span className="mv-ctx-shortcut">{sc("select-all")}</span>
          </button>
        </>
      )}
    </div>
  );
}
