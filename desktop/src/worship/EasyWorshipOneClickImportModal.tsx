import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderDown,
  FolderOpen,
  Loader2,
  Music2,
  X,
} from "../components/icons/NativeIcons";
import { useAuth } from "../contexts/AuthContext";
import { getRemainingSongSlots } from "../services/licenseService";
import {
  ewBackgroundImporter,
  EW_IMPORT_COMPLETE_EVENT,
  EW_IMPORT_ERROR_EVENT,
  EW_IMPORT_PROGRESS_EVENT,
  findEasyWorshipLibraries,
  inspectEasyWorshipFolder,
  type EWImportProgress,
  type EWImportSummary,
  type EWLibrary,
} from "./easyWorshipBackgroundImporter";
import "./easyWorshipOneClickModal.css";

interface EasyWorshipOneClickImportModalProps {
  onClose: () => void;
  onImported?: () => void;
}

type Stage = "choose" | "running" | "completed";

export default function EasyWorshipOneClickImportModal({ onClose, onImported }: EasyWorshipOneClickImportModalProps) {
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>("choose");
  const [libraries, setLibraries] = useState<EWLibrary[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [checkingFolder, setCheckingFolder] = useState(false);
  const [progress, setProgress] = useState<EWImportProgress>({ stage: "Preparing…", percent: 0 });
  const [summary, setSummary] = useState<EWImportSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleProgress = (event: Event) => setProgress((event as CustomEvent<EWImportProgress>).detail);
    const handleComplete = (event: Event) => {
      setSummary((event as CustomEvent<EWImportSummary>).detail);
      setStage("completed");
      onImported?.();
    };
    const handleError = (event: Event) => {
      setError(String((event as CustomEvent<string>).detail || "The import stopped."));
      setStage("choose");
    };
    window.addEventListener(EW_IMPORT_PROGRESS_EVENT, handleProgress);
    window.addEventListener(EW_IMPORT_COMPLETE_EVENT, handleComplete);
    window.addEventListener(EW_IMPORT_ERROR_EVENT, handleError);

    // Opened again while an import runs (or after it finished in the background).
    const status = ewBackgroundImporter.getStatus();
    if (status === "importing") {
      setStage("running");
      setProgress(ewBackgroundImporter.getProgress());
    } else if (status === "completed" && ewBackgroundImporter.getLastSummary()) {
      setSummary(ewBackgroundImporter.getLastSummary());
      setStage("completed");
    }

    // Look for EasyWorship's libraries on this computer.
    let cancelled = false;
    void findEasyWorshipLibraries().then((found) => {
      if (cancelled) return;
      setLibraries(found);
      if (found.length > 0) setSelected((current) => current || found[0].dataDir);
    });
    return () => {
      cancelled = true;
      window.removeEventListener(EW_IMPORT_PROGRESS_EVENT, handleProgress);
      window.removeEventListener(EW_IMPORT_COMPLETE_EVENT, handleComplete);
      window.removeEventListener(EW_IMPORT_ERROR_EVENT, handleError);
    };
  }, [onImported]);

  const chooseFolder = async () => {
    setError("");
    const picked = await open({ directory: true, multiple: false, title: "Choose your EasyWorship folder" }).catch(() => null);
    if (!picked || Array.isArray(picked)) return;
    setCheckingFolder(true);
    try {
      const lib = await inspectEasyWorshipFolder(picked);
      setLibraries((current) => {
        const list = current ?? [];
        return list.some((l) => l.dataDir === lib.dataDir) ? list : [...list, lib];
      });
      setSelected(lib.dataDir);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingFolder(false);
    }
  };

  const chosen = libraries?.find((l) => l.dataDir === selected) ?? null;

  const startImport = async () => {
    if (!chosen) return;
    setError("");
    setStage("running");
    try {
      const slots = await getRemainingSongSlots(user ?? null).catch(() => Infinity);
      await ewBackgroundImporter.startImport(chosen, slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("choose");
    }
  };

  return createPortal(
    <div className="ew-import-backdrop" onMouseDown={onClose}>
      <div className="ew-import-modal" role="dialog" aria-modal="true" aria-labelledby="ew-import-title" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="ew-import-modal__close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {stage === "choose" && (
          <div className="ew-import-content">
            <div className="ew-import-icon-wrap">
              <FolderDown size={32} className="text-[#7d8a42]" />
            </div>
            <h2 id="ew-import-title" className="ew-import-title">Import songs from EasyWorship</h2>
            <p className="ew-import-subtitle">
              Brings in your EasyWorship 6 or 7 songs with their lyrics, authors and CCLI numbers. EasyWorship can stay open, and nothing in it is changed.
            </p>

            <div className="ew-library-list" role="radiogroup" aria-label="EasyWorship libraries">
              {libraries === null && (
                <p className="ew-library-empty"><Loader2 size={14} className="animate-spin" /> Looking for EasyWorship on this computer…</p>
              )}
              {libraries !== null && libraries.length === 0 && (
                <p className="ew-library-empty">
                  EasyWorship wasn’t found on this computer. Choose the folder that holds <strong>Songs.db</strong> and <strong>SongWords.db</strong> — for example a copy from your EasyWorship computer.
                </p>
              )}
              {libraries?.map((lib) => (
                <label key={lib.dataDir} className={`ew-library ${selected === lib.dataDir ? "is-selected" : ""}`}>
                  <input type="radio" name="ew-library" checked={selected === lib.dataDir} onChange={() => setSelected(lib.dataDir)} />
                  <Music2 size={18} className="ew-feature-icon" />
                  <span className="ew-library-text">
                    <strong>{lib.name} · {lib.songCount.toLocaleString()} {lib.songCount === 1 ? "song" : "songs"}</strong>
                    <span title={lib.dataDir}>{lib.dataDir}</span>
                  </span>
                </label>
              ))}
            </div>

            <button type="button" className="ew-btn ew-btn--secondary ew-choose-folder" onClick={() => void chooseFolder()} disabled={checkingFolder}>
              {checkingFolder ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
              <span>{checkingFolder ? "Checking the folder…" : "Choose folder…"}</span>
            </button>

            <p className="ew-import-note">
              Songs already in your library are skipped. Only songs and lyrics are imported: add pictures and videos from <strong>Media</strong>.
            </p>

            {error && <div className="ew-import-error" role="alert"><AlertCircle size={16} /> <span>{error}</span></div>}

            <div className="ew-import-actions">
              <button type="button" className="ew-btn ew-btn--secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="ew-btn ew-btn--primary" onClick={() => void startImport()} disabled={!chosen || chosen.songCount === 0}>
                <Download size={16} />
                <span>{chosen ? `Import ${chosen.songCount.toLocaleString()} ${chosen.songCount === 1 ? "song" : "songs"}` : "Import songs"}</span>
              </button>
            </div>
          </div>
        )}

        {stage === "running" && (
          <div className="ew-import-content">
            <div className="ew-import-icon-wrap spinning">
              <Loader2 size={32} className="text-[#7d8a42] animate-spin" />
            </div>
            <h2 id="ew-import-title" className="ew-import-title">Importing your songs…</h2>
            <p className="ew-import-subtitle">You can close this window and keep working. The import carries on in the background.</p>
            <div className="ew-import-progress-box">
              <div className="ew-progress-bar-wrap" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="ew-progress-bar-fill" style={{ width: `${Math.max(5, progress.percent)}%` }} />
              </div>
              <p className="ew-progress-stage-text">{progress.stage}</p>
            </div>
            <div className="ew-import-actions">
              <button type="button" className="ew-btn ew-btn--primary w-full" onClick={onClose}>Close (keeps importing)</button>
            </div>
          </div>
        )}

        {stage === "completed" && summary && (
          <div className="ew-import-content">
            <div className="ew-import-icon-wrap success">
              <CheckCircle2 size={36} className="text-emerald-500" />
            </div>
            <h2 id="ew-import-title" className="ew-import-title">
              {summary.importedCount > 0 ? "Songs imported" : "No new songs to import"}
            </h2>
            <p className="ew-import-subtitle">From “{summary.libraryName}” in EasyWorship.</p>
            <div className="ew-summary-grid">
              <div className="ew-summary-card">
                <span className="ew-summary-num">{summary.importedCount.toLocaleString()}</span>
                <span className="ew-summary-label">Added to your library</span>
              </div>
              <div className="ew-summary-card">
                <span className="ew-summary-num">{summary.alreadyInLibraryCount.toLocaleString()}</span>
                <span className="ew-summary-label">Already in your library</span>
              </div>
            </div>
            {summary.overLimitCount > 0 && (
              <p className="ew-import-note ew-import-note--warn">
                {summary.overLimitCount.toLocaleString()} more {summary.overLimitCount === 1 ? "song wasn’t" : "songs weren’t"} imported because your plan’s song limit was reached. Upgrade your plan, then import again: songs you already have are skipped.
              </p>
            )}
            <div className="ew-import-actions">
              <button type="button" className="ew-btn ew-btn--primary w-full" onClick={() => { ewBackgroundImporter.reset(); onClose(); }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
