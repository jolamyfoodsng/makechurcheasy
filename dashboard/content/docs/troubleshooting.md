---
title: Troubleshooting
description: Fix the most common Sunday problems — OBS not connecting, a black projector, a missing camera, text not updating, the dock not loading — and how to get help.
nav: Troubleshooting
group: Help
order: 1
updated: October 2026
---

## OBS won't connect

1. **Check OBS is open.** Open OBS before you connect.
2. **Turn on the WebSocket server.** In OBS, go to **Tools → WebSocket Server Settings** and tick **Enable WebSocket server**, on port `4455`.
3. **Check the password.** If OBS has a password set, type the same one in MakeChurchEazy under **Settings → OBS Studio**. If you're not sure, turn off **Enable Authentication** in OBS and leave the password empty.
4. **Test it.** Choose **Test Connection**. Turn on **Auto-reconnect fallback** so it reconnects if OBS restarts.

> [!TIP] Firewall
> If OBS is on another computer, both must be on the same network, and the firewall on the OBS computer must allow port `4455`.

## The projector or TV stays black

- **Is something sent?** Make sure you pressed **Send** (or **Go Live**), not just Preview.
- **Is Black or Logo on?** Press **Alt + B** or **Alt + L** to turn it off, or right-click the monitor and choose **Show content again**.
- **See what the screen receives.** Click on the output screen and press **D**. It shows whether it's connected to the Studio and what it's showing.
- **Restart the output.** Choose **Stop output**, then **Start output** again.

## The camera doesn't show

| Message | What to do |
| --- | --- |
| Camera access is off | Choose **Allow camera**. On a Mac, check **System Settings → Privacy & Security → Camera**. On Windows, check **Settings → Privacy → Camera**. |
| The camera is busy in another app | Close the other app using it (Zoom, FaceTime, OBS or similar). |
| No camera found | Plug the webcam or capture card in, then choose **Refresh camera list**. |
| The Studio is not sending its camera to this screen | Quit MakeChurchEazy completely and open it again. |

For an NDI camera, install the free NDI Tools from ndi.video, then refresh the camera list.

## Text doesn't update in OBS, or a source is blank

- **Refresh the source.** In OBS, select the browser source, open **Properties** and choose **Refresh cache of current page**.
- **Open MakeChurchEazy before OBS.** The app refreshes its sources once when they connect, but never while you're streaming or recording.
- **"MCE Presentation scene was not found"** means the scene was removed or renamed. Refresh the dock and present an item again, and the scene is created again (on paid plans).

## The dock is blank or asks you to sign in

The dock shows **Authentication Required** until the desktop app is open and signed in. Open MakeChurchEazy, sign in, then choose **Refresh** in the dock.

Make sure you added the dock under **Docks → Custom Browser Docks** in OBS, not as a Browser Source. See [Set up OBS Studio](/docs/obs-setup#3-add-the-dock-to-obs).

## Updates

MakeChurchEazy checks for updates by itself. To check now, open **Settings** and choose **Check for Updates**, then **Install Update**. Very old versions must update before they can be used.

## Get help

- **In the app:** choose **Support** in the sidebar for WhatsApp, Telegram, email and help videos.
- **Online:** visit [Support](/support), watch the [tutorials](/tutorials), or email [support@makechurcheazy.com](mailto:support@makechurcheazy.com).

When you write to us, tell us your computer (Mac or Windows), the app version (in **Settings**), and what you see on the screen. A screenshot helps.
