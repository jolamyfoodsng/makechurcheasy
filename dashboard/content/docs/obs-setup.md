---
title: Set up OBS Studio
description: Connect MakeChurchEazy to OBS Studio, add the dock, and understand how scenes and sources are created on each plan.
nav: Set up OBS Studio
group: Set up
order: 2
updated: October 2026
---

MakeChurchEazy works with **OBS Studio 28 or later**. It talks to OBS through OBS's built-in WebSocket server, so there's no plugin to install for the basics.

## 1. Turn on the WebSocket server in OBS

1. **Open OBS Studio.** Go to **Tools → WebSocket Server Settings**.
2. **Enable it.** Tick **Enable WebSocket server**. Leave the port as `4455`.
3. **Optional: set a password.** If you set one, you'll type the same password into MakeChurchEazy.

## 2. Connect MakeChurchEazy

During first-time setup, the **Connect OBS Studio** step asks for **Host** (`localhost`), **Port** (`4455`) and **Password (optional)**. Choose **Test Connection**, and **Continue** once the status shows **Connected**.

To connect later, open **Settings → OBS Studio**:

- **WebSocket Host Address**: `ws://localhost:4455` when OBS runs on the same computer.
- **Password (Optional)**: the password you set in OBS, if any.
- Choose **Test Connection**. **Auto-reconnect fallback** reconnects by itself if OBS restarts.

The dashboard shows **OBS Connected** when it's working. You can also use **Connect to OBS** there.

> [!TIP] OBS on another computer
> Use that computer's network address instead of `localhost`, for example `ws://192.168.1.20:4455`, and make sure both computers are on the same network.

## 3. Add the dock to OBS

The dock is MakeChurchEazy's control panel inside OBS. Add it once:

1. **Copy the dock URL.** On the dashboard, open **How to Add a Dock in OBS** and use **Copy URL** next to **Bible Overlay Dock** (and **Scripture Assistant** if you want it).
2. **Add it in OBS.** In OBS, open **Docks → Custom Browser Docks**, give it a name, paste the URL and choose **Apply**.

The dock URLs are:

```text
http://127.0.0.1:45678/dock
http://127.0.0.1:45678/lm-dock
```

> [!WARNING] Docks, not sources
> These are OBS **dock** URLs. Don't add them as a Browser Source in a scene.

## How scenes and sources are created

### Basic and Growth plans

The first time you present a Bible verse or song, MakeChurchEazy creates a scene called **MCE Presentation** with the sources it needs, for example **Bible - MCE Presentation**, **Worship - MCE Presentation**, **Media - MCE Presentation**, **Lower Third - MCE Presentation** and **Countdown - MCE Presentation**. It keeps them up to date as you present. You don't need to build or edit them.

### Free plan

On the Free plan, MakeChurchEazy doesn't create or change anything in OBS. Instead:

1. **Copy the presentation link.** In the dock, find **OBS Browser Source** and choose **Copy presentation link**.
2. **Add it once in OBS.** Add a **Browser Source** to your scene, paste the link, and set the size to **1920 × 1080**.

Everything you present then appears in that one source.

## Optional: motion support

Some animated graphics use OBS's Move Transition plugin. If the app offers **Install motion support**, choose it to copy the plugin into OBS, then restart OBS. You can choose **Not now** and install it later.
