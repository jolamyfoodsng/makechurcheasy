---
title: System requirements and network
description: The computers and OBS versions MakeChurchEazy supports, what needs the internet, and the network ports it uses.
nav: Requirements and network
group: Help
order: 2
updated: October 2026
---

## System requirements

| | Supported |
| --- | --- |
| **Mac** | macOS 10.15 or later, on Apple silicon or Intel (separate downloads) |
| **Windows** | 64-bit Windows 10 or 11 |
| **OBS Studio** | Version 28 or later (needed only if you use OBS) |

For a smooth Sunday, a computer from the last few years with 8 GB of memory or more is a good start. If you also stream from the same computer, more memory and a dedicated graphics card help OBS.

## What needs the internet

| Works offline | Needs the internet |
| --- | --- |
| The built-in KJV Bible and Bible versions you've downloaded | Signing in and checking your plan |
| Your songs, notes and media | Downloading Bible versions |
| Studio mode and the projector screen | Verse AI (speech to scripture) and translation |
| Controlling OBS on the same computer or network | Online lyrics search |
| The Wi-Fi link and presentation link on your own network | Updates and tutorials |

## Network ports

You only need these if a firewall blocks something on your church network.

| Port | Used for |
| --- | --- |
| `45678` | The dock, the graphics OBS shows, and Studio mode's Wi-Fi link (this computer and your network) |
| `45679` | The Free plan's presentation link |
| `17891` | Live updates between the dock and the graphics (this computer only) |
| `4455` | OBS's own WebSocket server (set in OBS) |

> [!NOTE] Firewall prompts
> The first time you open MakeChurchEazy, your computer may ask whether to allow it on the network. Allow it on private networks so other screens can open the Wi-Fi link.
