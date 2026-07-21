import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import OBSWebSocket, { EventSubscription } from "obs-websocket-js";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dockUrl = process.env.DOCK_URL || "http://127.0.0.1:1420/dock.html";
const profileDir = "/tmp/mce-dock-obs-reload-test";
const shouldDeleteMce = process.argv.includes("--delete-mce");
const shouldLoadDock = !process.argv.includes("--no-load");
const obs = new OBSWebSocket();
const mceRe = /MCE|Bible|Worship|Countdown|Ticker|Media|Lower|Presentation/i;
const interestingEvents = [
  "SceneCreated",
  "SceneRemoved",
  "SceneNameChanged",
  "CurrentProgramSceneChanged",
  "CurrentPreviewSceneChanged",
  "InputCreated",
  "InputRemoved",
  "InputNameChanged",
  "InputSettingsChanged",
  "SceneItemCreated",
  "SceneItemRemoved",
  "SceneItemListReindexed",
  "SceneItemEnableStateChanged",
  "SceneItemTransformChanged",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function summarize() {
  const scenes = await obs.call("GetSceneList");
  const inputs = await obs.call("GetInputList");
  const sceneItems = {};

  for (const scene of scenes.scenes) {
    try {
      const list = await obs.call("GetSceneItemList", { sceneName: scene.sceneName });
      sceneItems[scene.sceneName] = (list.sceneItems || []).map((item) => ({
        sourceName: item.sourceName,
        sceneItemId: item.sceneItemId,
        sceneItemIndex: item.sceneItemIndex,
        sceneItemEnabled: item.sceneItemEnabled,
      }));
    } catch {
      sceneItems[scene.sceneName] = [];
    }
  }

  const sceneNames = scenes.scenes.map((scene) => scene.sceneName);
  const inputNames = inputs.inputs.map((input) => input.inputName);
  return {
    currentProgramSceneName: scenes.currentProgramSceneName,
    scenes: sceneNames,
    inputs: inputNames,
    mceScenes: sceneNames.filter((name) => mceRe.test(name)),
    mceInputs: inputNames.filter((name) => mceRe.test(name)),
    sceneItems,
  };
}

async function removeIfExists(requestType, args) {
  try {
    await obs.call(requestType, args);
    return true;
  } catch {
    return false;
  }
}

function diffSceneItems(beforeItems, afterItems) {
  const changed = [];
  for (const scene of new Set([...Object.keys(beforeItems), ...Object.keys(afterItems)])) {
    const before = beforeItems[scene] || [];
    const after = afterItems[scene] || [];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changed.push({ scene, before, after });
    }
  }
  return changed;
}

async function loadDockInChrome() {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });

  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-background-networking",
    `--user-data-dir=${profileDir}`,
    "--virtual-time-budget=12000",
    "--dump-dom",
    dockUrl,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let stdout = "";
  let stderr = "";
  chrome.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  await Promise.race([
    new Promise((resolve) => chrome.on("exit", resolve)),
    sleep(15000).then(() => {
      try { chrome.kill("SIGTERM"); } catch { /* ignore */ }
    }),
  ]);

  return {
    stderr: stderr.slice(0, 2000),
    domHasDockRoot: stdout.includes("dock-root") || stdout.includes("dock-shell") || stdout.includes("root"),
  };
}

await obs.connect("ws://127.0.0.1:4455", undefined, {
  rpcVersion: 1,
  eventSubscriptions: EventSubscription.All | EventSubscription.SceneItemTransformChanged,
});

const initial = await summarize();
const removed = { scene: false, inputs: [] };
if (shouldDeleteMce) {
  const safeScene = initial.scenes.find((scene) => scene !== "MCE Presentation") || initial.currentProgramSceneName;
  if (safeScene && initial.currentProgramSceneName === "MCE Presentation") {
    await obs.call("SetCurrentProgramScene", { sceneName: safeScene }).catch(() => {});
    await sleep(300);
  }

  if (initial.scenes.includes("MCE Presentation")) {
    removed.scene = await removeIfExists("RemoveScene", { sceneName: "MCE Presentation" });
  }

  for (const input of initial.inputs.filter((name) => /^MCE |^MCE-|MCE Browser|MCE Presentation|Bible|Worship|Ticker|Countdown|Lower Third/i.test(name))) {
    if (await removeIfExists("RemoveInput", { inputName: input })) {
      removed.inputs.push(input);
    }
  }

  await sleep(500);
}

const before = await summarize();
const events = [];
for (const eventName of interestingEvents) {
  obs.on(eventName, (payload) => {
    const text = JSON.stringify(payload);
    if (mceRe.test(text) || ["CurrentProgramSceneChanged", "CurrentPreviewSceneChanged", "SceneItemListReindexed"].includes(eventName)) {
      events.push({ t: new Date().toISOString(), name: eventName, payload });
    }
  });
}

const chrome = shouldLoadDock
  ? await loadDockInChrome()
  : { stderr: "", domHasDockRoot: false };
await sleep(shouldLoadDock ? 2000 : 12000);
const after = await summarize();

console.log(JSON.stringify({
  test: shouldDeleteMce
    ? `delete MCE scene/source then ${shouldLoadDock ? "load /dock.html" : "wait without loading dock"} against real OBS`
    : "load /dock.html against real OBS",
  dockUrl,
  removed,
  before: {
    currentProgramSceneName: before.currentProgramSceneName,
    mceScenes: before.mceScenes,
    mceInputs: before.mceInputs,
  },
  after: {
    currentProgramSceneName: after.currentProgramSceneName,
    mceScenes: after.mceScenes,
    mceInputs: after.mceInputs,
  },
  createdScenes: after.scenes.filter((scene) => !before.scenes.includes(scene)),
  removedScenes: before.scenes.filter((scene) => !after.scenes.includes(scene)),
  createdInputs: after.inputs.filter((input) => !before.inputs.includes(input)),
  removedInputs: before.inputs.filter((input) => !after.inputs.includes(input)),
  changedSceneItems: diffSceneItems(before.sceneItems, after.sceneItems),
  eventCount: events.length,
  events,
  chrome,
}, null, 2));

await obs.disconnect();
