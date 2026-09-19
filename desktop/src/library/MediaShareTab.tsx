import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import Icon from "../components/Icon";
import { MediaReceiverPanel } from "./MediaTab";
import {
  discoverLocalShareDevices,
  formatLocalShareFileSize,
  getLocalShareFileMetadata,
  getLocalShareInfo,
  saveLocalShareTempFile,
  sendLocalShareFiles,
  type LocalShareDevice,
  type LocalShareFileInput,
  type LocalShareFileMetadata,
  type LocalShareProgress,
} from "../services/localShareService";

type ShareMode = "send" | "receive";

interface MediaShareTabProps {
  initialMode?: ShareMode;
  onMediaChanged: () => void;
}

interface SelectedShareFile extends LocalShareFileMetadata {
  temporary?: boolean;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function fileId(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function mergeShareFiles(current: SelectedShareFile[], incoming: SelectedShareFile[]): SelectedShareFile[] {
  const byPath = new Map(current.map((file) => [file.filePath, file]));
  for (const file of incoming) byPath.set(file.filePath, file);
  return Array.from(byPath.values());
}

export function MediaShareTab({ initialMode = "send", onMediaChanged }: MediaShareTabProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ShareMode>(initialMode);
  const [localInfo, setLocalInfo] = useState<LocalShareDevice | null>(null);
  const [devices, setDevices] = useState<LocalShareDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<LocalShareDevice | null>(null);
  const [files, setFiles] = useState<SelectedShareFile[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [progress, setProgress] = useState<LocalShareProgress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshDevices = useCallback(async () => {
    if (!isTauriRuntime()) {
      setStatus({ tone: "error", message: t("library.share.desktopOnly") });
      return;
    }

    setDiscovering(true);
    try {
      const [info, nearby] = await Promise.all([
        getLocalShareInfo(),
        discoverLocalShareDevices(),
      ]);
      setLocalInfo(info);
      setDevices(nearby);
      setSelectedDevice((current) => current && nearby.some((device) => device.fingerprint === current.fingerprint)
        ? nearby.find((device) => device.fingerprint === current.fingerprint) ?? current
        : null);
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : t("library.share.discoveryFailed"),
      });
    } finally {
      setDiscovering(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshDevices();
    const timer = window.setInterval(() => void refreshDevices(), 7000);
    return () => window.clearInterval(timer);
  }, [refreshDevices]);

  const addNativeFiles = useCallback(async () => {
    setSelecting(true);
    setStatus(null);
    try {
      const selection = await open({
        multiple: true,
        directory: false,
        title: t("library.share.chooseFiles"),
      });
      const paths = Array.isArray(selection) ? selection : selection ? [selection] : [];
      if (paths.length === 0) return;
      const metadata = await getLocalShareFileMetadata(paths);
      setFiles((current) => mergeShareFiles(current, metadata));
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : t("library.share.filePickerFailed"),
      });
    } finally {
      setSelecting(false);
    }
  }, [t]);

  const addBrowserFiles = useCallback(async (browserFiles: File[]) => {
    if (browserFiles.length === 0) return;
    if (!isTauriRuntime()) {
      setStatus({ tone: "error", message: t("library.share.desktopOnly") });
      return;
    }

    setSelecting(true);
    setStatus(null);
    try {
      const next: SelectedShareFile[] = [];
      for (const file of browserFiles) {
        const path = await saveLocalShareTempFile(file);
        next.push({
          id: fileId(file),
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          filePath: path,
          temporary: true,
        });
      }
      setFiles((current) => mergeShareFiles(current, next));
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : t("library.share.prepareFileFailed"),
      });
    } finally {
      setSelecting(false);
    }
  }, [t]);

  const handleSend = useCallback(async () => {
    if (!selectedDevice || files.length === 0 || sending) return;
    setSending(true);
    setProgress(null);
    setStatus(null);

    const input: LocalShareFileInput[] = files.map((file) => ({
      filePath: file.filePath,
      fileName: file.fileName,
      fileType: file.fileType,
      temporary: file.temporary,
    }));

    try {
      const sent = await sendLocalShareFiles(selectedDevice, input, setProgress);
      setFiles([]);
      setProgress(null);
      setStatus({
        tone: "success",
        message: t("library.share.sentSuccess", { count: sent.length, device: selectedDevice.alias }),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : t("library.share.sendFailed"),
      });
    } finally {
      setSending(false);
    }
  }, [files, selectedDevice, sending, t]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void addBrowserFiles(Array.from(event.dataTransfer.files || []));
  }, [addBrowserFiles]);

  return (
    <section className="lib-media-share" aria-labelledby="lib-media-share-title">
      <header className="lib-media-share__header">
        <div>
          <div className="lib-media-share__eyebrow">{t("library.share.eyebrow")}</div>
          <h2 id="lib-media-share-title">{t("library.share.title")}</h2>
          <p>{t("library.share.description")}</p>
        </div>
        <div className="lib-media-share__network-status" role="status">
          <span className="lib-media-share__network-dot" aria-hidden="true" />
          <span>{localInfo ? t("library.share.networkReady") : t("library.share.networkChecking")}</span>
        </div>
      </header>

      <div className="lib-media-share__mode-tabs" role="tablist" aria-label={t("library.share.modes")}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "send"}
          className={`lib-media-share__mode-btn${mode === "send" ? " is-active" : ""}`}
          onClick={() => { setMode("send"); setStatus(null); }}
        >
          <Icon name="send" size={17} />
          <span>{t("library.share.sendTab")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "receive"}
          className={`lib-media-share__mode-btn${mode === "receive" ? " is-active" : ""}`}
          onClick={() => { setMode("receive"); setStatus(null); }}
        >
          <Icon name="move_to_inbox" size={17} />
          <span>{t("library.share.receiveTab")}</span>
        </button>
      </div>

      {status && (
        <div className={`lib-media-share__status lib-media-share__status--${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>
          <Icon name={status.tone === "error" ? "error" : "check_circle"} size={17} />
          <span>{status.message}</span>
        </div>
      )}

      {mode === "send" ? (
        <div className="lib-media-share__send-layout">
          <div className="lib-media-share__selection">
            <div className="lib-media-share__section-heading">
              <div>
                <span className="lib-media-share__section-kicker">{t("library.share.selectionKicker")}</span>
                <h3>{t("library.share.selectionTitle")}</h3>
              </div>
              <span className="lib-media-share__count">{files.length}</span>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                const next = Array.from(event.target.files || []);
                void addBrowserFiles(next);
                event.currentTarget.value = "";
              }}
            />

            <div
              className={`lib-media-share__dropzone${selecting ? " is-busy" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="lib-media-share__dropzone-icon"><Icon name="cloud_upload" size={27} /></div>
              <strong>{t("library.share.dropTitle")}</strong>
              <span>{t("library.share.dropDescription")}</span>
              <div className="lib-media-share__selection-actions">
                <button type="button" className="lib-share-button lib-share-button--primary" onClick={() => void addNativeFiles()} disabled={selecting || sending}>
                  <Icon name="folder" size={16} />
                  {selecting ? t("library.share.preparing") : t("library.share.chooseFiles")}
                </button>
                <button type="button" className="lib-share-button lib-share-button--secondary" onClick={() => inputRef.current?.click()} disabled={selecting || sending}>
                  <Icon name="upload_file" size={16} />
                  {t("library.share.browserFiles")}
                </button>
              </div>
            </div>

            {files.length > 0 ? (
              <div className="lib-media-share__file-list" aria-label={t("library.share.selectedFiles")}>
                {files.map((file) => (
                  <div className="lib-media-share__file-row" key={file.filePath}>
                    <span className="lib-media-share__file-icon"><Icon name={file.fileType.startsWith("video/") ? "movie" : file.fileType.startsWith("image/") ? "image" : "insert_drive_file"} size={17} /></span>
                    <span className="lib-media-share__file-copy">
                      <strong title={file.fileName}>{file.fileName}</strong>
                      <small>{formatLocalShareFileSize(file.fileSize)}</small>
                    </span>
                    <button type="button" className="lib-media-share__remove" onClick={() => setFiles((current) => current.filter((item) => item.filePath !== file.filePath))} disabled={sending} aria-label={`${t("common.remove")} ${file.fileName}`} title={t("common.remove")}>
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="lib-media-share__selection-empty">
                <Icon name="insert_drive_file" size={18} />
                <span>{t("library.share.noFiles")}</span>
              </div>
            )}
          </div>

          <div className="lib-media-share__devices">
            <div className="lib-media-share__section-heading">
              <div>
                <span className="lib-media-share__section-kicker">{t("library.share.nearbyKicker")}</span>
                <h3>{t("library.share.nearbyTitle")}</h3>
              </div>
              <button type="button" className="lib-icon-btn" onClick={() => void refreshDevices()} disabled={discovering} aria-label={t("library.share.refreshDevices")} title={t("library.share.refreshDevices")}>
                <Icon name="refresh" size={17} className={discovering ? "spin" : ""} />
              </button>
            </div>

            <div className="lib-media-share__local-card">
              <span className="lib-media-share__local-icon"><Icon name="monitor" size={19} /></span>
              <span>
                <strong>{localInfo?.alias || t("library.share.thisComputer")}</strong>
                <small>{localInfo ? `${localInfo.host}:${localInfo.port}` : t("library.share.waitingForNetwork")}</small>
              </span>
              <span className="lib-media-share__local-badge">{t("library.share.thisComputerBadge")}</span>
            </div>

            {devices.length === 0 ? (
              <div className="lib-media-share__devices-empty">
                <div className="lib-media-share__devices-empty-icon"><Icon name="wifi" size={27} /></div>
                <strong>{discovering ? t("library.share.scanning") : t("library.share.noDevices")}</strong>
                <p>{t("library.share.noDevicesDescription")}</p>
                {!discovering && <button type="button" className="lib-share-link" onClick={() => void refreshDevices()}>{t("library.share.scanAgain")}</button>}
              </div>
            ) : (
              <div className="lib-media-share__device-list" aria-label={t("library.share.nearbyTitle")}>
                {devices.map((device) => {
                  const selected = selectedDevice?.fingerprint === device.fingerprint;
                  return (
                    <button
                      type="button"
                      className={`lib-media-share__device-card${selected ? " is-selected" : ""}`}
                      key={device.fingerprint}
                      aria-pressed={selected}
                      onClick={() => setSelectedDevice(device)}
                    >
                      <span className="lib-media-share__device-icon"><Icon name="monitor" size={20} /></span>
                      <span className="lib-media-share__device-copy">
                        <strong>{device.alias}</strong>
                        <small>{t("library.share.desktopOnNetwork", { host: device.host })}</small>
                      </span>
                      {selected && <Icon name="check_circle" size={19} className="lib-media-share__selected-icon" />}
                    </button>
                  );
                })}
              </div>
            )}

            {progress && sending && (
              <div className="lib-media-share__progress" role="status" aria-live="polite">
                <div className="lib-media-share__progress-copy">
                  <span>{t("library.share.sendingFile", { file: progress.fileName })}</span>
                  <strong>{progress.completedFiles}/{progress.totalFiles}</strong>
                </div>
                <div className="lib-media-share__progress-track"><span style={{ width: `${progress.totalBytes > 0 ? Math.min(100, (progress.bytesSent / progress.totalBytes) * 100) : 0}%` }} /></div>
              </div>
            )}

            <button type="button" className="lib-share-button lib-share-button--send" onClick={() => void handleSend()} disabled={!selectedDevice || files.length === 0 || sending || discovering}>
              <Icon name="send" size={17} />
              {sending
                ? t("library.share.sending")
                : t(files.length === 1 ? "library.share.sendFiles" : "library.share.sendFilesPlural", { count: files.length })}
            </button>
          </div>
        </div>
      ) : (
        <MediaReceiverPanel
          visible
          onPendingCountChange={() => {}}
          onIncomingFile={() => {}}
          onMediaChanged={onMediaChanged}
        />
      )}
    </section>
  );
}
