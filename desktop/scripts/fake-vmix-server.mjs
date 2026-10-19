#!/usr/bin/env node
/**
 * Fake vMix Web API for developing/testing the Dock's vMix mode without vMix
 * (vMix is Windows-only). Mimics the parts the Dock uses:
 *   GET /api            -> XML state
 *   GET /api/?Function=X&Input=..&Value=..
 *
 * Usage: node scripts/fake-vmix-server.mjs [--port 8088] [--no-mce-input] [--wrong-type]
 *   --no-mce-input  vMix has no "MCE Presentation" input yet (shows setup step 2)
 *   --wrong-type    an input called "MCE Presentation" exists but is a Video input
 * Debug: GET /__state returns JSON, GET /__log returns the received function calls.
 */
import http from "node:http";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const portArg = args.indexOf("--port");
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 8088;

const state = {
  inputs: [
    { number: 1, type: "Capture", title: "Camera 1" },
    { number: 2, type: "Capture", title: "Camera 2" },
    { number: 3, type: "Photos", title: "Sermon Slides" },
  ],
  overlays: { 1: null, 2: null, 3: null, 4: null },
  active: 1,
  preview: 2,
};
if (!flag("no-mce-input")) {
  state.inputs.push({
    number: 4,
    type: flag("wrong-type") ? "Video" : "Browser",
    title: "MCE Presentation",
    url: "",
  });
}

const log = [];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function xml() {
  const inputs = state.inputs
    .map(
      (i) =>
        `    <input key="00000000-0000-0000-0000-${String(i.number).padStart(12, "0")}" number="${i.number}" type="${i.type}" title="${esc(i.title)}" shortTitle="${esc(i.title)}" state="Running" position="0" duration="0" loop="False">${esc(i.title)}</input>`,
    )
    .join("\n");
  const overlays = [1, 2, 3, 4, 5, 6]
    .map((n) => {
      const held = state.overlays[n];
      return held ? `    <overlay number="${n}">${held}</overlay>` : `    <overlay number="${n}" />`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<vmix>
  <version>27.0.0.49</version>
  <edition>Pro</edition>
  <inputs>
${inputs}
  </inputs>
  <overlays>
${overlays}
  </overlays>
  <preview>${state.preview}</preview>
  <active>${state.active}</active>
  <fadeToBlack>False</fadeToBlack>
  <transitions />
  <recording>False</recording>
  <external>False</external>
  <streaming>False</streaming>
  <playList>False</playList>
  <multiCorder>False</multiCorder>
  <fullscreen>False</fullscreen>
</vmix>`;
}

function resolveInput(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (Number.isInteger(n)) return state.inputs.find((i) => i.number === n) ?? null;
  return state.inputs.find((i) => i.title === value) ?? null;
}

function runFunction(fn, q) {
  const overlay = /^OverlayInput([1-6])(In|Out|On|Off)$/.exec(fn);
  if (overlay) {
    const ch = Number(overlay[1]);
    if (overlay[2] === "In" || overlay[2] === "On") {
      const input = resolveInput(q.get("Input"));
      if (!input) return false;
      state.overlays[ch] = input.number;
    } else {
      state.overlays[ch] = null;
    }
    return true;
  }
  switch (fn) {
    case "BrowserNavigate": {
      const input = resolveInput(q.get("Input"));
      if (!input || input.type !== "Browser") return false;
      input.url = q.get("Value") ?? "";
      return true;
    }
    case "PreviewInput": {
      const input = resolveInput(q.get("Input"));
      if (!input) return false;
      state.preview = input.number;
      return true;
    }
    case "ActiveInput":
    case "Cut":
    case "Fade": {
      if (fn === "Cut" || fn === "Fade") {
        [state.active, state.preview] = [state.preview, state.active];
        return true;
      }
      const input = resolveInput(q.get("Input"));
      if (!input) return false;
      state.active = input.number;
      return true;
    }
    default:
      return false;
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  // vMix does not send CORS headers on every build; allow all here so the
  // browser Dock can reach the fake. (Real vMix: see notes in the project doc.)
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === "/__state") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(state, null, 2));
    return;
  }
  if (url.pathname === "/__log") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(log, null, 2));
    return;
  }
  if (url.pathname.replace(/\/$/, "") === "/api") {
    const fn = url.searchParams.get("Function");
    if (!fn) {
      res.writeHead(200, { "Content-Type": "text/xml" }).end(xml());
      return;
    }
    const ok = runFunction(fn, url.searchParams);
    log.push({ at: new Date().toISOString(), function: fn, params: Object.fromEntries(url.searchParams), ok });
    console.log(`${ok ? "OK " : "ERR"} ${fn} ${url.searchParams.toString()}`);
    res.writeHead(ok ? 200 : 500, { "Content-Type": "text/plain" }).end(ok ? "" : `Function ${fn} failed`);
    return;
  }
  res.writeHead(404).end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake vMix listening on http://127.0.0.1:${PORT}/api  (inputs: ${state.inputs.map((i) => i.title).join(", ")})`);
});
