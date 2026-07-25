/**
 * MVContextMenu.tsx — Right-click context menu for canvas regions
 *
 * Shows contextual actions: copy, paste, duplicate, delete,
 * lock/unlock, slot ordering, rename, alignment.
 */

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
  const removeLabel = isBible ? t("ctx.removeBibleTheme") : isWorship ? t("ctx.removeWorshipTheme") : t("ctx.removeScene");
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
    <div ref={ref} className="mv-context-menu" style={style} role="menu" aria-label={t("ctx.ariaLabel")}>
      {region && !isSelected && (
        <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "SELECT_REGION", regionId: region.id, additive: false }))} title={t("ctx.select")}>
          <span className="mv-ctx-label">{t("ctx.selectRegion", { name: region.name })}{slotIndex > 0 ? ` (${t("ctx.slot", { index: slotIndex })})` : ""}</span>
        </button>
      )}

      {hasSelection && (
        <>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "COPY" }))} title={t("ctx.copy")}>
            <span className="mv-ctx-label">{t("ctx.copy")}</span>
            <span className="mv-ctx-shortcut">{sc("copy")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => {
            dispatch({ type: "COPY" });
            dispatch({ type: "DELETE_REGIONS", regionIds: state.selectedRegionIds });
          })} title={t("ctx.cut")}>
            <span className="mv-ctx-label">{t("ctx.cut")}</span>
            <span className="mv-ctx-shortcut">{sc("cut")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(duplicateSelected)} title={t("ctx.duplicate")}>
            <span className="mv-ctx-label">{t("ctx.duplicate")}</span>
            <span className="mv-ctx-shortcut">{sc("duplicate")}</span>
          </button>
          <div className="mv-ctx-divider" />
        </>
      )}

      {state.clipboard.length > 0 && (
        <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "PASTE" }); })} title={t("ctx.paste")}>
          <span className="mv-ctx-label">{t("ctx.paste")}</span>
          <span className="mv-ctx-shortcut">{sc("paste")}</span>
        </button>
      )}

      {hasSelection && (
        <>
          <div className="mv-ctx-divider" />
          <button className="mv-ctx-item" role="menuitem" onClick={action(deleteSelected)} title={t("ctx.delete")}>
            <span className="mv-ctx-label">{isOBSScene ? removeLabel : t("ctx.delete")}</span>
            <span className="mv-ctx-shortcut">{sc("delete")}</span>
          </button>
        </>
      )}

      {region && isSelected && (
        <>
          <div className="mv-ctx-divider" />
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "TOGGLE_LOCK", regionId: region.id }))} title={region.locked ? t("ctx.unlock") : t("ctx.lock")}>
            <span className="mv-ctx-label">{region.locked ? t("ctx.unlock") : t("ctx.lock")}</span>
            <span className="mv-ctx-shortcut">{sc("lock-region")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "TOGGLE_VISIBILITY", regionId: region.id }))} title={region.visible ? t("ctx.hide") : t("ctx.show")}>
            <span className="mv-ctx-label">{region.visible ? t("ctx.hide") : t("ctx.show")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => {
            window.dispatchEvent(new CustomEvent("mv:rename-region", { detail: { regionId: region.id } }));
          })} title={t("ctx.rename")}>
            <span className="mv-ctx-label">{t("ctx.rename")}</span>
            <span className="mv-ctx-shortcut">{sc("rename-region")}</span>
          </button>
        </>
      )}

      {region && isSelected && state.selectedRegionIds.length === 1 && (
        <>
          <div className="mv-ctx-divider" />
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "REORDER_REGION", regionId: region.id, direction: "top" }); })} title={t("ctx.bringToFront")}>
            <span className="mv-ctx-label">{t("ctx.bringToFront")}</span>
            <span className="mv-ctx-shortcut">{sc("bring-to-front")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "REORDER_REGION", regionId: region.id, direction: "up" }); })} title={t("ctx.bringForward")}>
            <span className="mv-ctx-label">{t("ctx.bringForward")}</span>
            <span className="mv-ctx-shortcut">{sc("bring-forward")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "REORDER_REGION", regionId: region.id, direction: "down" }); })} title={t("ctx.sendBackward")}>
            <span className="mv-ctx-label">{t("ctx.sendBackward")}</span>
            <span className="mv-ctx-shortcut">{sc("send-backward")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => { dispatch({ type: "SNAPSHOT" }); dispatch({ type: "REORDER_REGION", regionId: region.id, direction: "bottom" }); })} title={t("ctx.sendToBack")}>
            <span className="mv-ctx-label">{t("ctx.sendToBack")}</span>
            <span className="mv-ctx-shortcut">{sc("send-to-back")}</span>
          </button>
        </>
      )}

      {hasMultiSelection && (
        <>
          <div className="mv-ctx-divider" />
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => alignRegions("left"))} title={t("ctx.alignLeft")}>
            <span className="mv-ctx-label">{t("ctx.alignLeft")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => alignRegions("center-h"))} title={t("ctx.alignCenterH")}>
            <span className="mv-ctx-label">{t("ctx.alignCenterH")}</span>
          </button>
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => alignRegions("right"))} title={t("ctx.alignRight")}>
            <span className="mv-ctx-label">{t("ctx.alignRight")}</span>
          </button>
          {state.selectedRegionIds.length >= 3 && (
            <>
              <div className="mv-ctx-divider" />
              <button className="mv-ctx-item" role="menuitem" onClick={action(() => distributeRegions("horizontal"))} title={t("ctx.distributeH")}>
                <span className="mv-ctx-label">{t("ctx.distributeH")}</span>
              </button>
              <button className="mv-ctx-item" role="menuitem" onClick={action(() => distributeRegions("vertical"))} title={t("ctx.distributeV")}>
                <span className="mv-ctx-label">{t("ctx.distributeV")}</span>
              </button>
            </>
          )}
        </>
      )}

      {!hasSelection && !region && (
        <>
          {state.clipboard.length === 0 && (
            <div className="mv-ctx-item mv-ctx-item--disabled">
              <span className="mv-ctx-label" style={{ opacity: 0.4 }}>{t("ctx.noSelection")}</span>
            </div>
          )}
          <button className="mv-ctx-item" role="menuitem" onClick={action(() => dispatch({ type: "SELECT_ALL" }))} title={t("ctx.selectAll")}>
            <span className="mv-ctx-label">{t("ctx.selectAll")}</span>
            <span className="mv-ctx-shortcut">{sc("select-all")}</span>
          </button>
        </>
      )}
    </div>
  );
}
