"use client";

import type { Countdown, BackgroundType, AnimationType, AutoAction } from "@/lib/countdowns/types";
import { FONT_FAMILIES, MOTION_BACKGROUNDS } from "@/lib/countdowns/types";

interface Props {
  countdown: Countdown;
  onUpdate: (updates: Partial<Countdown>) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
      </div>
    </Field>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <span className="text-xs text-slate-400 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; desc?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
            value === o.value
              ? "border-blue-500 bg-blue-50"
              : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <input
            type="radio"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 accent-blue-600"
          />
          <div>
            <span className="text-sm font-medium text-slate-900">{o.label}</span>
            {o.desc && <p className="text-xs text-slate-500 mt-0.5">{o.desc}</p>}
          </div>
        </label>
      ))}
    </div>
  );
}

// ─── Timer Settings ───────────────────────────────────────────────

function TimerSettings({ countdown, onUpdate }: Props) {
  const cd = countdown;
  return (
    <Section title="Timer">
      <RadioGroup
        value={cd.timerMode}
        onChange={(v) => onUpdate({ timerMode: v as "fixed" | "endAt" })}
        options={[
          { value: "fixed", label: "Fixed Duration", desc: "Set a specific countdown length" },
          { value: "endAt", label: "End At Specific Time", desc: "Count down to a time of day" },
        ]}
      />

      {cd.timerMode === "fixed" ? (
        <div className="grid grid-cols-3 gap-2">
          {[60, 300, 600, 900, 1800, 3600].map((sec) => (
            <button
              key={sec}
              onClick={() => onUpdate({ fixedDuration: sec, remainingSeconds: sec })}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                cd.fixedDuration === sec
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {sec < 60 ? `${sec}s` : sec < 3600 ? `${sec / 60}m` : `${sec / 3600}h`}
            </button>
          ))}
          <InputField
            label="Custom (seconds)"
            value={cd.fixedDuration}
            onChange={(v) => {
              const n = Number(v);
              if (!isNaN(n) && n > 0) onUpdate({ fixedDuration: n, remainingSeconds: n });
            }}
            type="number"
            min={1}
          />
        </div>
      ) : (
        <InputField
          label="Service Starts At"
          value={cd.endAtTime}
          onChange={(v) => onUpdate({ endAtTime: v })}
          type="time"
        />
      )}

      <div className="flex gap-3">
        <ToggleField label="Hours" checked={cd.showHours} onChange={(v) => onUpdate({ showHours: v })} />
        <ToggleField label="Minutes" checked={cd.showMinutes} onChange={(v) => onUpdate({ showMinutes: v })} />
        <ToggleField label="Seconds" checked={cd.showSeconds} onChange={(v) => onUpdate({ showSeconds: v })} />
      </div>
    </Section>
  );
}

// ─── Background Settings ─────────────────────────────────────────

function BackgroundSettings({ countdown, onUpdate }: Props) {
  const cd = countdown;
  const bg = cd.background;

  const updateBg = (updates: Partial<typeof bg>) => {
    onUpdate({ background: { ...bg, ...updates } });
  };

  return (
    <Section title="Background">
      <RadioGroup
        value={bg.type}
        onChange={(v) => updateBg({ type: v as BackgroundType })}
        options={[
          { value: "solid", label: "Solid Color" },
          { value: "gradient", label: "Gradient" },
          { value: "image", label: "Image" },
          { value: "video", label: "Video" },
          { value: "motion", label: "Motion Background" },
        ]}
      />

      {bg.type === "solid" && <ColorField label="Color" value={bg.color} onChange={(v) => updateBg({ color: v })} />}

      {bg.type === "gradient" && (
        <>
          <SliderField label="Angle" value={bg.gradientAngle} onChange={(v) => updateBg({ gradientAngle: v })} min={0} max={360} unit="°" />
          {bg.gradientStops.map((stop, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="color" value={stop.color} onChange={(e) => {
                const stops = [...bg.gradientStops];
                stops[i] = { ...stops[i], color: e.target.value };
                updateBg({ gradientStops: stops });
              }} className="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0.5" />
              <input type="range" value={stop.position} onChange={(e) => {
                const stops = [...bg.gradientStops];
                stops[i] = { ...stops[i], position: Number(e.target.value) };
                updateBg({ gradientStops: stops });
              }} min={0} max={100} className="flex-1 h-1.5 accent-blue-600" />
              <span className="text-xs text-slate-400 w-8">{stop.position}%</span>
            </div>
          ))}
        </>
      )}

      {bg.type === "image" && (
        <>
          <Field label="Image URL">
            <input
              type="url"
              value={bg.imageUrl}
              onChange={(e) => updateBg({ imageUrl: e.target.value })}
              placeholder="https://..."
              className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </Field>
          <SliderField label="Blur" value={bg.blur} onChange={(v) => updateBg({ blur: v })} min={0} max={20} unit="px" />
          <SliderField label="Brightness" value={bg.brightness} onChange={(v) => updateBg({ brightness: v })} min={10} max={200} unit="%" />
          <SliderField label="Overlay" value={bg.overlayOpacity} onChange={(v) => updateBg({ overlayOpacity: v })} min={0} max={100} unit="%" />
          <SliderField label="Zoom" value={bg.zoom} onChange={(v) => updateBg({ zoom: v })} min={50} max={200} unit="%" />
        </>
      )}

      {bg.type === "video" && (
        <Field label="Video URL">
          <input
            type="url"
            value={bg.videoUrl}
            onChange={(e) => updateBg({ videoUrl: e.target.value })}
            placeholder="https://..."
            className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </Field>
      )}

      {bg.type === "motion" && (
        <SelectField
          label="Motion Style"
          value={bg.imageUrl}
          onChange={(v) => updateBg({ imageUrl: v })}
          options={MOTION_BACKGROUNDS.map((m) => ({ value: m.id, label: m.name }))}
        />
      )}
    </Section>
  );
}

// ─── Text Settings ───────────────────────────────────────────────

function TextSettings({ countdown, onUpdate }: Props) {
  const cd = countdown;
  const text = cd.text;

  const updateText = (updates: Partial<typeof text>) => {
    onUpdate({ text: { ...text, ...updates } });
  };

  return (
    <Section title="Text">
      <InputField label="Title" value={text.title} onChange={(v) => updateText({ title: v })} placeholder="Service Starts Soon" />
      <InputField label="Subtitle" value={text.subtitle} onChange={(v) => updateText({ subtitle: v })} placeholder="Welcome to Worship" />

      <SelectField
        label="Font Family"
        value={text.fontFamily}
        onChange={(v) => updateText({ fontFamily: v })}
        options={FONT_FAMILIES.map((f) => ({ value: f, label: f }))}
      />

      <SelectField
        label="Font Weight"
        value={String(text.fontWeight)}
        onChange={(v) => updateText({ fontWeight: Number(v) })}
        options={[
          { value: "300", label: "Light" },
          { value: "400", label: "Regular" },
          { value: "500", label: "Medium" },
          { value: "600", label: "Semi Bold" },
          { value: "700", label: "Bold" },
          { value: "800", label: "Extra Bold" },
          { value: "900", label: "Black" },
        ]}
      />

      <SliderField label="Font Size" value={text.fontSize} onChange={(v) => updateText({ fontSize: v })} min={12} max={120} unit="px" />
      <SliderField label="Letter Spacing" value={text.letterSpacing} onChange={(v) => updateText({ letterSpacing: v })} min={-5} max={20} unit="px" />
      <SliderField label="Line Height" value={text.lineHeight} onChange={(v) => updateText({ lineHeight: v })} min={0.8} max={2.5} step={0.1} />

      <ColorField label="Text Color" value={text.color} onChange={(v) => updateText({ color: v })} />
      <ColorField label="Shadow Color" value={text.shadowColor} onChange={(v) => updateText({ shadowColor: v })} />
      <SliderField label="Shadow Blur" value={text.shadowBlur} onChange={(v) => updateText({ shadowBlur: v })} min={0} max={30} unit="px" />
    </Section>
  );
}

// ─── Animation Settings ──────────────────────────────────────────

function AnimationSettings({ countdown, onUpdate }: Props) {
  const cd = countdown;
  const anim = cd.animation;

  const updateAnim = (updates: Partial<typeof anim>) => {
    onUpdate({ animation: { ...anim, ...updates } });
  };

  const animOptions = [
    { value: "none", label: "None" },
    { value: "fadeIn", label: "Fade In" },
    { value: "slideUp", label: "Slide Up" },
    { value: "scale", label: "Scale" },
    { value: "pulse", label: "Pulse" },
    { value: "breathing", label: "Breathing" },
  ];

  return (
    <Section title="Animation">
      <SelectField label="Text Animation" value={anim.textAnimation} onChange={(v) => updateAnim({ textAnimation: v as AnimationType })} options={animOptions} />
      <SelectField label="Ring Animation" value={anim.ringAnimation} onChange={(v) => updateAnim({ ringAnimation: v as AnimationType })} options={animOptions} />
      <SelectField label="Background Animation" value={anim.backgroundAnimation} onChange={(v) => updateAnim({ backgroundAnimation: v as AnimationType })} options={animOptions} />
      <SliderField label="Speed" value={anim.speed} onChange={(v) => updateAnim({ speed: v })} min={0.25} max={3} step={0.25} unit="x" />
    </Section>
  );
}

// ─── OBS Settings ────────────────────────────────────────────────

function OBSSettings({ countdown, onUpdate }: Props) {
  const cd = countdown;
  const obs = cd.obs;

  const updateObs = (updates: Partial<typeof obs>) => {
    onUpdate({ obs: { ...obs, ...updates } });
  };

  return (
    <Section title="OBS Integration">
      <ToggleField label="Enable OBS Source" checked={obs.enabled} onChange={(v) => updateObs({ enabled: v })} />
      <InputField label="Source Name" value={obs.sourceName} onChange={(v) => updateObs({ sourceName: v })} placeholder="MCE Countdown" />

      <Field label="When Countdown Reaches Zero">
        <select
          value={obs.autoAction}
          onChange={(e) => updateObs({ autoAction: e.target.value as AutoAction })}
          className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          <option value="none">Do Nothing</option>
          <option value="switchScene">Switch OBS Scene</option>
          <option value="hideCountdown">Hide Countdown</option>
          <option value="showWelcome">Show Welcome Graphic</option>
          <option value="playVideo">Play Video</option>
        </select>
      </Field>

      {obs.autoAction === "switchScene" && (
        <InputField label="Scene Name" value={obs.sceneName} onChange={(v) => updateObs({ sceneName: v })} placeholder="Main Scene" />
      )}
    </Section>
  );
}

// ─── Exported Settings Panel ─────────────────────────────────────

export type SettingsTab = "timer" | "background" | "text" | "animation" | "obs";

const SETTINGS_TABS: { key: SettingsTab; label: string; icon: string }[] = [
  { key: "timer", label: "Timer", icon: "⏱" },
  { key: "background", label: "Background", icon: "🎨" },
  { key: "text", label: "Text", icon: "Aa" },
  { key: "animation", label: "Animation", icon: "✨" },
  { key: "obs", label: "OBS", icon: "📡" },
];

export default function CountdownSettings({ countdown, onUpdate, activeTab, onTabChange }: Props & { activeTab: SettingsTab; onTabChange: (t: SettingsTab) => void }) {
  return (
    <div>
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-h-[calc(100vh-340px)] overflow-y-auto pr-1">
        {activeTab === "timer" && <TimerSettings countdown={countdown} onUpdate={onUpdate} />}
        {activeTab === "background" && <BackgroundSettings countdown={countdown} onUpdate={onUpdate} />}
        {activeTab === "text" && <TextSettings countdown={countdown} onUpdate={onUpdate} />}
        {activeTab === "animation" && <AnimationSettings countdown={countdown} onUpdate={onUpdate} />}
        {activeTab === "obs" && <OBSSettings countdown={countdown} onUpdate={onUpdate} />}
      </div>
    </div>
  );
}
