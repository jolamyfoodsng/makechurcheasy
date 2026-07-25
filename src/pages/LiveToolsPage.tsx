import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import { getAllMedia } from "../library/libraryDb";
import type { MediaItem } from "../library/libraryTypes";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import { obsService } from "../services/obsService";
import { LIVE_TOOL_MOMENTS } from "../live-tools/liveToolDefaults";
import {
  getLiveToolTemplates,
  resetLiveToolTemplate,
  saveLiveToolTemplate,
} from "../live-tools/liveToolStore";
import { clearAllLiveTools, clearLiveToolTarget, sendLiveToolToObs } from "../live-tools/liveToolObsService";
import {
  LIVE_TOOL_MOMENT_DESCRIPTIONS,
  LIVE_TOOL_MOMENT_LABELS,
  type LiveToolMoment,
  type LiveToolTemplate,
} from "../live-tools/types";
import "../live-tools/liveTools.css";

type SendTarget = "preview" | "program";

interface ActionStatus {
  id: string;
  message: string;
  tone: "ok" | "error" | "info";
}

function getToolTone(tool: LiveToolTemplate): string {
  if (tool.moment === "emergency") return " live-tool-card--emergency";
  if (tool.kind === "countdown") return " live-tool-card--countdown";
  if (tool.kind === "media-loop") return " live-tool-card--media";
  return "";
}

function getMediaUrl(item: MediaItem): string {
  if (item.diskFileName) {
    return `${getOverlayBaseUrlSync()}/uploads/${encodeURIComponent(item.diskFileName)}`;
  }
  return item.url;
}

function applyMediaToTemplate(template: LiveToolTemplate, mediaId: string, media: MediaItem[]): LiveToolTemplate {
  const item = media.find((candidate) => candidate.id === mediaId);
  if (!item) {
    return {
      ...template,
      backgroundMediaId: undefined,
      backgroundMediaName: undefined,
      backgroundMediaPath: undefined,
      backgroundMediaUrl: undefined,
    };
  }

  return {
    ...template,
    backgroundMediaId: item.id,
    backgroundMediaName: item.name,
    backgroundMediaPath: item.filePath,
    backgroundMediaUrl: getMediaUrl(item),
  };
}

function canSelectMedia(tool: LiveToolTemplate): boolean {
  return tool.kind === "media-loop" || tool.kind === "fullscreen" || tool.kind === "countdown";
}

function getConfigurationMessage(tool: LiveToolTemplate): string {
  if (tool.kind === "scene" && !tool.sceneName) return "Choose an OBS scene in Edit.";
  if (tool.action === "safe-scene" && !tool.sceneName) return "Choose a safe scene in Edit.";
  if (tool.action === "mute-mic" && !tool.sourceName) return "Choose a mic source in Edit.";
  return "";
}

export default function LiveToolsPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<LiveToolTemplate[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [scenes, setScenes] = useState<string[]>([]);
  const [editing, setEditing] = useState<LiveToolTemplate | null>(null);
  const [draft, setDraft] = useState<LiveToolTemplate | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionStatus | null>(null);
  const [obsConnected, setObsConnected] = useState(() => obsService.isConnected);

  const reload = useCallback(async () => {
    const nextTemplates = await getLiveToolTemplates();
    setTemplates(nextTemplates);
    setMedia(await getAllMedia());
  }, []);

  const refreshScenes = useCallback(async () => {
    if (!obsService.isConnected) {
      setScenes([]);
      return;
    }
    const sceneList = await obsService.getSceneList();
    setScenes(sceneList.map((scene) => scene.sceneName));
  }, []);

  useEffect(() => {
    void reload();
    void refreshScenes();
  }, [refreshScenes, reload]);

  useEffect(() => {
    return obsService.onStatusChange((nextStatus) => {
      const connected = nextStatus === "connected";
      setObsConnected(connected);
      if (connected) {
        void refreshScenes();
      } else {
        setScenes([]);
      }
    });
  }, [refreshScenes]);

  const grouped = useMemo(() => {
    return LIVE_TOOL_MOMENTS.map((moment) => ({
      moment,
      templates: templates.filter((template) => template.moment === moment),
    }));
  }, [templates]);

  const handleSend = useCallback(async (tool: LiveToolTemplate, target: SendTarget) => {
    const key = `${tool.id}:${target}`;
    setSending(key);
    setStatus({ id: tool.id, message: target === "preview" ? t("liveTools.status.sendingPreview") : t("liveTools.status.sendingProgram"), tone: "info" });
    try {
      await sendLiveToolToObs(tool, target === "program");
      setStatus({
        id: tool.id,
        message: target === "preview" ? t("liveTools.status.sentPreview") : t("liveTools.status.sentProgram"),
        tone: "ok",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ id: tool.id, message, tone: "error" });
    } finally {
      setSending(null);
    }
  }, [t]);

  const handleClear = useCallback(async (target: "preview" | "program" | "all") => {
    setSending(`clear:${target}`);
    try {
      if (target === "all") {
        await clearAllLiveTools();
      } else {
        await clearLiveToolTarget(target === "program");
      }
      setStatus({ id: "clear", message: t("liveTools.status.cleared"), tone: "ok" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ id: "clear", message, tone: "error" });
    } finally {
      setSending(null);
    }
  }, [t]);

  const openEditor = useCallback((tool: LiveToolTemplate) => {
    setEditing(tool);
    setDraft({ ...tool });
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setDraft(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    const saved = await saveLiveToolTemplate(draft);
    setTemplates((current) => current.map((template) => template.id === saved.id ? { ...template, ...saved } : template));
    setStatus({ id: saved.id, message: t("liveTools.status.templateSaved"), tone: "ok" });
    closeEditor();
  }, [closeEditor, draft, t]);

  const handleReset = useCallback(async () => {
    if (!editing) return;
    await resetLiveToolTemplate(editing.id);
    await reload();
    setStatus({ id: editing.id, message: t("liveTools.status.templateReset"), tone: "ok" });
    closeEditor();
  }, [closeEditor, editing, reload, t]);

  return (
    <div className="app-page live-tools-page">
      <div className="app-page__inner live-tools-page__inner">
        <header className="app-page__header live-tools-hero">
          <div className="app-page__header-copy">
            <p className="app-page__eyebrow">{t("liveTools.hero.eyebrow")}</p>
            <h1 className="app-page__title">{t("liveTools.hero.title")}</h1>
            <p className="app-page__subtitle">
              {t("liveTools.hero.subtitle")}
            </p>
          </div>
          <div className="app-page__actions live-tools-actions">
            <span className={`app-chip${obsConnected ? " is-ok" : ""}`}>
              <Icon name={obsConnected ? "check_circle" : "error_outline"} size={14} />
              {obsConnected ? t("liveTools.hero.connected") : t("liveTools.hero.disconnected")}
            </span>
            <button
              type="button"
              className="live-tools-clear-btn"
              disabled={sending !== null}
              onClick={() => void handleClear("preview")}
              title={t("liveTools.tooltip.clearPreview")}>
              {t("liveTools.hero.clearPreview")}
            </button>
            <button
              type="button"
              className="live-tools-clear-btn live-tools-clear-btn--danger"
              disabled={sending !== null}
              onClick={() => void handleClear("all")}
              title={t("liveTools.tooltip.clearAll")}>
              {t("liveTools.hero.clearAll")}
            </button>
          </div>
        </header>

        {status && (
          <div className={`live-tools-status live-tools-status--${status.tone}`}>
            <Icon name={status.tone === "error" ? "error" : status.tone === "ok" ? "check_circle" : "pending"} size={14} />
            {status.message}
          </div>
        )}

        <div className="live-tools-sections">
          {grouped.map(({ moment, templates: momentTemplates }) => (
            <section className="live-tools-section" key={moment}>
              <div className="live-tools-section__head">
                <div>
                  <h2>{LIVE_TOOL_MOMENT_LABELS[moment as LiveToolMoment]}</h2>
                  <p>{LIVE_TOOL_MOMENT_DESCRIPTIONS[moment as LiveToolMoment]}</p>
                </div>
              </div>
              <div className="live-tools-grid">
                {momentTemplates.map((tool) => {
                  const previewKey = `${tool.id}:preview`;
                  const programKey = `${tool.id}:program`;
                  const configurationMessage = getConfigurationMessage(tool);
                  const disabled = !obsConnected || sending !== null || Boolean(configurationMessage);
                  return (
                    <article className={`live-tool-card${getToolTone(tool)}`} key={tool.id}>
                      <div className="live-tool-card__top">
                        <span className="live-tool-card__icon">
                          <Icon name={tool.icon} size={18} />
                        </span>
                        <span className="live-tool-card__kind">{tool.kind.replace("-", " ")}</span>
                      </div>
                      <div className="live-tool-card__copy">
                        <h3>{tool.label}</h3>
                        <p>{tool.description}</p>
                      </div>
                      <div className="live-tool-card__preview">
                        <strong>{tool.title}</strong>
                        {tool.subtitle && <span>{tool.subtitle}</span>}
                        {tool.backgroundMediaName && <em>{tool.backgroundMediaName}</em>}
                        {configurationMessage && <em>{configurationMessage}</em>}
                      </div>
                      <div className="live-tool-card__actions">
                        <button
                          type="button"
                          className="live-tool-btn live-tool-btn--preview"
                          disabled={disabled}
                          onClick={() => void handleSend(tool, "preview")}
                          title={t("liveTools.tooltip.previewTool")}>
                          {sending === previewKey ? t("liveTools.card.sending") : t("liveTools.card.preview")}
                        </button>
                        <button
                          type="button"
                          className="live-tool-btn live-tool-btn--program"
                          disabled={disabled}
                          onClick={() => void handleSend(tool, "program")}
                          title={t("liveTools.tooltip.sendProgram")}>
                          {sending === programKey ? t("liveTools.card.sending") : t("liveTools.card.program")}
                        </button>
                        <button
                          type="button"
                          className="live-tool-btn live-tool-btn--ghost"
                          onClick={() => openEditor(tool)}
                          title={t("liveTools.tooltip.editTool")}>
                          {t("liveTools.card.edit")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {editing && draft && (
        <div className="live-tools-modal-backdrop" onClick={closeEditor}>
          <div className="live-tools-modal" role="dialog" aria-modal="true" aria-label={t("liveTools.modal.editLabel")} onClick={(event) => event.stopPropagation()}>
            <div className="live-tools-modal__head">
              <div>
                <p>{t("liveTools.modal.heading")}</p>
                <h2>{editing.label}</h2>
              </div>
              <button type="button" className="live-tools-modal__close" onClick={closeEditor} aria-label={t("liveTools.tooltip.closeModal")} title={t("liveTools.tooltip.closeModal")}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="live-tools-form">
              <label>
                <span>{t("liveTools.modal.mainText")}</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </label>
              <label>
                <span>{t("liveTools.modal.secondaryText")}</span>
                <input
                  value={draft.subtitle ?? ""}
                  onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
                />
              </label>
              <label className="live-tools-form__wide">
                <span>{t("liveTools.modal.bodyDetails")}</span>
                <textarea
                  rows={4}
                  value={draft.body ?? ""}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </label>

              {draft.kind === "countdown" && (
                <label>
                  <span>{t("liveTools.modal.countdownDuration")}</span>
                  <input
                    type="number"
                    min={5}
                    max={7200}
                    step={5}
                    value={draft.durationSeconds ?? 300}
                    onChange={(event) => setDraft({ ...draft, durationSeconds: Number(event.target.value) || 300 })}
                  />
                </label>
              )}

              <label>
                <span>{t("liveTools.modal.backgroundColor")}</span>
                <input
                  type="color"
                  value={draft.backgroundColor ?? "#111827"}
                  onChange={(event) => setDraft({ ...draft, backgroundColor: event.target.value })}
                />
              </label>

              {canSelectMedia(draft) && (
                <label className="live-tools-form__wide">
                  <span>{t("liveTools.modal.backgroundMedia")}</span>
                  <select
                    value={draft.backgroundMediaId ?? ""}
                    onChange={(event) => setDraft(applyMediaToTemplate(draft, event.target.value, media))}
                  >
                    <option value="">{t("liveTools.modal.noMediaSelected")}</option>
                    {media.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {(draft.kind === "scene" || draft.action === "safe-scene") && (
                <label className="live-tools-form__wide">
                  <span>{t("liveTools.modal.obsScene")}</span>
                  <select
                    value={draft.sceneName ?? ""}
                    onChange={(event) => setDraft({ ...draft, sceneName: event.target.value })}
                  >
                    <option value="">{t("liveTools.modal.chooseScene")}</option>
                    {scenes.map((scene) => (
                      <option key={scene} value={scene}>{scene}</option>
                    ))}
                  </select>
                </label>
              )}

              {draft.action === "mute-mic" && (
                <label className="live-tools-form__wide">
                  <span>{t("liveTools.modal.micSourceName")}</span>
                  <input
                    value={draft.sourceName ?? ""}
                    onChange={(event) => setDraft({ ...draft, sourceName: event.target.value })}
                    placeholder={t("liveTools.modal.micSourcePlaceholder")}
                  />
                </label>
              )}
            </div>

            <div className="live-tools-modal__actions">
              <button type="button" className="live-tools-clear-btn" onClick={() => void handleReset()} title={t("liveTools.tooltip.resetDefault")}>
                {t("liveTools.modal.resetDefault")}
              </button>
              <div className="live-tools-modal__action-group">
                <button type="button" className="live-tool-btn live-tool-btn--ghost" onClick={closeEditor} title={t("liveTools.tooltip.cancelEdit")}>
                  {t("liveTools.modal.cancel")}
                </button>
                <button type="button" className="live-tool-btn live-tool-btn--program" onClick={() => void handleSave()} title={t("liveTools.tooltip.saveTool")}>
                  {t("liveTools.modal.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
