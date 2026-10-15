/**
 * ShortcutsPanel.tsx — the "Keyboard shortcuts" tab of the Studio settings.
 * Every action with its key(s). Add a key, remove a key, put one back, or put them all back.
 * While a key is being recorded, the next key press is taken as the new shortcut (Esc cancels).
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Search, X } from "lucide-react";
import {
  SHORTCUT_DEFS,
  SHORTCUT_GROUPS,
  anyCustomised,
  comboLabel,
  comboParts,
  comboProblem,
  eventToCombo,
  findConflict,
  isCustomised,
  isMacPlatform,
  resetAllShortcuts,
  resetShortcut,
  setRecordingShortcut,
  setShortcut,
  shortcutDef,
  useShortcutBindings,
  type ShortcutId,
} from "../shortcuts";
import "./ShortcutsPanel.css";

interface Pending {
  id: ShortcutId;
  combo: string;
  other: ShortcutId;
}

function Keys({ combo, mac }: { combo: string; mac: boolean }) {
  const parts = comboParts(combo, mac);
  return (
    <span className="st-keys" aria-label={comboLabel(combo, mac)}>
      {parts.map((p, i) => (
        <kbd key={`${p}-${i}`}>{p}</kbd>
      ))}
    </span>
  );
}

export default function ShortcutsPanel() {
  const bindings = useShortcutBindings();
  const mac = useMemo(() => isMacPlatform(), []);
  const [filter, setFilter] = useState("");
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  // While recording, the next key press is the new shortcut.
  useEffect(() => {
    if (!recording) return undefined;
    setRecordingShortcut(true);
    const onKey = (e: KeyboardEvent) => {
      // Keep this key away from the Studio and from the dialog's own Esc.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.key === "Escape") {
        setRecording(null);
        setMessage("");
        return;
      }
      const combo = eventToCombo(e, mac);
      if (!combo) return; // only Ctrl / Alt / Shift so far
      const problem = comboProblem(combo);
      if (problem) {
        setMessage(problem);
        return;
      }
      const other = findConflict(bindings, recording, combo);
      if (other) {
        setPending({ id: recording, combo, other });
        setRecording(null);
        setMessage("");
        return;
      }
      setShortcut(recording, [...bindings[recording], combo]);
      setRecording(null);
      setMessage("");
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      setRecordingShortcut(false);
    };
  }, [recording, bindings, mac]);

  const startRecording = (id: ShortcutId) => {
    setPending(null);
    setMessage("");
    setRecording(id);
  };

  const replaceOther = () => {
    if (!pending) return;
    setShortcut(pending.other, bindings[pending.other].filter((c) => c !== pending.combo));
    setShortcut(pending.id, [...bindings[pending.id], pending.combo]);
    setPending(null);
  };

  const query = filter.trim().toLowerCase();
  const matches = (id: ShortcutId): boolean => {
    if (!query) return true;
    const def = shortcutDef(id);
    if (!def) return false;
    const keysText = bindings[id].map((c) => comboLabel(c, mac)).join(" ");
    return `${def.label} ${def.hint ?? ""} ${keysText}`.toLowerCase().includes(query);
  };

  const groups = SHORTCUT_GROUPS.map((group) => ({
    group,
    defs: SHORTCUT_DEFS.filter((d) => d.group === group && matches(d.id)),
  })).filter((g) => g.defs.length > 0);

  const otherDef = pending ? shortcutDef(pending.other) : undefined;

  return (
    <div className="st-sc">
      <div className="st-sc__bar">
        <label className="st-sc__search">
          <Search size={14} />
          <input
            type="search"
            value={filter}
            placeholder="Find an action or a key"
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Find a shortcut"
          />
        </label>
        <button type="button" className="studio-btn" onClick={() => { setPending(null); setRecording(null); resetAllShortcuts(); }} disabled={!anyCustomised()}>
          <RotateCcw size={13} /> Put all back
        </button>
      </div>

      <p className="st-set__hint">
        {mac ? "⌘ is the Command key." : "Ctrl is the Control key."} Plain letters are not shortcuts: typing anywhere starts a search. Your own keys are kept on this computer.
      </p>

      {groups.length === 0 && <p className="st-set__hint">Nothing matches “{filter}”.</p>}

      {groups.map(({ group, defs }) => (
        <section className="st-sc__group" key={group}>
          <h3>{group}</h3>
          {defs.map((def) => {
            const combos = bindings[def.id];
            const isRec = recording === def.id;
            return (
              <div key={def.id}>
              <div className={`st-sc__row${isRec ? " is-recording" : ""}`}>
                <div className="st-sc__name">
                  <span>{def.label}</span>
                  {def.hint && <small>{def.hint}</small>}
                </div>
                <div className="st-sc__keys">
                  {combos.length === 0 && !isRec && <em className="st-sc__none">No key</em>}
                  {combos.map((combo) => (
                    <span className="st-sc__chip" key={combo}>
                      <Keys combo={combo} mac={mac} />
                      <button
                        type="button"
                        className="st-sc__x"
                        aria-label={`Remove ${comboLabel(combo, mac)} from ${def.label}`}
                        title="Remove this key"
                        onClick={() => setShortcut(def.id, combos.filter((c) => c !== combo))}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  {isRec ? (
                    <span className="st-sc__listen" role="status">
                      {message || "Press the keys… (Esc to cancel)"}
                    </span>
                  ) : (
                    <button type="button" className="st-sc__add" onClick={() => startRecording(def.id)} title="Add a key">
                      <Plus size={12} /> {combos.length === 0 ? "Set a key" : "Add key"}
                    </button>
                  )}
                  {isCustomised(def.id) && !isRec && (
                    <button type="button" className="st-iconbtn st-sc__reset" onClick={() => resetShortcut(def.id)} aria-label={`Put back the usual key for ${def.label}`} title="Put back the usual key">
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              </div>
              {pending && otherDef && pending.id === def.id && (
                <div className="st-sc__notice" role="alert">
                  <span>
                    <Keys combo={pending.combo} mac={mac} /> is already used for “{otherDef.label}”. Use it here instead?
                  </span>
                  <span className="st-sc__notice-buttons">
                    <button type="button" className="studio-btn studio-btn--primary" onClick={replaceOther}>Use it here</button>
                    <button type="button" className="studio-btn" onClick={() => setPending(null)}>Cancel</button>
                  </span>
                </div>
              )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
