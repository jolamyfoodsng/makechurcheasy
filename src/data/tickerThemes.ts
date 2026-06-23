export interface TickerTheme {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  badge: string;
  tickerText: string;
  speed: string;
  html: string;
  css: string;
  fontImports: string[];
  variables: Array<{
    key: string;
    label: string;
    type: string;
    defaultValue: string;
    placeholder: string;
    required?: boolean;
    group: string;
  }>;
}

export const defaultTickerThemes: TickerTheme[] = [
  {
    id: "ticker-bottom",
    name: "Bottom Ticker",
    description: "Bottom ticker-style footer for website and contact details.",
    accentColor: "#2F4D8A",
    badge: "Church News",
    tickerText:
      "Prayer Meeting Tuesday 6:30 PM \u2022 Youth Night Friday 7:00 PM \u2022 New Members Class starts next Sunday \u2022",
    speed: "24s",
    html: `<div class="lt pos-full-bottom in-up" data-state="{{state}}">
  <div class="ticker-shell" style="--bg:#FFFFFF;--fg:#1F2A38;--accent:#2F4D8A;--bd:rgba(47,77,138,.22);--tagFg:#fff;">
    <div class="ticker-badge">{{badge}}</div>
    <div class="ticker-track">
      <div class="ticker-move" style="--speed:{{speed}};">
        <span>{{tickerText}}</span>
        <span>{{tickerText}}</span>
      </div>
    </div>
  </div>
</div>`,
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Montserrat", sans-serif; }

@keyframes tickerMove {
  0% { transform: translateX(0%); }
  100% { transform: translateX(-50%); }
}

.ticker-shell {
  width: min(1880px, calc(100vw - 24px));
  margin: 0 auto 10px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg, #111);
  border: 1px solid var(--bd, rgba(255,255,255,.14));
  box-shadow: 0 10px 26px rgba(0,0,0,.35);
  display: flex;
  align-items: stretch;
}

.ticker-badge {
  background: var(--accent, #4a6bcb);
  color: var(--tagFg, #fff);
  min-width: 142px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .09em;
}

.ticker-track {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.ticker-move {
  display: inline-flex;
  white-space: nowrap;
  gap: 48px;
  padding-left: 28px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: .01em;
  animation: tickerMove var(--speed, 20s) linear infinite;
}`,
    fontImports: [
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap",
    ],
    variables: [
      {
        key: "badge",
        label: "Badge",
        type: "text",
        defaultValue: "Church News",
        placeholder: "e.g. Updates",
        group: "Header",
      },
      {
        key: "tickerText",
        label: "Ticker Text",
        type: "text",
        defaultValue:
          "Prayer Meeting Tuesday 6:30 PM \u2022 Youth Night Friday 7:00 PM \u2022 New Members Class starts next Sunday \u2022",
        placeholder: "Enter ticker text",
        required: true,
        group: "Content",
      },
    ],
  },
  {
    id: "ticker-newsline",
    name: "Stylish Newsline",
    description: "Broadcast-inspired but church-safe update ticker.",
    accentColor: "#DC2626",
    badge: "Church News",
    tickerText:
      "Prayer Meeting Tuesday 6:30 PM \u2022 Youth Night Friday 7:00 PM \u2022 New Members Class starts next Sunday \u2022",
    speed: "18s",
    html: `<div class="lt pos-full-bottom in-up" data-state="{{state}}">
  <div class="ticker-shell" style="--bg:rgba(17,24,39,.95);--fg:#F8FAFC;--accent:#DC2626;--bd:rgba(220,38,38,.35);--tagFg:#fff;">
    <div class="ticker-badge">{{badge}}</div>
    <div class="ticker-track">
      <div class="ticker-move" style="--speed:{{speed}};">
        <span>{{tickerText}}</span>
        <span>{{tickerText}}</span>
      </div>
    </div>
  </div>
</div>`,
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Montserrat", sans-serif; }

@keyframes tickerMove {
  0% { transform: translateX(0%); }
  100% { transform: translateX(-50%); }
}

.ticker-shell {
  width: min(1880px, calc(100vw - 24px));
  margin: 0 auto 10px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg, #111);
  border: 1px solid var(--bd, rgba(255,255,255,.14));
  box-shadow: 0 10px 26px rgba(0,0,0,.35);
  display: flex;
  align-items: stretch;
}

.ticker-badge {
  background: var(--accent, #4a6bcb);
  color: var(--tagFg, #fff);
  min-width: 142px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .09em;
}

.ticker-track {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.ticker-move {
  display: inline-flex;
  white-space: nowrap;
  gap: 48px;
  padding-left: 28px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: .01em;
  animation: tickerMove var(--speed, 20s) linear infinite;
}`,
    fontImports: [
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap",
    ],
    variables: [
      {
        key: "badge",
        label: "Badge",
        type: "text",
        defaultValue: "Church News",
        placeholder: "e.g. Updates",
        group: "Header",
      },
      {
        key: "tickerText",
        label: "Ticker Text",
        type: "text",
        defaultValue:
          "Prayer Meeting Tuesday 6:30 PM \u2022 Youth Night Friday 7:00 PM \u2022 New Members Class starts next Sunday \u2022",
        placeholder: "Enter ticker text",
        required: true,
        group: "Content",
      },
    ],
  },
  {
    id: "ticker-social-footer",
    name: "Social Footer Banner",
    description: "Full-width social banner with animated ticker motion for church social media handles.",
    accentColor: "#1D4ED8",
    badge: "Follow Us",
    tickerText: "",
    speed: "20s",
    html: `<div class="s5 s5-pos-full" data-state="{{state}}">
  <div class="s5-panel s5-enter s5-banner" data-state="{{state}}" style="--speed:{{speed}};">
    <span class="s5-label"><i class="fas fa-share-nodes" aria-hidden="true"></i>{{label}}</span>
    <div class="s5-track" data-state="{{state}}">
      <div class="s5-move" data-state="{{state}}">
        <span class="s5-facebook"><i class="fab fa-facebook-f" aria-hidden="true"></i> {{facebook}}</span>
        <span class="s5-twitter"><i class="fab fa-x-twitter" aria-hidden="true"></i> {{xHandle}}</span>
        <span class="s5-instagram"><i class="fab fa-instagram" aria-hidden="true"></i> {{instagram}}</span>
        <span class="s5-youtube"><i class="fab fa-youtube" aria-hidden="true"></i> {{youtube}}</span>
        <span class="s5-facebook"><i class="fab fa-facebook-f" aria-hidden="true"></i> {{facebook}}</span>
        <span class="s5-twitter"><i class="fab fa-x-twitter" aria-hidden="true"></i> {{xHandle}}</span>
        <span class="s5-instagram"><i class="fab fa-instagram" aria-hidden="true"></i> {{instagram}}</span>
        <span class="s5-youtube"><i class="fab fa-youtube" aria-hidden="true"></i> {{youtube}}</span>
      </div>
    </div>
  </div>
</div>`,
    css: `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { font-family: "Montserrat", sans-serif; }

@keyframes s5Ticker {
  0% { transform: translateX(0%); }
  100% { transform: translateX(-50%); }
}

.s5 {
  position: fixed;
  z-index: 70;
  pointer-events: none;
  color: #0f172a;
}

.s5-pos-full { left: 0; right: 0; bottom: 0; }

.s5-panel {
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.96);
  border-radius: 14px;
  box-shadow: 0 12px 38px rgba(0,0,0,.24);
}

.s5-banner {
  width: min(1880px, calc(100vw - 10px));
  margin: 0 auto 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  padding: 9px 10px;
}

.s5-label {
  border-radius: 999px;
  background: #1d4ed8;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: .11em;
  font-size: 11px;
  font-weight: 800;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.s5-track {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.s5-move {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  gap: 22px;
  padding-left: 18px;
  animation: s5Ticker var(--speed, 20s) linear infinite;
}

.s5-move span {
  font-size: clamp(17px, 1.25vw, 28px);
  font-weight: 700;
  color: #0f172a;
}

.s5-facebook i { color: #1877F2; }
.s5-twitter i { color: #111827; }
.s5-instagram i { color: #E1306C; }
.s5-youtube i { color: #FF0000; }`,
    fontImports: [
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
    ],
    variables: [
      {
        key: "label",
        label: "Label",
        type: "text",
        defaultValue: "Follow Us",
        placeholder: "Label text",
        group: "Header",
      },
      {
        key: "facebook",
        label: "Facebook",
        type: "text",
        defaultValue: "@YourChurchExample",
        placeholder: "Facebook handle",
        group: "Content",
      },
      {
        key: "xHandle",
        label: "X / Twitter",
        type: "text",
        defaultValue: "@YourChurchExample",
        placeholder: "X/Twitter handle",
        group: "Content",
      },
      {
        key: "instagram",
        label: "Instagram",
        type: "text",
        defaultValue: "@YourChurchExample",
        placeholder: "Instagram handle",
        group: "Content",
      },
      {
        key: "youtube",
        label: "YouTube",
        type: "text",
        defaultValue: "@YourChurchExample",
        placeholder: "YouTube handle",
        group: "Content",
      },
    ],
  },
];
