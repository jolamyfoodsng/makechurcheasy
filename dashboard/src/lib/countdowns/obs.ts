import type { Countdown } from "./types";

function buildBackgroundCSS(cd: Countdown): string {
  const bg = cd.background;
  switch (bg.type) {
    case "solid":
      return `background-color: ${bg.color};`;
    case "gradient":
      return `background: linear-gradient(${bg.gradientAngle}deg, ${bg.gradientStops.map((s) => `${s.color} ${s.position}%`).join(", ")});`;
    case "image":
      return `background-image: url('${bg.imageUrl}'); background-size: cover; background-position: ${bg.positionX}% ${bg.positionY}%; filter: blur(${bg.blur}px) brightness(${bg.brightness}%);`;
    case "video":
      return `background-color: ${bg.color};`;
    default:
      return `background-color: ${bg.color};`;
  }
}

function buildTextCSS(cd: Countdown): string {
  const t = cd.text;
  const shadow = `${t.shadowOffsetX}px ${t.shadowOffsetY}px ${t.shadowBlur}px ${t.shadowColor}`;
  return `
    font-family: '${t.fontFamily}', sans-serif;
    font-weight: ${t.fontWeight};
    font-size: ${t.fontSize}px;
    letter-spacing: ${t.letterSpacing}px;
    line-height: ${t.lineHeight};
    color: ${t.color};
    text-shadow: ${shadow};
  `;
}

function buildTimerDisplay(cd: Countdown, remaining: number): string {
  const totalSec = Math.floor(remaining);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (cd.showHours) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (cd.showMinutes && cd.showSeconds) {
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildRingSVG(progress: number, size: number): string {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;

  return `
    <svg width="${size}" height="${size}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="4" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#3b82f6" stroke-width="4"
        stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset 0.3s ease" />
    </svg>
  `;
}

export function generateOBSOverlayHTML(cd: Countdown): string {
  const bgCSS = buildBackgroundCSS(cd);
  const textCSS = buildTextCSS(cd);
  const animCSS = cd.animation.speed !== 1 ? `animation-duration: ${2 / cd.animation.speed}s;` : "";

  const overlayCSS = cd.background.type === "image" || cd.background.type === "video"
    ? `background-color: rgba(0,0,0,${cd.background.overlayOpacity / 100});`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1920px; height: 1080px; overflow: hidden; }
  .countdown-container {
    width: 1920px; height: 1080px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative;
    ${bgCSS}
  }
  .overlay {
    position: absolute; inset: 0;
    ${overlayCSS}
  }
  .content { position: relative; z-index: 1; text-align: center; }
  .timer { ${textCSS} ${animCSS} }
  .title {
    font-family: '${cd.text.fontFamily}', sans-serif;
    font-size: ${Math.round(cd.text.fontSize * 0.5)}px;
    font-weight: ${cd.text.fontWeight};
    color: ${cd.text.color};
    margin-top: 16px;
    text-shadow: ${cd.text.shadowOffsetX}px ${cd.text.shadowOffsetY}px ${cd.text.shadowBlur}px ${cd.text.shadowColor};
  }
  .subtitle {
    font-family: '${cd.text.fontFamily}', sans-serif;
    font-size: ${Math.round(cd.text.fontSize * 0.35)}px;
    font-weight: 400;
    color: ${cd.text.color};
    opacity: 0.7;
    margin-top: 8px;
  }
  .ring-container {
    position: relative;
    width: ${cd.text.fontSize * 4}px;
    height: ${cd.text.fontSize * 4}px;
    display: flex; align-items: center; justify-content: center;
  }
  .ring-timer { position: relative; z-index: 1; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes scale { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
  @keyframes breathing { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
</style>
</head>
<body>
  <div class="countdown-container">
    <div class="overlay"></div>
    <div class="content" id="content"></div>
  </div>
  <script>
    const COUNTDOWN_DATA = ${JSON.stringify(cd)};
    const content = document.getElementById('content');

    function render(remaining, progress) {
      const timer = buildTimer(remaining);
      const template = COUNTDOWN_DATA.template;

      if (template === 'circular') {
        const size = COUNTDOWN_DATA.text.fontSize * 4;
        content.innerHTML =
          '<div class="ring-container">' +
            buildRingSVG(progress, size) +
            '<div class="ring-timer timer">' + timer + '</div>' +
          '</div>' +
          '<div class="title">' + COUNTDOWN_DATA.text.title + '</div>' +
          '<div class="subtitle">' + COUNTDOWN_DATA.text.subtitle + '</div>';
      } else if (template === 'lower-third') {
        content.innerHTML =
          '<div style="position:fixed;bottom:40px;left:40px;background:rgba(0,0,0,0.7);padding:16px 32px;border-radius:12px;border-left:4px solid #3b82f6">' +
            '<div class="timer" style="font-size:32px">' + timer + '</div>' +
            '<div style="color:rgba(255,255,255,0.7);font-size:14px;margin-top:4px">' + COUNTDOWN_DATA.text.title + '</div>' +
          '</div>';
      } else {
        content.innerHTML =
          '<div class="timer">' + timer + '</div>' +
          '<div class="title">' + COUNTDOWN_DATA.text.title + '</div>' +
          '<div class="subtitle">' + COUNTDOWN_DATA.text.subtitle + '</div>';
      }
    }

    function buildTimer(remaining) {
      const totalSec = Math.floor(remaining);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (COUNTDOWN_DATA.showHours)
        return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
      return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    function buildRingSVG(progress, size) {
      const r = (size - 8) / 2;
      const c = 2 * Math.PI * r;
      const o = c - (progress / 100) * c;
      return '<svg width="' + size + '" height="' + size + '" style="position:absolute;top:0;left:0">' +
        '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="4"/>' +
        '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="#3b82f6" stroke-width="4" stroke-linecap="round" ' +
        'stroke-dasharray="' + c + '" stroke-dashoffset="' + o + '" style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset 0.3s ease"/>' +
        '</svg>';
    }

    let remaining = COUNTDOWN_DATA.remainingSeconds;
    let total = COUNTDOWN_DATA.timerMode === 'fixed' ? COUNTDOWN_DATA.fixedDuration : remaining;
    let progress = 0;

    function tick() {
      if (COUNTDOWN_DATA.isRunning && remaining > 0) {
        remaining--;
        progress = ((total - remaining) / total) * 100;
      }
      render(remaining, Math.min(100, progress));
      if (remaining > 0) requestAnimationFrame(tick);
    }

    render(remaining, 0);
    tick();
  </script>
</body>
</html>`;
}
