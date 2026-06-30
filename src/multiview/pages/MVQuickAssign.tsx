/**
 * MVQuickAssign.tsx — Quick scene assignment for multiview layouts
 *
 * Simplified flow: select scenes for each view, configure background,
 * and push to OBS preview with one click.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { MVLayout, LayoutId } from "../types";
import { getLayout, saveLayout } from "../mvStore";
import { obsService, type OBSScene } from "../../services/obsService";
import { pushLayoutToOBS } from "../mvObsService";
import Icon from "../../components/Icon";
import "../mv.css";

export function MVQuickAssign() {
  const { layoutId } = useParams<{ layoutId: string }>();
  const navigate = useNavigate();

  const [layout, setLayout] = useState<MVLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [obsScenes, setObsScenes] = useState<OBSScene[]>([]);
  const [obsConnected, setObsConnected] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Quick assign state
  const [sceneAssignments, setSceneAssignments] = useState<Record<string, string>>({});
  const [backgroundType, setBackgroundType] = useState<"color" | "image">("color");
  const [backgroundColor, setBackgroundColor] = useState("#0a0a14");

  const loadLayout = useCallback(async () => {
    if (!layoutId) return;
    setLoading(true);
    try {
      const loaded = await getLayout(layoutId as LayoutId);
      if (loaded) {
        setLayout(loaded);
        // Initialize scene assignments from existing layout
        const initialAssignments: Record<string, string> = {};
        loaded.regions.forEach((r) => {
          if (r.type === "obs-scene" && r.sceneName) {
            initialAssignments[r.id] = r.sceneName;
          }
        });
        setSceneAssignments(initialAssignments);
        // Initialize background
        if (loaded.background?.type === "image") {
          setBackgroundType("image");
        } else {
          setBackgroundColor(loaded.background?.color ?? "#0a0a14");
        }
      } else {
        setError("Layout not found");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load layout");
    } finally {
      setLoading(false);
    }
  }, [layoutId]);

  const loadObsScenes = useCallback(async () => {
    if (!obsConnected) return;
    try {
      const scenes = await obsService.getSceneList();
      setObsScenes(scenes);
    } catch {
      setObsScenes([]);
    }
  }, [obsConnected]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  useEffect(() => {
    const unsub = obsService.onStatusChange((status) => {
      setObsConnected(status === "connected");
    });
    if (obsService.isConnected) {
      setObsConnected(true);
    }
    return unsub;
  }, []);

  useEffect(() => {
    void loadObsScenes();
  }, [loadObsScenes]);

  const handleSceneChange = (regionId: string, sceneName: string) => {
    setSceneAssignments((prev) => ({ ...prev, [regionId]: sceneName }));
  };

  const handlePushToObs = useCallback(async () => {
    if (!layout) return;
    setPushing(true);
    setError(null);
    setSuccess(null);

    try {
      // Apply scene assignments to layout
      const updatedRegions = layout.regions.map((r) => {
        if (r.type === "obs-scene" && sceneAssignments[r.id]) {
          const sceneIndex = obsScenes.findIndex((s) => s.sceneName === sceneAssignments[r.id]);
          return {
            ...r,
            sceneName: sceneAssignments[r.id],
            sceneIndex: sceneIndex >= 0 ? sceneIndex : -1,
          };
        }
        return r;
      });

      // Apply background
      const updatedLayout: MVLayout = {
        ...layout,
        regions: updatedRegions,
        background: {
          ...layout.background,
          type: backgroundType,
          color: backgroundType === "color" ? backgroundColor : layout.background?.color ?? "#0a0a14",
        },
      };

      // Save layout
      await saveLayout(updatedLayout);

      // Push to OBS
      const result = await pushLayoutToOBS(updatedLayout, undefined, true, true);

      if (result.success) {
        setSuccess(`Pushed to "${result.sceneName}"`);
        setTimeout(() => {
          navigate("/multiview/dashboard");
        }, 1500);
      } else {
        setError(result.errors.join(", ") || "Push failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to push to OBS");
    } finally {
      setPushing(false);
    }
  }, [layout, sceneAssignments, backgroundType, backgroundColor, obsScenes, navigate]);

  if (loading) {
    return (
      <div className="mv-page mv-quick-assign-loading">
        <div className="loading-spinner" />
        <p>Loading layout...</p>
      </div>
    );
  }

  if (error && !layout) {
    return (
      <div className="mv-page mv-quick-assign-error">
        <Icon name="error_outline" size={48} style={{ color: "var(--error)" }} />
        <p>{error}</p>
        <button className="mv-btn mv-btn--primary" onClick={() => navigate("/multiview/dashboard")} title="Go back">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!layout) return null;

  // Get only OBS scene regions that need assignment
  const assignableRegions = layout.regions.filter((r) => r.type === "obs-scene");

  return (
    <div className="mv-page mv-quick-assign">
      <div className="mv-quick-assign-header">
        <button
          className="mv-btn mv-btn--ghost mv-btn--sm"
          onClick={() => navigate("/multiview/dashboard")}
          title="Back to Dashboard"
        >
          <Icon name="arrow_back" size={16} />
          Back
        </button>
        <div>
          <h1 className="mv-page-title">Quick Assign: {layout.name}</h1>
          <p className="mv-page-subtitle">Assign scenes to each view and push to OBS</p>
        </div>
      </div>

      <div className="mv-quick-assign-body">
        {/* Scene Assignment Section */}
        <section className="mv-quick-assign-section">
          <h2 className="mv-quick-assign-section-title">
            <Icon name="view_in_ar" size={20} />
            Scene Assignment
          </h2>

          {!obsConnected && (
            <div className="mv-quick-assign-warning">
              <Icon name="warning" size={16} />
              Connect to OBS to assign scenes
            </div>
          )}

          <div className="mv-quick-assign-grid">
            {assignableRegions.length === 0 ? (
              <p className="mv-quick-assign-empty">No scene slots in this layout</p>
            ) : (
              assignableRegions.map((region, index) => (
                <div key={region.id} className="mv-quick-assign-slot">
                  <label className="mv-field-label">
                    View {index + 1}: {region.slotLabel || region.name}
                  </label>
                  <select
                    className="mv-field-input mv-quick-assign-select"
                    value={sceneAssignments[region.id] ?? ""}
                    onChange={(e) => handleSceneChange(region.id, e.target.value)}
                    disabled={!obsConnected}
                  >
                    <option value="">-- Select Scene --</option>
                    {obsScenes
                      .filter((s) => s.sceneName && s.sceneName !== `MV: ${layout.name}`)
                      .map((scene) => (
                        <option key={scene.sceneName} value={scene.sceneName}>
                          {scene.sceneName}
                        </option>
                      ))}
                  </select>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Background Section */}
        <section className="mv-quick-assign-section">
          <h2 className="mv-quick-assign-section-title">
            <Icon name="wallpaper" size={20} />
            Background
          </h2>

          <div className="mv-quick-assign-bg-options">
            <button
              className={`mv-btn ${backgroundType === "color" ? "mv-btn--primary" : "mv-btn--ghost"}`}
              onClick={() => setBackgroundType("color")}
             title="Color">
              <Icon name="format_color_fill" size={16} />
              Color
            </button>
            <button
              className={`mv-btn ${backgroundType === "image" ? "mv-btn--primary" : "mv-btn--ghost"}`}
              onClick={() => setBackgroundType("image")}
              disabled={!obsConnected}
             title="Image">
              <Icon name="image" size={16} />
              Image
            </button>
          </div>

          {backgroundType === "color" && (
            <div className="mv-quick-assign-bg-color">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                style={{ width: "100%", height: 40, cursor: "pointer" }}
              />
            </div>
          )}

          {backgroundType === "image" && (
            <div className="mv-quick-assign-bg-image">
              <p className="mv-quick-assign-hint">
                <Icon name="info" size={14} />
                Background image can be set in the full editor. This layout will use the default background.
              </p>
            </div>
          )}
        </section>

        {/* Push Button */}
        <div className="mv-quick-assign-actions">
          {success && (
            <div className="mv-quick-assign-success">
              <Icon name="check_circle" size={16} />
              {success}
            </div>
          )}

          {error && (
            <div className="mv-quick-assign-error-msg">
              <Icon name="error" size={16} />
              {error}
            </div>
          )}

          <button
            className="mv-btn mv-btn--primary mv-quick-assign-push"
            onClick={() => void handlePushToObs()}
            disabled={pushing || !obsConnected}
           title="Sync">
            {pushing ? (
              <>
                <Icon name="sync" size={16} />
                Pushing...
              </>
            ) : (
              <>
                <Icon name="cast_connected" size={16} />
                Push to OBS Preview
              </>
            )}
          </button>

          <button
            className="mv-btn mv-btn--ghost mv-btn--sm"
            onClick={() => navigate(`/multiview/edit/${layoutId}`)}
           title="Open">
            <Icon name="open_in_full" size={14} />
            Open Full Editor
          </button>
        </div>
      </div>
    </div>
  );
}