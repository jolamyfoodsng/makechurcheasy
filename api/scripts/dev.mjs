import { spawn } from "node:child_process";
import net from "node:net";

const smtpHost = process.env.DEV_MAILDEV_SMTP_HOST || "127.0.0.1";
const smtpPort = Number(process.env.DEV_MAILDEV_SMTP_PORT || "1025");
const webPort = Number(process.env.DEV_MAILDEV_WEB_PORT || "1080");
const children = [];

function isPortOpen(host, port, timeoutMs = 350) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });
}

function start(command, args, label) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });

  child.once("error", (error) => {
    console.warn(`[dev] Could not start ${label}: ${error.message}`);
  });
  children.push(child);
  return child;
}

async function ensureMailDev() {
  if (await isPortOpen(smtpHost, smtpPort)) {
    console.log(`[dev] MailDev SMTP already available at ${smtpHost}:${smtpPort}`);
    return;
  }

  const maildev = start(
    "maildev",
    ["--smtp", String(smtpPort), "--web", String(webPort)],
    "MailDev",
  );

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1200);
    maildev.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopChildren();
    process.exit(0);
  });
}

await ensureMailDev();
const next = start("next", ["dev", "--port", "3004"], "the API");
next.once("exit", (code, signal) => {
  stopChildren();
  process.exit(code ?? (signal ? 1 : 0));
});
