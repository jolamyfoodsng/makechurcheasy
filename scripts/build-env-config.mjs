import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = process.env.VITE_APP_ENV || "development";
const isDev = env === "development";

const tauriConfPath = resolve(__dirname, "..", "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));

if (isDev) {
  conf.productName = "Test MCE";
  conf.identifier = "com.makechurcheasy.desktop.test";
  if (conf.app?.windows) {
    for (const win of conf.app.windows) {
      if (win.title) win.title = "Test MCE";
    }
  }
}

writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + "\n");
console.log(`[build-env-config] Applied ${env} config → productName="${conf.productName}", identifier="${conf.identifier}"`);
