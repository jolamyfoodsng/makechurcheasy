const FONT_IMPORTS = [
    "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap",
];

const DEFAULT_ANIMATION = {
    name: "fadeInUp",
    duration: 650,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

const SHARED_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Montserrat", sans-serif; }

.b-lt {
  position: fixed;
  z-index: 80;
  pointer-events: none;
  color: #ffffff;
}

.b-pos-bottom-wide { left: 34px; right: 34px; bottom: 30px; }
.b-pos-bottom-left { left: 46px; right: 130px; bottom: 44px; }

.b-shell {
  position: relative;
  overflow: hidden;
  background: rgba(19, 21, 27, 0.95);
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 12px 34px rgba(0,0,0,.36);
}

.b-topline {
  height: 9px;
  background: linear-gradient(90deg, #0dc18d, #13d49b);
}

.b-content {
  padding: 14px 20px 16px;
}

.b-verse {
  font-size: clamp(19px, 1.45vw, 34px);
  line-height: 1.16;
  font-weight: 600;
  letter-spacing: .002em;
  color: #f4f5f7;
}

.b-ref-right {
  margin-top: 9px;
  text-align: right;
  font-size: clamp(15px, 1.04vw, 26px);
  font-weight: 800;
  letter-spacing: .03em;
  text-transform: uppercase;
}

.b-soft {
  border-radius: 2px;
}

.b-soft .b-content {
  padding: 13px 19px 15px;
}

.b-minimal {
  max-width: min(1320px, calc(100vw - 92px));
  background: linear-gradient(90deg, rgba(8,20,55,.78), rgba(6,16,42,.56));
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 0;
  padding: 16px 20px;
  box-shadow: 0 10px 28px rgba(0,0,0,.34);
}

.b-kicker {
  color: #f7b718;
  font-size: clamp(19px, 1.44vw, 34px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: .01em;
}

.b-min-text {
  margin-top: 8px;
  font-size: clamp(23px, 1.9vw, 42px);
  line-height: 1.1;
  font-weight: 700;
  color: #ffffff;
}

.b-pp {
  max-width: min(1700px, calc(100vw - 70px));
}

.b-pp-shell {
  background: #f8f9fc;
  color: #0f172a;
  border: 0;
  border-radius: 2px;
  padding: 34px 28px 24px;
  transform: rotate(-2deg);
  overflow: visible;
  box-shadow: 0 14px 36px rgba(0,0,0,.36);
}

.b-pp-shell::before,
.b-pp-shell::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 34px;
  background: linear-gradient(180deg, #31d1ef 0%, #16a8d3 100%);
}

.b-pp-shell::before {
  left: -18px;
  transform: skewY(-6deg);
}

.b-pp-shell::after {
  right: -18px;
  transform: skewY(6deg);
}

.b-pp-label {
  position: absolute;
  left: 22px;
  top: -26px;
  background: #ff1735;
  color: #ffffff;
  border-radius: 2px;
  padding: 8px 16px;
  font-size: clamp(18px, 1.25vw, 30px);
  font-weight: 800;
  letter-spacing: .02em;
  text-transform: uppercase;
  box-shadow: 0 8px 20px rgba(255,23,53,.35);
}

.b-pp-verse {
  font-size: clamp(22px, 1.65vw, 38px);
  line-height: 1.15;
  font-weight: 600;
  letter-spacing: .003em;
  color: #111827;
}

.b-rib {
  max-width: min(1860px, calc(100vw - 60px));
}

.b-rib-tag {
  position: absolute;
  left: 0;
  top: -52px;
  background: #ffffff;
  color: #1f2937;
  border-radius: 1px;
  padding: 10px 24px 11px;
  font-size: clamp(22px, 1.45vw, 34px);
  letter-spacing: .26em;
  text-transform: uppercase;
  font-weight: 500;
  box-shadow: 0 10px 24px rgba(0,0,0,.18);
}

.b-rib-shell {
  background: #c70f33;
  border: 0;
  border-radius: 1px;
  padding: 22px 170px 20px 26px;
  clip-path: polygon(0 0, 97.2% 0, 100% 50%, 97.2% 100%, 0 100%);
  overflow: visible;
  box-shadow: 0 14px 34px rgba(0,0,0,.34);
}

.b-rib-verse {
  font-size: clamp(24px, 1.75vw, 42px);
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: .004em;
  color: #f7f7f8;
}

.b-rib-num {
  font-size: .6em;
  line-height: 1;
  margin-right: 8px;
  font-weight: 700;
  opacity: .86;
}

.b-rib-ref {
  margin-top: 10px;
  text-align: right;
  font-size: clamp(18px, 1.25vw, 30px);
  line-height: 1;
  text-transform: none;
  letter-spacing: .01em;
  font-weight: 800;
  color: #f4f5f7;
}

.b-rib-mark {
  position: absolute;
  right: 16px;
  top: 50%;
  width: 86px;
  height: 150px;
  transform: translateY(-50%);
  pointer-events: none;
  opacity: .9;
}

.b-rib-mark::before,
.b-rib-mark::after {
  content: "";
  position: absolute;
  border: 9px solid rgba(208,212,218,.86);
  border-left-color: transparent;
  border-bottom-color: transparent;
  border-radius: 48px;
}

.b-rib-mark::before {
  inset: 4px 18px 4px 6px;
  transform: rotate(34deg);
}

.b-rib-mark::after {
  inset: 22px 4px 22px 28px;
  transform: rotate(34deg);
}

/* Additional Bible lower-third styles */
.b-ink-shell {
  max-width: min(1660px, calc(100vw - 60px));
  border-left: 7px solid #0ea5e9;
  background: linear-gradient(90deg, rgba(10, 21, 44, 0.96), rgba(20, 29, 51, 0.94));
}

.b-ink-inner {
  padding: 16px 20px 14px;
}

.b-ink-label {
  display: inline-block;
  font-size: clamp(14px, 1.05vw, 24px);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 700;
  color: #b4d4ff;
}

.b-ink-verse {
  margin-top: 7px;
  font-size: clamp(24px, 1.72vw, 40px);
  line-height: 1.16;
  font-weight: 600;
  color: #f6f8fb;
}

.b-ink-ref {
  margin-top: 9px;
  text-align: right;
  font-size: clamp(17px, 1.14vw, 28px);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8bc5ff;
  font-weight: 800;
}

.b-col-shell {
  max-width: min(1740px, calc(100vw - 64px));
  display: grid;
  grid-template-columns: minmax(210px, 280px) 1fr;
  background: rgba(14, 16, 23, 0.94);
}

.b-col-left {
  background: linear-gradient(180deg, #c90f2f, #a60f28);
  padding: 16px 14px;
  text-align: center;
  display: grid;
  align-content: center;
  gap: 7px;
}

.b-col-book {
  font-size: clamp(18px, 1.24vw, 30px);
  text-transform: uppercase;
  letter-spacing: 0.11em;
  font-weight: 700;
}

.b-col-chapter {
  font-size: clamp(34px, 2.3vw, 54px);
  line-height: 0.92;
  font-weight: 800;
}

.b-col-right {
  padding: 14px 18px;
}

.b-col-verse {
  font-size: clamp(23px, 1.65vw, 38px);
  line-height: 1.18;
  color: #f7f8fa;
  font-weight: 600;
}

.b-col-translation {
  margin-top: 10px;
  text-align: right;
  font-size: clamp(14px, 0.95vw, 23px);
  color: #c5d5ec;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 700;
}

.b-gold-shell {
  max-width: min(1720px, calc(100vw - 58px));
  background: rgba(13, 14, 18, 0.96);
  border-top: 6px solid #f5bc3b;
}

.b-gold-verse {
  padding: 15px 20px 13px;
  font-size: clamp(24px, 1.72vw, 41px);
  line-height: 1.15;
  color: #f3f4f6;
  font-weight: 600;
}

.b-gold-ref {
  display: inline-block;
  margin: 0 0 12px 20px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(245, 188, 59, 0.64);
  color: #ffd77b;
  font-size: clamp(15px, 1vw, 24px);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-weight: 700;
}

.b-pill-shell {
  max-width: min(1460px, calc(100vw - 72px));
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(8px);
  background: linear-gradient(90deg, rgba(10, 24, 51, 0.8), rgba(13, 45, 85, 0.68));
  padding: 15px 18px;
}

.b-pill-verse {
  font-size: clamp(23px, 1.68vw, 39px);
  line-height: 1.16;
  color: #f8fbff;
  font-weight: 600;
}

.b-pill-ref {
  margin-top: 8px;
  display: inline-block;
  border-radius: 999px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.16);
  color: #ddedff;
  font-size: clamp(14px, 0.92vw, 22px);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.b-mark-shell {
  max-width: min(1780px, calc(100vw - 56px));
  display: grid;
  grid-template-columns: minmax(170px, 220px) 1fr;
  background: rgba(21, 22, 30, 0.95);
}

.b-mark-tag {
  background: #f8fafc;
  color: #111827;
  display: grid;
  place-items: center;
  font-size: clamp(14px, 1.05vw, 24px);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 700;
}

.b-mark-right {
  padding: 14px 18px 15px;
  border-left: 5px solid #e11d48;
}

.b-mark-verse {
  font-size: clamp(23px, 1.63vw, 37px);
  line-height: 1.17;
  color: #f4f5f7;
  font-weight: 600;
}

.b-mark-ref {
  margin-top: 8px;
  text-align: right;
  font-size: clamp(16px, 1.02vw, 25px);
  color: #fda4af;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 800;
}

.b-study-shell {
  max-width: min(1760px, calc(100vw - 56px));
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(22, 26, 34, 0.96), rgba(16, 21, 29, 0.95));
}

.b-study-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: clamp(13px, 0.92vw, 22px);
  text-transform: uppercase;
  letter-spacing: 0.11em;
  color: #c9d6e7;
  font-weight: 700;
}

.b-study-ref {
  color: #facc15;
  font-weight: 800;
}

.b-study-verse {
  padding: 13px 16px 15px;
  font-size: clamp(23px, 1.63vw, 37px);
  line-height: 1.17;
  color: #f6f7f9;
  font-weight: 600;
}

.b-shell,
.b-e1,
.b-e2 {
  opacity: 0;
}

/* Fallback visibility if state/mode placeholders are not resolved */
.b-lt:not([data-state="in"]):not([data-state="out"]) .b-shell,
.b-lt:not([data-state="in"]):not([data-state="out"]) .b-e1,
.b-lt:not([data-state="in"]):not([data-state="out"]) .b-e2,
.b-lt:not([data-mode="stagger"]):not([data-mode="slow"]):not([data-mode="together"]) .b-shell,
.b-lt:not([data-mode="stagger"]):not([data-mode="slow"]):not([data-mode="together"]) .b-e1,
.b-lt:not([data-mode="stagger"]):not([data-mode="slow"]):not([data-mode="together"]) .b-e2 {
  opacity: 1;
}

@keyframes bBgIn {
  from { opacity: 0; transform: translateY(14px) scale(.985); filter: blur(2px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes bBgOut {
  from { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  to { opacity: 0; transform: translateY(12px) scale(.985); filter: blur(2px); }
}
@keyframes bTextIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes bTextOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-8px); }
}

.b-lt[data-state="in"][data-mode="stagger"] .b-shell { animation: bBgIn .46s cubic-bezier(0.16,1,0.3,1) both; }
.b-lt[data-state="in"][data-mode="stagger"] .b-e1 { animation: bTextIn .34s cubic-bezier(0.16,1,0.3,1) .16s both; }
.b-lt[data-state="in"][data-mode="stagger"] .b-e2 { animation: bTextIn .3s cubic-bezier(0.16,1,0.3,1) .28s both; }

.b-lt[data-state="out"][data-mode="stagger"] .b-e1 { animation: bTextOut .24s cubic-bezier(.4,0,1,1) both; }
.b-lt[data-state="out"][data-mode="stagger"] .b-e2 { animation: bTextOut .22s cubic-bezier(.4,0,1,1) .08s both; }
.b-lt[data-state="out"][data-mode="stagger"] .b-shell { animation: bBgOut .32s cubic-bezier(.4,0,1,1) .18s both; }

.b-lt[data-state="in"][data-mode="slow"] .b-shell { animation: bBgIn .78s cubic-bezier(0.16,1,0.3,1) both; }
.b-lt[data-state="in"][data-mode="slow"] .b-e1 { animation: bTextIn .62s cubic-bezier(0.16,1,0.3,1) .2s both; }
.b-lt[data-state="in"][data-mode="slow"] .b-e2 { animation: bTextIn .58s cubic-bezier(0.16,1,0.3,1) .34s both; }

.b-lt[data-state="out"][data-mode="slow"] .b-e1 { animation: bTextOut .34s cubic-bezier(.4,0,1,1) both; }
.b-lt[data-state="out"][data-mode="slow"] .b-e2 { animation: bTextOut .3s cubic-bezier(.4,0,1,1) .1s both; }
.b-lt[data-state="out"][data-mode="slow"] .b-shell { animation: bBgOut .44s cubic-bezier(.4,0,1,1) .3s both; }

.b-lt[data-state="in"][data-mode="together"] .b-shell { animation: bBgIn .55s cubic-bezier(0.16,1,0.3,1) both; }
.b-lt[data-state="in"][data-mode="together"] .b-e1,
.b-lt[data-state="in"][data-mode="together"] .b-e2 { animation: bTextIn .44s cubic-bezier(0.16,1,0.3,1) .12s both; }

.b-lt[data-state="out"][data-mode="together"] .b-e1,
.b-lt[data-state="out"][data-mode="together"] .b-e2 { animation: bTextOut .26s cubic-bezier(.4,0,1,1) both; }
.b-lt[data-state="out"][data-mode="together"] .b-shell { animation: bBgOut .34s cubic-bezier(.4,0,1,1) .14s both; }

@media (max-width: 1180px) {
  .b-pos-bottom-wide { left: 14px; right: 14px; bottom: 14px; }
  .b-pos-bottom-left { left: 14px; right: 14px; bottom: 14px; }
  .b-content { padding: 11px 13px 12px; }
  .b-col-shell { grid-template-columns: 1fr; }
  .b-col-left { gap: 4px; padding: 9px 10px; }
  .b-mark-shell { grid-template-columns: 1fr; }
  .b-mark-tag { padding: 8px 10px; }
  .b-mark-right { border-left-width: 0; border-top: 4px solid #e11d48; }
  .b-ink-inner,
  .b-gold-verse,
  .b-study-verse { padding: 10px 11px; }
  .b-pill-shell { border-radius: 13px; padding: 10px 11px; }
  .b-rib-tag {
    top: -42px;
    padding: 8px 14px 9px;
    letter-spacing: .18em;
  }
  .b-rib-shell {
    padding: 16px 104px 14px 14px;
  }
  .b-rib-mark {
    width: 54px;
    height: 98px;
    right: 10px;
  }
  .b-rib-mark::before,
  .b-rib-mark::after {
    border-width: 6px;
  }
}
`;

type AnimMode = "stagger" | "slow" | "together";

const animVars = (defaultMode: AnimMode) => [
    {
        key: "state",
        label: "Animation State",
        type: "select",
        defaultValue: "in",
        options: [
            { label: "Animate In", value: "in" },
            { label: "Animate Out", value: "out" },
        ],
        group: "Animation",
    },
    {
        key: "animMode",
        label: "Animation Mode",
        type: "select",
        defaultValue: defaultMode,
        options: [
            { label: "Staggered", value: "stagger" },
            { label: "Together Slow", value: "slow" },
            { label: "Together", value: "together" },
        ],
        group: "Animation",
    },
];

const withAnim = (
    vars: Array<Record<string, unknown>>,
    mode: AnimMode,
) => [...vars, ...animVars(mode)];

interface LowerThirdTheme {
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    accentColor: string;
    tags: string[];
    variables: Array<Record<string, unknown>>;
    html: string;
    usesTailwind: boolean;
    fontImports: string[];
    animation: Record<string, unknown>;
    css: string;
}

const makeTheme = (input: {
    id: string;
    name: string;
    description: string;
    icon: string;
    accentColor: string;
    tags: string[];
    variables: Array<Record<string, unknown>>;
    html: string;
}): LowerThirdTheme => ({
    ...input,
    category: "bible",
    usesTailwind: false,
    fontImports: FONT_IMPORTS,
    animation: DEFAULT_ANIMATION,
    css: SHARED_CSS,
});

const bible01 = makeTheme({
    id: "lt-601-bible-assurance-strip",
    name: "Bible Assurance Strip",
    description: "Dark scripture strip with green top accent and right-aligned reference.",
    icon: "menu_book",
    accentColor: "#13D49B",
    tags: ["bible", "scripture", "verse", "reference", "amp"],
    variables: withAnim(
        [
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "Now faith is the assurance (title deed, confirmation) of things hoped for (divinely guaranteed), and the evidence of things not seen [the conviction of their reality-faith comprehends as fact what cannot be experienced by the physical senses].",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "HEBREWS 11:1 (AMP)",
                placeholder: "Book chapter:verse (translation)",
                required: true,
                group: "Content",
            },
        ],
        "stagger",
    ),
    html: `<div class="b-lt b-pos-bottom-wide" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-e2">
    <div class="b-topline"></div>
    <div class="b-content">
      <p class="b-verse b-e1">{{verseText}}</p>
      <p class="b-ref-right b-e2">{{reference}}</p>
    </div>
  </div>
</div>`,
});

const bible02 = makeTheme({
    id: "lt-602-bible-confirmation-strip",
    name: "Bible Confirmation Strip",
    description: "Compact scripture strip matching traditional broadcast church look.",
    icon: "auto_stories",
    accentColor: "#12CA93",
    tags: ["bible", "scripture", "traditional", "church", "broadcast"],
    variables: withAnim(
        [
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "Now faith is the assurance (title deed, confirmation) of things hoped for (divinely guaranteed), and the evidence of things not seen [the conviction of their reality--faith comprehends as fact what cannot be experienced by the physical senses].",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "HEBREWS 11:1 (AMP)",
                placeholder: "Book chapter:verse (translation)",
                required: true,
                group: "Content",
            },
        ],
        "slow",
    ),
    html: `<div class="b-lt b-pos-bottom-wide" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-soft b-e2">
    <div class="b-topline"></div>
    <div class="b-content">
      <p class="b-verse b-e1">{{verseText}}</p>
      <p class="b-ref-right b-e2">{{reference}}</p>
    </div>
  </div>
</div>`,
});

const bible03 = makeTheme({
    id: "lt-603-bible-minimal-highlight",
    name: "Bible Minimal Highlight",
    description: "Minimal lower-third scripture with highlighted reference and large text.",
    icon: "chrome_reader_mode",
    accentColor: "#F7B718",
    tags: ["bible", "scripture", "minimal", "highlight", "matthew"],
    variables: withAnim(
        [
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "Matthew 6:25",
                placeholder: "Book chapter:verse",
                required: true,
                group: "Content",
            },
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue: "Therefore, I tell you, do not worry about your life...",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
        ],
        "together",
    ),
    html: `<div class="b-lt b-pos-bottom-left" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-minimal b-e2">
    <p class="b-kicker b-e2">{{reference}}</p>
    <p class="b-min-text b-e1">{{verseText}}</p>
  </div>
</div>`,
});

const bible04 = makeTheme({
    id: "lt-604-bible-propresenter-angle",
    name: "Bible ProPresenter Angle",
    description: "Angled white scripture strip with red reference tab, inspired by modern broadcast Bible lower thirds.",
    icon: "menu_book",
    accentColor: "#FF1735",
    tags: ["bible", "scripture", "lower-third", "angled", "broadcast"],
    variables: withAnim(
        [
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "JOHN 2:10",
                placeholder: "Book chapter:verse",
                required: true,
                group: "Content",
            },
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "and said, \"Everyone brings out the choice wine first and then the cheaper wine after the guests have had too much to drink; but you have saved the best till now.\"",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
        ],
        "stagger",
    ),
    html: `<div class="b-lt b-pos-bottom-wide b-pp" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-pp-shell b-e2">
    <div class="b-pp-label b-e1">{{reference}}</div>
    <p class="b-pp-verse b-e2">{{verseText}}</p>
  </div>
</div>`,
});

const bible05 = makeTheme({
    id: "lt-605-bible-ribbon-scripture",
    name: "Bible Ribbon Scripture",
    description: "Red scripture ribbon bar with white scripture tag and right ribbon emblem.",
    icon: "auto_stories",
    accentColor: "#C70F33",
    tags: ["bible", "scripture", "verse", "ribbon", "broadcast"],
    variables: withAnim(
        [
            {
                key: "label",
                label: "Top Label",
                type: "text",
                defaultValue: "SCRIPTURE",
                placeholder: "Top label",
                group: "Header",
            },
            {
                key: "verseNo",
                label: "Verse Number",
                type: "text",
                defaultValue: "48",
                placeholder: "Verse number",
                group: "Content",
            },
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "Then He saw them straining at rowing, for the wind was against them. Now about the fourth watch of the night He came to them, walking on the sea, and would have passed them by.",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "Mark 6:48 (NKJV)",
                placeholder: "Book chapter:verse (translation)",
                required: true,
                group: "Content",
            },
        ],
        "stagger",
    ),
    html: `<div class="b-lt b-pos-bottom-wide b-rib" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-rib-tag b-e1">{{label}}</div>
  <div class="b-shell b-rib-shell b-e2">
    <p class="b-rib-verse b-e1"><span class="b-rib-num">{{verseNo}}</span>{{verseText}}</p>
    <p class="b-rib-ref b-e2">{{reference}}</p>
    <span class="b-rib-mark" aria-hidden="true"></span>
  </div>
</div>`,
});

const bible06 = makeTheme({
    id: "lt-621-bible-ink-panel",
    name: "Bible Ink Panel",
    description: "Clean modern scripture panel with blue side accent and clear scripture hierarchy.",
    icon: "library_books",
    accentColor: "#0EA5E9",
    tags: ["bible", "scripture", "reading", "modern", "church"],
    variables: withAnim(
        [
            {
                key: "label",
                label: "Label",
                type: "text",
                defaultValue: "Scripture Reading",
                placeholder: "Top label",
                group: "Header",
            },
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "Your word is a lamp to my feet and a light to my path.",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "Psalm 119:105 (NKJV)",
                placeholder: "Book chapter:verse (translation)",
                required: true,
                group: "Content",
            },
        ],
        "stagger",
    ),
    html: `<div class="b-lt b-pos-bottom-wide" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-ink-shell b-e2">
    <div class="b-ink-inner">
      <p class="b-ink-label b-e1">{{label}}</p>
      <p class="b-ink-verse b-e1">{{verseText}}</p>
      <p class="b-ink-ref b-e2">{{reference}}</p>
    </div>
  </div>
</div>`,
});

const bible07 = makeTheme({
    id: "lt-622-bible-reference-column",
    name: "Bible Reference Column",
    description: "Classic broadcast scripture lower third with left reference column and translation line.",
    icon: "auto_stories",
    accentColor: "#C90F2F",
    tags: ["bible", "scripture", "reference", "broadcast", "church"],
    variables: withAnim(
        [
            {
                key: "book",
                label: "Book",
                type: "text",
                defaultValue: "Romans",
                placeholder: "Book name",
                required: true,
                group: "Reference",
            },
            {
                key: "chapterVerse",
                label: "Chapter:Verse",
                type: "text",
                defaultValue: "8:28",
                placeholder: "e.g. 8:28",
                required: true,
                group: "Reference",
            },
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "And we know that all things work together for good to those who love God.",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
            {
                key: "translation",
                label: "Translation",
                type: "text",
                defaultValue: "NKJV",
                placeholder: "e.g. NKJV",
                group: "Reference",
            },
        ],
        "slow",
    ),
    html: `<div class="b-lt b-pos-bottom-wide" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-col-shell b-e2">
    <div class="b-col-left b-e1">
      <p class="b-col-book">{{book}}</p>
      <p class="b-col-chapter">{{chapterVerse}}</p>
    </div>
    <div class="b-col-right">
      <p class="b-col-verse b-e1">{{verseText}}</p>
      <p class="b-col-translation b-e2">{{translation}}</p>
    </div>
  </div>
</div>`,
});

const bible08 = makeTheme({
    id: "lt-623-bible-goldline-classic",
    name: "Bible Goldline Classic",
    description: "Traditional black-and-gold scripture strap styled for sermon reading moments.",
    icon: "menu_book",
    accentColor: "#F5BC3B",
    tags: ["bible", "scripture", "traditional", "classic", "church"],
    variables: withAnim(
        [
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "Trust in the Lord with all your heart, and lean not on your own understanding.",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "Proverbs 3:5",
                placeholder: "Book chapter:verse",
                required: true,
                group: "Content",
            },
        ],
        "stagger",
    ),
    html: `<div class="b-lt b-pos-bottom-wide" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-gold-shell b-e2">
    <p class="b-gold-verse b-e1">{{verseText}}</p>
    <p class="b-gold-ref b-e2">{{reference}}</p>
  </div>
</div>`,
});

const bible09 = makeTheme({
    id: "lt-624-bible-pill-calm",
    name: "Bible Pill Calm",
    description: "Soft rounded scripture lower third used in reflective worship and Bible reading moments.",
    icon: "chrome_reader_mode",
    accentColor: "#DDEDFF",
    tags: ["bible", "scripture", "calm", "worship", "reading"],
    variables: withAnim(
        [
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "Cast all your anxiety on Him because He cares for you.",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "1 Peter 5:7",
                placeholder: "Book chapter:verse",
                required: true,
                group: "Content",
            },
        ],
        "together",
    ),
    html: `<div class="b-lt b-pos-bottom-wide" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-pill-shell b-e2">
    <p class="b-pill-verse b-e1">{{verseText}}</p>
    <p class="b-pill-ref b-e2">{{reference}}</p>
  </div>
</div>`,
});
// {
//     "id": "lt-242-youth-quote-pulse-royal-violet",
//     "name": "Quote Pulse — Royal Violet",
//     "description": "Statement quote card for sermon clips and social-friendly moments.",
//     "category": "general",
//     "icon": "format_quote",
//     "accentColor": "#60A5FA",
//     "tags": [
//       "quote",
//       "sermon",
//       "moment",
//       "youth",
//       "animated",
//       "in-out",
//       "modern-youth",
//       "royal-violet"
//     ],
//     "variables": [
//       {
//         "key": "label",
//         "label": "Label",
//         "type": "text",
//         "defaultValue": "Sermon Quote",
//         "placeholder": "e.g. Key Quote",
//         "group": "Header"
//       },
//       {
//         "key": "quote",
//         "label": "Quote",
//         "type": "text",
//         "defaultValue": "Grace does not lower truth; it gives us power to walk in it.",
//         "placeholder": "Enter quote text",
//         "required": true,
//         "group": "Content"
//       },
//       {
//         "key": "reference",
//         "label": "Reference",
//         "type": "text",
//         "defaultValue": "Sunday Message",
//         "placeholder": "Speaker or source",
//         "group": "Content"
//       },
//       {
//         "key": "state",
//         "label": "Animation State",
//         "type": "select",
//         "defaultValue": "in",
//         "options": [
//           {
//             "label": "Animate In",
//             "value": "in"
//           },
//           {
//             "label": "Animate Out",
//             "value": "out"
//           }
//         ],
//         "group": "Animation"
//       },
//       {
//         "key": "animMode",
//         "label": "Animation Mode",
//         "type": "select",
//         "defaultValue": "slow",
//         "options": [
//           {
//             "label": "Staggered",
//             "value": "stagger"
//           },
//           {
//             "label": "Together Slow",
//             "value": "slow"
//           },
//           {
//             "label": "Together",
//             "value": "together"
//           }
//         ],
//         "group": "Animation"
//       }
//     ],
//     "html": "<div class=\"ylt y-pos-bc\" data-state=\"{{state}}\" data-mode=\"{{animMode}}\" style=\"--bg1:#1a1338;--bg2:#25194c;--fg:#f8f5ff;--accent:#60A5FA;--muted:rgba(236,229,255,.82);--border:rgba(167,139,250,.34);--glow:rgba(167,139,250,.24);\">\n  <div class=\"y-shell y-quote\">\n    <span class=\"y-kicker y-enter-3\">{{label}}</span>\n    <p class=\"y-quote-main y-enter-1\">\"{{quote}}\"</p>\n    <p class=\"y-quote-ref y-enter-2\">{{reference}}</p>\n  </div>\n</div>",
//     "usesTailwind": false,
//     "fontImports": [
//       "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Sora:wght@400;600;700;800&display=swap"
//     ],
//     "animation": {
//       "name": "fadeInUp",
//       "duration": 650,
//       "easing": "cubic-bezier(0.16, 1, 0.3, 1)"
//     },
//     "css": "\n* { box-sizing: border-box; margin: 0; padding: 0; }\nhtml, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }\nbody { font-family: \"Outfit\", sans-serif; }\n\n.ylt {\n  position: fixed;\n  z-index: 50;\n  pointer-events: none;\n  color: var(--fg, #ffffff);\n  --bg1: #0f172a;\n  --bg2: #111827;\n  --accent: #38bdf8;\n  --muted: rgba(255,255,255,.75);\n  --border: rgba(255,255,255,.22);\n  --glow: rgba(56,189,248,.24);\n}\n\n.y-pos-bl { left: 34px; bottom: 30px; }\n.y-pos-br { right: 34px; bottom: 30px; }\n.y-pos-bc { left: 50%; bottom: 30px; transform: translateX(-50%); }\n.y-pos-tl { left: 34px; top: 30px; }\n.y-pos-tr { right: 34px; top: 30px; }\n.y-pos-tc { left: 50%; top: 30px; transform: translateX(-50%); }\n\n.y-shell {\n  position: relative;\n  overflow: hidden;\n  border: 1px solid var(--border);\n  background: linear-gradient(135deg, var(--bg1), var(--bg2));\n  box-shadow:\n    0 14px 44px rgba(0,0,0,.42),\n    0 0 0 1px rgba(255,255,255,.04) inset,\n    0 0 24px var(--glow);\n}\n\n.y-shell::before {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  background:\n    radial-gradient(420px 180px at 0% 100%, rgba(255,255,255,.1), transparent 70%),\n    linear-gradient(95deg, transparent 0 32%, rgba(255,255,255,.08) 48%, transparent 66%);\n  mix-blend-mode: screen;\n  pointer-events: none;\n}\n\n.y-shell::after {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 0;\n  height: 3px;\n  background: linear-gradient(90deg, transparent, var(--accent), transparent);\n  opacity: .92;\n}\n\n.y-shell,\n.y-enter-1,\n.y-enter-2,\n.y-enter-3 {\n  opacity: 0;\n}\n\n/* Fallback visibility when animation vars are missing/unresolved in host renderer */\n.ylt:not([data-state=\"in\"]):not([data-state=\"out\"]) .y-shell,\n.ylt:not([data-state=\"in\"]):not([data-state=\"out\"]) .y-enter-1,\n.ylt:not([data-state=\"in\"]):not([data-state=\"out\"]) .y-enter-2,\n.ylt:not([data-state=\"in\"]):not([data-state=\"out\"]) .y-enter-3,\n.ylt:not([data-mode=\"stagger\"]):not([data-mode=\"slow\"]):not([data-mode=\"together\"]) .y-shell,\n.ylt:not([data-mode=\"stagger\"]):not([data-mode=\"slow\"]):not([data-mode=\"together\"]) .y-enter-1,\n.ylt:not([data-mode=\"stagger\"]):not([data-mode=\"slow\"]):not([data-mode=\"together\"]) .y-enter-2,\n.ylt:not([data-mode=\"stagger\"]):not([data-mode=\"slow\"]):not([data-mode=\"together\"]) .y-enter-3 {\n  opacity: 1;\n}\n\n.y-kicker {\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: .14em;\n  text-transform: uppercase;\n  color: var(--accent);\n}\n\n.y-line1 {\n  font-size: clamp(27px, 2.15vw, 50px);\n  line-height: 1.04;\n  font-weight: 800;\n  letter-spacing: .005em;\n}\n\n.y-line2 {\n  margin-top: 7px;\n  font-size: clamp(17px, 1.3vw, 30px);\n  line-height: 1.18;\n  font-weight: 500;\n  color: var(--muted);\n}\n\n.y-meta {\n  margin-top: 10px;\n  font-size: clamp(13px, .95vw, 21px);\n  font-weight: 600;\n  letter-spacing: .08em;\n  text-transform: uppercase;\n  color: var(--muted);\n}\n\n.y-speaker {\n  min-width: 760px;\n  max-width: min(1500px, calc(100vw - 76px));\n  border-radius: 16px;\n  padding: 16px 20px;\n  display: flex;\n  align-items: center;\n  gap: 16px;\n}\n\n.y-logo {\n  width: 128px;\n  min-width: 128px;\n  height: 78px;\n  border-radius: 12px;\n  background: rgba(255,255,255,.07);\n  border: 1px solid rgba(255,255,255,.2);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.y-logo img {\n  max-width: 100%;\n  max-height: 100%;\n  object-fit: contain;\n}\n\n.y-vline {\n  width: 5px;\n  min-width: 5px;\n  height: 80px;\n  border-radius: 3px;\n  background: var(--accent);\n}\n\n.y-speaker-text { min-width: 0; display: flex; flex-direction: column; }\n.y-speaker-name { font-size: clamp(29px, 2.45vw, 56px); font-weight: 800; text-transform: uppercase; line-height: 1; letter-spacing: .007em; }\n.y-speaker-role { margin-top: 8px; font-size: clamp(18px, 1.5vw, 34px); font-weight: 500; color: var(--muted); line-height: 1.15; }\n\n.y-quote {\n  min-width: 720px;\n  max-width: min(1450px, calc(100vw - 80px));\n  border-radius: 16px;\n  padding: 16px 20px 18px;\n}\n\n.y-quote-main {\n  margin-top: 8px;\n  font-size: clamp(26px, 2.05vw, 46px);\n  line-height: 1.2;\n  font-weight: 700;\n  font-family: \"Sora\", sans-serif;\n}\n\n.y-quote-ref {\n  margin-top: 10px;\n  text-align: right;\n  font-size: clamp(14px, 1vw, 22px);\n  font-weight: 600;\n  letter-spacing: .08em;\n  text-transform: uppercase;\n  color: var(--muted);\n}\n\n.y-ann {\n  min-width: 650px;\n  max-width: min(1280px, calc(100vw - 80px));\n  border-radius: 16px;\n  padding: 14px 16px;\n  display: flex;\n  align-items: center;\n  gap: 14px;\n}\n\n.y-tag {\n  padding: 8px 12px;\n  border-radius: 10px;\n  background: var(--accent);\n  color: #fff;\n  font-size: 10px;\n  letter-spacing: .12em;\n  text-transform: uppercase;\n  font-weight: 800;\n  white-space: nowrap;\n}\n\n.y-ann-copy { min-width: 0; display: flex; flex-direction: column; }\n\n.y-keyword {\n  min-width: 620px;\n  max-width: min(1220px, calc(100vw - 80px));\n  border-radius: 16px;\n  padding: 12px 15px;\n  display: flex;\n  align-items: center;\n  gap: 14px;\n}\n\n.y-key-main {\n  font-size: clamp(30px, 2.5vw, 60px);\n  line-height: 1;\n  font-weight: 800;\n  text-transform: uppercase;\n  letter-spacing: .015em;\n}\n\n.y-key-sub {\n  font-size: clamp(15px, 1.05vw, 23px);\n  font-weight: 600;\n  color: var(--muted);\n}\n\n.y-scripture {\n  min-width: 720px;\n  max-width: min(1460px, calc(100vw - 80px));\n  border-radius: 16px;\n  padding: 16px 20px 18px;\n}\n\n.y-scripture-main {\n  margin-top: 7px;\n  font-size: clamp(25px, 2vw, 44px);\n  line-height: 1.24;\n  font-weight: 600;\n}\n\n.y-scripture-ref {\n  margin-top: 10px;\n  text-align: right;\n  font-size: clamp(14px, 1vw, 22px);\n  font-weight: 700;\n  letter-spacing: .08em;\n  text-transform: uppercase;\n  color: var(--accent);\n}\n\n.y-event {\n  min-width: 660px;\n  max-width: min(1200px, calc(100vw - 80px));\n  border-radius: 16px;\n  padding: 12px 14px;\n  display: flex;\n  align-items: stretch;\n  gap: 12px;\n}\n\n.y-date {\n  min-width: 90px;\n  border-radius: 12px;\n  background: var(--accent);\n  color: #fff;\n  display: flex;\n  flex-direction: column;\n  justify-content: center;\n  align-items: center;\n  padding: 8px;\n}\n\n.y-date .m { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; }\n.y-date .d { font-size: 34px; font-weight: 800; line-height: 1; }\n\n.y-event-copy { min-width: 0; display: flex; flex-direction: column; justify-content: center; }\n\n.y-social {\n  min-width: 560px;\n  max-width: min(980px, calc(100vw - 80px));\n  border-radius: 999px;\n  padding: 10px 14px;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n}\n\n.y-platform {\n  padding: 7px 10px;\n  border-radius: 999px;\n  background: rgba(255,255,255,.16);\n  font-size: 10px;\n  letter-spacing: .09em;\n  text-transform: uppercase;\n  font-weight: 700;\n}\n\n.y-handle {\n  font-size: clamp(20px, 1.5vw, 32px);\n  font-weight: 700;\n}\n\n.y-give {\n  min-width: 580px;\n  max-width: min(980px, calc(100vw - 80px));\n  border-radius: 16px;\n  padding: 14px 16px;\n}\n\n.y-lyrics {\n  min-width: 620px;\n  max-width: min(1260px, calc(100vw - 80px));\n  border-radius: 16px;\n  padding: 13px 16px;\n}\n\n.y-lyric-1 {\n  font-size: clamp(24px, 1.9vw, 42px);\n  line-height: 1.08;\n  font-weight: 700;\n}\n\n.y-lyric-2 {\n  margin-top: 6px;\n  font-size: clamp(22px, 1.75vw, 38px);\n  line-height: 1.08;\n  font-weight: 800;\n  color: var(--accent);\n}\n\n.y-pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 11px;\n  padding: 10px 15px;\n  border-radius: 999px;\n  border: 1px solid var(--border);\n  background: linear-gradient(135deg, var(--bg1), var(--bg2));\n  box-shadow: 0 10px 28px rgba(0,0,0,.34), 0 0 14px var(--glow);\n}\n\n.y-dot {\n  width: 9px;\n  height: 9px;\n  border-radius: 999px;\n  background: var(--accent);\n  box-shadow: 0 0 8px var(--accent);\n}\n\n.y-pill-label { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; color: var(--accent); }\n.y-pill-time { font-size: 24px; font-weight: 800; letter-spacing: .08em; font-variant-numeric: tabular-nums; }\n.y-pill-context { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; color: var(--muted); }\n\n@keyframes yBgIn {\n  from { opacity: 0; transform: translateY(18px) scale(.96); filter: blur(2px); }\n  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }\n}\n@keyframes yBgOut {\n  from { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }\n  to { opacity: 0; transform: translateY(14px) scale(.96); filter: blur(2px); }\n}\n@keyframes yTextInUp {\n  from { opacity: 0; transform: translateY(14px); filter: blur(1px); }\n  to { opacity: 1; transform: translateY(0); filter: blur(0); }\n}\n@keyframes yTextInFade {\n  from { opacity: 0; transform: translateY(8px); }\n  to { opacity: 1; transform: translateY(0); }\n}\n@keyframes yTextOutUp {\n  from { opacity: 1; transform: translateY(0); }\n  to { opacity: 0; transform: translateY(-11px); }\n}\n@keyframes yTextOutDown {\n  from { opacity: 1; transform: translateY(0); }\n  to { opacity: 0; transform: translateY(10px); }\n}\n\n/* IN: stagger (background -> first text -> second text/meta) */\n.ylt[data-state=\"in\"][data-mode=\"stagger\"] .y-shell { animation: yBgIn .46s cubic-bezier(0.16,1,0.3,1) both; }\n.ylt[data-state=\"in\"][data-mode=\"stagger\"] .y-enter-1 { animation: yTextInUp .35s cubic-bezier(0.16,1,0.3,1) .16s both; }\n.ylt[data-state=\"in\"][data-mode=\"stagger\"] .y-enter-2 { animation: yTextInUp .35s cubic-bezier(0.16,1,0.3,1) .28s both; }\n.ylt[data-state=\"in\"][data-mode=\"stagger\"] .y-enter-3 { animation: yTextInFade .32s cubic-bezier(0.16,1,0.3,1) .39s both; }\n\n/* OUT: first text -> second text/meta -> background */\n.ylt[data-state=\"out\"][data-mode=\"stagger\"] .y-enter-1 { animation: yTextOutUp .26s cubic-bezier(.4,0,1,1) both; }\n.ylt[data-state=\"out\"][data-mode=\"stagger\"] .y-enter-2 { animation: yTextOutDown .24s cubic-bezier(.4,0,1,1) .08s both; }\n.ylt[data-state=\"out\"][data-mode=\"stagger\"] .y-enter-3 { animation: yTextOutDown .22s cubic-bezier(.4,0,1,1) .15s both; }\n.ylt[data-state=\"out\"][data-mode=\"stagger\"] .y-shell { animation: yBgOut .34s cubic-bezier(.4,0,1,1) .24s both; }\n\n/* IN: together-slow */\n.ylt[data-state=\"in\"][data-mode=\"slow\"] .y-shell { animation: yBgIn .8s cubic-bezier(0.16,1,0.3,1) both; }\n.ylt[data-state=\"in\"][data-mode=\"slow\"] .y-enter-1 { animation: yTextInUp .64s cubic-bezier(0.16,1,0.3,1) .18s both; }\n.ylt[data-state=\"in\"][data-mode=\"slow\"] .y-enter-2 { animation: yTextInUp .66s cubic-bezier(0.16,1,0.3,1) .28s both; }\n.ylt[data-state=\"in\"][data-mode=\"slow\"] .y-enter-3 { animation: yTextInFade .64s cubic-bezier(0.16,1,0.3,1) .36s both; }\n\n/* OUT: slow */\n.ylt[data-state=\"out\"][data-mode=\"slow\"] .y-enter-1 { animation: yTextOutUp .34s cubic-bezier(.4,0,1,1) both; }\n.ylt[data-state=\"out\"][data-mode=\"slow\"] .y-enter-2 { animation: yTextOutDown .34s cubic-bezier(.4,0,1,1) .1s both; }\n.ylt[data-state=\"out\"][data-mode=\"slow\"] .y-enter-3 { animation: yTextOutDown .31s cubic-bezier(.4,0,1,1) .2s both; }\n.ylt[data-state=\"out\"][data-mode=\"slow\"] .y-shell { animation: yBgOut .45s cubic-bezier(.4,0,1,1) .34s both; }\n\n/* IN/OUT: together */\n.ylt[data-state=\"in\"][data-mode=\"together\"] .y-shell { animation: yBgIn .55s cubic-bezier(0.16,1,0.3,1) both; }\n.ylt[data-state=\"in\"][data-mode=\"together\"] .y-enter-1 { animation: yTextInUp .48s cubic-bezier(0.16,1,0.3,1) .12s both; }\n.ylt[data-state=\"in\"][data-mode=\"together\"] .y-enter-2 { animation: yTextInFade .48s cubic-bezier(0.16,1,0.3,1) .12s both; }\n.ylt[data-state=\"in\"][data-mode=\"together\"] .y-enter-3 { animation: yTextInFade .48s cubic-bezier(0.16,1,0.3,1) .12s both; }\n\n.ylt[data-state=\"out\"][data-mode=\"together\"] .y-enter-1,\n.ylt[data-state=\"out\"][data-mode=\"together\"] .y-enter-2,\n.ylt[data-state=\"out\"][data-mode=\"together\"] .y-enter-3 {\n  animation: yTextOutUp .3s cubic-bezier(.4,0,1,1) both;\n}\n.ylt[data-state=\"out\"][data-mode=\"together\"] .y-shell { animation: yBgOut .36s cubic-bezier(.4,0,1,1) .14s both; }\n\n@media (max-width: 1180px) {\n  .y-pos-bl, .y-pos-br, .y-pos-bc, .y-pos-tl, .y-pos-tr, .y-pos-tc { left: 18px; right: 18px; transform: none; }\n  .y-pos-br, .y-pos-tr { left: auto; }\n  .y-pos-bc, .y-pos-tc { left: 18px; right: 18px; }\n  .y-speaker, .y-quote, .y-ann, .y-keyword, .y-scripture, .y-event, .y-social, .y-give, .y-lyrics { min-width: 0; max-width: calc(100vw - 36px); }\n  .y-speaker { padding: 12px 14px; gap: 11px; }\n  .y-logo { width: 92px; min-width: 92px; height: 58px; }\n  .y-vline { height: 58px; }\n}\n"
//   },
const bible10 = makeTheme({
    id: "lt-625-bible-marked-reading",
    name: "Bible Marked Reading",
    description: "Side-tag scripture format with distinct reading marker and right-aligned reference.",
    icon: "bookmark",
    accentColor: "#E11D48",
    tags: ["bible", "scripture", "reading", "verse", "church"],
    variables: withAnim(
        [
            {
                key: "label",
                label: "Marker Label",
                type: "text",
                defaultValue: "SCRIPTURE",
                placeholder: "Marker label",
                group: "Header",
            },
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "The entrance of Your words gives light; it gives understanding to the simple.",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "Psalm 119:130",
                placeholder: "Book chapter:verse",
                required: true,
                group: "Content",
            },
        ],
        "stagger",
    ),
    html: `<div class="b-lt b-pos-bottom-wide" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-mark-shell b-e2">
    <div class="b-mark-tag b-e1">{{label}}</div>
    <div class="b-mark-right">
      <p class="b-mark-verse b-e1">{{verseText}}</p>
      <p class="b-mark-ref b-e2">{{reference}}</p>
    </div>
  </div>
</div>`,
});

const bible11 = makeTheme({
    id: "lt-626-bible-study-bar",
    name: "Bible Study Bar",
    description: "Study-style scripture strip with top metadata and clean verse presentation.",
    icon: "school",
    accentColor: "#FACC15",
    tags: ["bible", "scripture", "study", "teaching", "church"],
    variables: withAnim(
        [
            {
                key: "metaLabel",
                label: "Meta Label",
                type: "text",
                defaultValue: "Bible Study",
                placeholder: "Top left label",
                group: "Header",
            },
            {
                key: "reference",
                label: "Reference",
                type: "text",
                defaultValue: "John 15:5",
                placeholder: "Book chapter:verse",
                required: true,
                group: "Header",
            },
            {
                key: "verseText",
                label: "Verse Text",
                type: "text",
                defaultValue:
                    "I am the vine; you are the branches. If you remain in Me and I in you, you will bear much fruit.",
                placeholder: "Enter verse text",
                required: true,
                group: "Content",
            },
        ],
        "slow",
    ),
    html: `<div class="b-lt b-pos-bottom-wide" data-state="{{state}}" data-mode="{{animMode}}">
  <div class="b-shell b-study-shell b-e2">
    <div class="b-study-head b-e1">
      <span>{{metaLabel}}</span>
      <span class="b-study-ref">{{reference}}</span>
    </div>
    <p class="b-study-verse b-e2">{{verseText}}</p>
  </div>
</div>`,
});

export const CHURCH_BIBLE_SCRIPTURE_3_THEMES: LowerThirdTheme[] = [
    bible01,
    bible02,
    bible03,
    bible04,
    bible05,
    bible06,
    bible07,
    bible08,
    bible09,
    bible10,
    bible11,
];

export const CHURCH_BIBLE_SCRIPTURE_3_BY_CATEGORY = {
    bible: CHURCH_BIBLE_SCRIPTURE_3_THEMES.filter((t) => t.category === "bible"),
    worship: CHURCH_BIBLE_SCRIPTURE_3_THEMES.filter((t) => t.category === "worship"),
    general: CHURCH_BIBLE_SCRIPTURE_3_THEMES.filter((t) => t.category === "general"),
};

export function getChurchBibleScriptureThemeById(id: string): LowerThirdTheme | undefined {
    return CHURCH_BIBLE_SCRIPTURE_3_THEMES.find((t) => t.id === id);
}
