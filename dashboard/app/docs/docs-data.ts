export interface DocNavItem {
  id: string;
  title: string;
  href: string;
  badge?: string;
  description?: string;
}

export interface NavSection {
  title: string;
  items: DocNavItem[];
}

export interface DocStep {
  number?: number;
  title: string;
  description: string;
  code?: string;
  codeLanguage?: string;
  note?: string;
}

export interface DocCallout {
  type: "tip" | "note" | "warn";
  title?: string;
  content: string;
}

export interface DocTable {
  headers: string[];
  rows: string[][];
}

export interface DocSectionContent {
  id: string;
  title: string;
  lead?: string;
  paragraphs?: string[];
  callout?: DocCallout;
  steps?: DocStep[];
  table?: DocTable;
  codeBlocks?: { label?: string; code: string; language?: string }[];
  faqs?: { question: string; answer: string }[];
}

export interface DocPageData {
  slug: string;
  title: string;
  subtitle?: string;
  seoTitle: string;
  description: string;
  keywords: string[];
  badge?: string;
  readingTime: string;
  lastUpdated: string;
  lead: string;
  toc: { id: string; title: string }[];
  jsonLd: Record<string, unknown>;
  sections: DocSectionContent[];
  prevPage?: { slug: string; title: string };
  nextPage?: { slug: string; title: string };
}

export const DOC_NAV_SECTIONS: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      {
        id: "overview",
        title: "Overview & Architecture",
        href: "/docs",
        badge: "Start Here",
        description: "Zero-latency church presentation architecture and core engine breakdown.",
      },
      {
        id: "obs-setup",
        title: "OBS Studio 30+ Integration",
        href: "/docs/obs-setup",
        badge: "Core",
        description: "WebSocket v5 setup on port 4455, custom browser docks, and transparent overlays.",
      },
    ],
  },
  {
    title: "Presentation Engines",
    items: [
      {
        id: "scripture-engine",
        title: "Scripture & Bible Engine",
        href: "/docs/scripture-engine",
        badge: "Core",
        description: "Natural-language scripture search, dual-version side-by-side, and Speech-to-Scripture AI.",
      },
      {
        id: "worship-lyrics",
        title: "Worship, Hymns & EasyWorship",
        href: "/docs/worship-lyrics",
        badge: "Popular",
        description: "1-Click Songs.db migration, Celestial Church CCC Hymnals, and stanza shortcuts.",
      },
      {
        id: "multiview-production",
        title: "Multi-View & Studio Switcher",
        href: "/docs/multiview-production",
        description: "Multi-camera canvas layouts, picture-in-picture, and OBS scene synchronization.",
      },
    ],
  },
  {
    title: "Hardware & Displays",
    items: [
      {
        id: "stage-display",
        title: "Mobile Remote & Stage Monitor",
        href: "/docs/stage-display",
        badge: "Mobile",
        description: "Wireless QR code pairing, singer confidence displays, and pulpit clocks.",
      },
      {
        id: "hardware-projection",
        title: "Projectors & Dual-Screen Routing",
        href: "/docs/hardware-projection",
        description: "Independent church screens, HDMI/DisplayPort routing, and ATEM Mini NDI setup.",
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting & Port Reference",
        href: "/docs/troubleshooting",
        badge: "Support",
        description: "Fix port conflicts (45678, 17891, 4455), black overlay boxes, and offline failover.",
      },
    ],
  },
];

export const DOC_PAGES: Record<string, DocPageData> = {
  overview: {
    slug: "overview",
    title: "MakeChurchEazy Documentation & Architecture Hub",
    subtitle: "High-speed church presentation and live-production workspace.",
    seoTitle: "MakeChurchEazy Documentation | Church Presentation & OBS Studio Guides",
    description:
      "Complete documentation for MakeChurchEazy: high-speed church presentation software connecting desktop computers to OBS Studio, projectors, and mobile confidence monitors with zero latency.",
    keywords: [
      "church presentation software",
      "OBS Studio church",
      "church worship software",
      "church media presentation",
      "EasyWorship alternative",
      "ProPresenter alternative",
      "church livestream software",
    ],
    badge: "v2.8 Master",
    readingTime: "5 min read",
    lastUpdated: "October 2026",
    lead:
      "MakeChurchEazy is a unified church presentation and live-broadcast system. Built with a native desktop core (Tauri + Rust) and a local high-speed WebSocket bridge, it replaces clunky legacy software with a crash-proof workspace that routes scriptures, worship lyrics, lower thirds, and video scenes directly to in-person auditorium projectors and OBS Studio livestreams simultaneously.",
    toc: [
      { id: "system-architecture", title: "System Architecture" },
      { id: "port-relay-map", title: "Port & Relay Network Map" },
      { id: "system-requirements", title: "System Requirements" },
      { id: "quickstart-workflow", title: "5-Minute Quickstart" },
      { id: "comparison-matrix", title: "Legacy Comparison Matrix" },
      { id: "sunday-morning-checklist", title: "Sunday Morning Checklist" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SoftwareApplication",
          name: "MakeChurchEazy",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Windows 10, Windows 11, macOS 12+, Linux",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          description:
            "Church presentation and OBS Studio livestream software for scriptures, lyrics, lower thirds, and multiview switching.",
        },
        {
          "@type": "TechArticle",
          headline: "MakeChurchEazy Architecture & Quickstart Documentation",
          description:
            "Architecture overview and quickstart guide for MakeChurchEazy church presentation software.",
          url: "https://makechurcheazy.com/docs",
          datePublished: "2026-01-15T08:00:00+01:00",
          dateModified: "2026-10-04T08:00:00+01:00",
          author: { "@type": "Organization", name: "MakeChurchEazy Team" },
          publisher: {
            "@type": "Organization",
            name: "MakeChurchEazy",
            logo: { "@type": "ImageObject", url: "https://makechurcheazy.com/homepage/logo.webp" },
          },
        },
      ],
    },
    sections: [
      {
        id: "system-architecture",
        title: "System Architecture & Core Principles",
        lead:
          "Traditional church software requires duplicating effort across multiple computers or complex capture cards. MakeChurchEazy unifies media control, auditorium projection, and livestream broadcasting into a single authoritative pipeline.",
        paragraphs: [
          "Unlike bulky presentation apps that consume 2GB+ of memory and freeze when pastors cite unexpected scriptures, MakeChurchEazy runs on a high-efficiency Rust-powered desktop engine.",
          "OBS Studio is treated as a first-class native display output. Rather than capturing a secondary window with chroma keys, MakeChurchEazy serves hardware-accelerated, transparent HTML5 motion overlays directly into OBS Browser Sources with 0ms local loopback latency.",
        ],
        callout: {
          type: "note",
          title: "100% Offline-First Resilience",
          content:
            "All core Bible translations (KJV, NIV, AMP, NLT, NKJV), imported song libraries, and template graphics are stored locally on your church laptop. Even if the church Wi-Fi or fiber connection drops entirely on Sunday morning, presentation never stutters.",
        },
      },
      {
        id: "port-relay-map",
        title: "Port & Relay Network Map",
        lead:
          "MakeChurchEazy coordinates several dedicated endpoints to ensure zero-collision communication between the desktop app, OBS Studio, and auditorium displays.",
        table: {
          headers: ["Port / Protocol", "Canonical Endpoint", "Function", "Latency Profile"],
          rows: [
            ["Port 45678 (HTTP)", "http://127.0.0.1:45678", "Embedded CEF Overlay Server (Bible, Lyrics, Lower Thirds, Dock)", "< 1ms (Localhost)"],
            ["Port 17891 (WS)", "ws://127.0.0.1:17891", "Real-time WebSocket Relay Bridge syncing desktop clicks to overlays", "Sub-millisecond"],
            ["Port 4455 (WS)", "ws://127.0.0.1:4455", "OBS Studio WebSocket v5 Server (Auto scene & source injection)", "1-3ms"],
            ["Port 45678 /dock", "http://127.0.0.1:45678/dock", "Custom Browser Dock for direct in-OBS slide control", "Direct CEF Frame"],
            ["HDMI / DP Out", "Secondary Display", "Full-screen auditorium projector window with high-contrast text", "Hardware V-Sync"],
          ],
        },
      },
      {
        id: "system-requirements",
        title: "System Requirements & Supported Environments",
        paragraphs: [
          "MakeChurchEazy is engineered to perform reliably on standard church laptops without requiring top-tier gaming hardware.",
        ],
        table: {
          headers: ["Operating System", "Minimum Hardware", "Recommended Church Setup"],
          rows: [
            ["Windows", "Windows 10 / 11 (64-bit), Intel Core i3 8th Gen / Ryzen 3, 4GB RAM", "Intel Core i5/i7 10th Gen+, 16GB RAM, Dedicated NVIDIA GTX 1650+ (if streaming 1080p60)"],
            ["macOS", "macOS 12 Monterey or newer, Intel or Apple Silicon (M1/M2/M3/M4)", "Apple Silicon M1/M2/M3 with 16GB Unified Memory, dual HDMI/Thunderbolt monitor outputs"],
            ["OBS Studio", "OBS Studio 28.0+ (native WebSocket v5 support)", "OBS Studio 30.1+ with Hardware Acceleration enabled for Browser Sources"],
          ],
        },
      },
      {
        id: "quickstart-workflow",
        title: "5-Minute Quickstart Workflow",
        lead: "Get your church service live in five simple steps:",
        steps: [
          {
            number: 1,
            title: "Download & Launch MakeChurchEazy",
            description: "Install the desktop application from the Downloads portal. Sign in with your church administrator account or pair a new device with a 6-digit sync PIN.",
          },
          {
            number: 2,
            title: "Enable OBS Studio WebSocket v5",
            description: "Inside OBS Studio, open Tools ➔ WebSocket Server Settings. Ensure 'Enable WebSocket server' is checked (Port 4455).",
            code: "Server Port: 4455\nEnable Authentication: Optional (Recommended for shared church Wi-Fi)",
            codeLanguage: "plaintext",
          },
          {
            number: 3,
            title: "Connect MakeChurchEazy to OBS",
            description: "In MakeChurchEazy, click 'Connect OBS' in the bottom toolbar. The app automatically establishes bidirectional sync.",
          },
          {
            number: 4,
            title: "Project Your First Scripture or Worship Song",
            description: "Type 'John 3:16' or search for your favorite hymn in the search bar. Press Spacebar to take it live to both OBS and the church screen.",
          },
          {
            number: 5,
            title: "Pair Mobile Confidence Monitor (Optional)",
            description: "Navigate to Devices ➔ Pair Mobile and scan the QR code using any smartphone or iPad for wireless pulpit and choir stage control.",
          },
        ],
      },
      {
        id: "comparison-matrix",
        title: "Platform Comparison Matrix",
        lead: "Compare MakeChurchEazy directly against legacy church presentation tools:",
        table: {
          headers: ["Feature / Capability", "Legacy Tools (EasyWorship / ProPresenter)", "MakeChurchEazy"],
          rows: [
            ["OBS Studio Integration", "Requires NDI licenses, window captures, or secondary PCs", "Native 1-click WebSocket v5 + 0ms transparent browser sources"],
            ["Scripture Lookup Speed", "Hierarchical dropdown clicking (Book ➔ Chapter ➔ Verse)", "Sub-millisecond natural language parser ('Jn 3:16', 'Rom 8:28')"],
            ["Speech-to-Scripture AI", "Not available or requires expensive third-party plugins", "Built-in live voice recognition detects pastor scriptures in real-time"],
            ["Dual-Version Bible Display", "Complex slide duplication or separate monitors", "1-Click side-by-side or stacked comparative translation view"],
            ["Hymnal Library", "Manual typing or separate paywalled hymnbooks", "Pre-loaded Celestial Church CCC Hymnals, Baptist Hymnal, and standard hymns"],
            ["Mobile Confidence Remote", "Paid companion license or clunky local subnet setup", "Instant web-based mobile remote via QR code or 6-digit sync PIN"],
            ["RAM & CPU Consumption", "1.8GB – 3.2GB RAM (Heavy Electron/WPF)", "Under 250MB RAM idle (Lightweight Rust/Tauri architecture)"],
          ],
        },
      },
      {
        id: "sunday-morning-checklist",
        title: "Sunday Morning 5-Minute Checklist",
        lead: "Run this quick verification checklist 15 minutes before the opening prayer:",
        steps: [
          {
            number: 1,
            title: "Launch MakeChurchEazy Desktop",
            description: "Verify that the local embedded server starts cleanly at http://127.0.0.1:45678 and status indicates 'Ready'.",
          },
          {
            number: 2,
            title: "Open OBS Studio & Confirm Green Tally",
            description: "Check the bottom status bar in MakeChurchEazy. The OBS indicator should show a solid green 'OBS Connected' dot.",
          },
          {
            number: 3,
            title: "Test Test-Slide Projection",
            description: "Press Spacebar on a test scripture. Confirm that the transparent lower-third appears on OBS Preview and full-screen text displays on the projector.",
          },
          {
            number: 4,
            title: "Verify Sermon Theme & Pre-Service Order",
            description: "Load today's sermon scripture, worship setlist, and speaker lower-thirds into the quick-access staging queue.",
          },
          {
            number: 5,
            title: "Confirm Mobile Pulpit / Choir Remote",
            description: "If the pastor or worship leader uses a pulpit iPad, open the pairing link and confirm wireless slide progression.",
          },
        ],
      },
    ],
    nextPage: { slug: "obs-setup", title: "OBS Studio 30+ Integration" },
  },

  "obs-setup": {
    slug: "obs-setup",
    title: "OBS Studio 30+ Integration & Transparent Browser Overlays",
    subtitle: "Complete guide for automatic 1-click OBS connection, browser docks, and transparent overlays.",
    seoTitle: "OBS Studio Church Setup Guide | Transparent Overlays & Docks | MakeChurchEazy",
    description:
      "Step-by-step setup guide for OBS Studio 30+ with MakeChurchEazy: configure WebSocket v5 on port 4455, custom browser docks on port 45678, alpha transparency CSS, and multi-scene lower thirds.",
    keywords: [
      "OBS Studio church setup",
      "OBS browser source church",
      "OBS Bible overlay transparent",
      "OBS worship lyrics",
      "OBS lower thirds transparent",
      "church livestream OBS 30",
      "OBS websocket v5 port 4455",
    ],
    badge: "Most Popular",
    readingTime: "6 min read",
    lastUpdated: "October 2026",
    lead:
      "MakeChurchEazy communicates directly with OBS Studio 28, 29, and 30+ via the official OBS WebSocket v5 protocol. With MakeChurchEazy, you never have to wrestle with green-screen chroma keying, blurry window captures, or manual lower-third positioning. Everything renders as crisp, transparent HTML5 motion graphics with 0ms latency.",
    toc: [
      { id: "websocket-connection", title: "1. Enable OBS WebSocket v5" },
      { id: "automatic-connection", title: "2. Automatic 1-Click Connection" },
      { id: "browser-overlay-endpoints", title: "3. Transparent Overlay Endpoints" },
      { id: "custom-css-transparency", title: "4. Alpha Transparency CSS Guide" },
      { id: "custom-browser-dock", title: "5. In-OBS Control Dock Setup" },
      { id: "performance-optimizations", title: "6. OBS Performance Settings" },
      { id: "obs-troubleshooting", title: "7. Common OBS Issues & Fixes" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "HowTo",
          name: "How to Connect MakeChurchEazy to OBS Studio 30+",
          description:
            "Step-by-step tutorial to configure OBS Studio WebSocket v5 and embed transparent church overlays.",
          url: "https://makechurcheazy.com/docs/obs-setup",
          step: [
            {
              "@type": "HowToStep",
              name: "Enable WebSocket Server in OBS",
              text: "Open OBS Studio Tools ➔ WebSocket Server Settings. Check Enable WebSocket server on Port 4455.",
            },
            {
              "@type": "HowToStep",
              name: "Connect from MakeChurchEazy",
              text: "Click Connect OBS in MakeChurchEazy toolbar and input port 4455.",
            },
            {
              "@type": "HowToStep",
              name: "Add Browser Source Overlays",
              text: "Create a Browser Source in OBS pointing to http://127.0.0.1:45678/mce-bible-overlay.html with 1920x1080 resolution.",
            },
          ],
        },
      ],
    },
    sections: [
      {
        id: "websocket-connection",
        title: "1. Enable OBS WebSocket v5 in OBS Studio",
        lead:
          "OBS Studio 28 and newer includes the high-performance WebSocket v5 server built-in. No external plugins are required.",
        steps: [
          {
            number: 1,
            title: "Open WebSocket Settings",
            description: "Launch OBS Studio. In the top application menu bar, navigate to Tools ➔ WebSocket Server Settings.",
          },
          {
            number: 2,
            title: "Check 'Enable WebSocket server'",
            description: "Ensure the 'Enable WebSocket server' box is ticked. Verify that Server Port is set to 4455 (the official standard port).",
            code: "Server Port: 4455\nServer Password: [Optional — leave blank or set a strong password]",
            codeLanguage: "plaintext",
          },
          {
            number: 3,
            title: "Save & Apply",
            description: "Click Apply and OK. OBS Studio is now listening for commands from MakeChurchEazy.",
          },
        ],
        callout: {
          type: "tip",
          title: "Using OBS on the Same Computer?",
          content:
            "If MakeChurchEazy and OBS Studio are running on the same PC/Mac, the host address is always 127.0.0.1 (localhost). You do not need an active internet connection for this bridge to function.",
        },
      },
      {
        id: "automatic-connection",
        title: "2. Automatic 1-Click Connection from MakeChurchEazy",
        paragraphs: [
          "Once OBS WebSocket is active, open MakeChurchEazy desktop application. In the bottom-right status bar or inside Settings ➔ OBS Studio, click the Connect OBS button.",
          "MakeChurchEazy will establish a heartbeat handshake. If you configured a password in OBS, enter it in the password modal. When connected, the indicator turns solid green with the message 'OBS Studio Connected (v5)'.",
        ],
        callout: {
          type: "note",
          title: "Auto-Reconnect Daemon",
          content:
            "If OBS Studio crashes or is restarted during service, MakeChurchEazy automatically reconnects in the background with exponential backoff. You do not need to restart MakeChurchEazy.",
        },
      },
      {
        id: "browser-overlay-endpoints",
        title: "3. Transparent Overlay Endpoints Reference",
        lead:
          "MakeChurchEazy's local server (port 45678) provides dedicated, lightweight HTML5 endpoints for different church visual needs. Add them as Browser Sources in OBS:",
        table: {
          headers: ["Source Type", "Exact OBS URL", "Recommended Canvas", "Typical Placement"],
          rows: [
            ["Bible Scripture Overlay", "http://127.0.0.1:45678/mce-bible-overlay.html", "1920 x 1080", "Top layer over sermon camera; displays transparent animated lower-third verses"],
            ["Worship Lyrics Overlay", "http://127.0.0.1:45678/mce-worship-overlay.html", "1920 x 1080", "Bottom lower-third; displays dynamic stanzas, choruses, and artist tags"],
            ["Speaker & Announcements", "http://127.0.0.1:45678/mce-template-overlay.html", "1920 x 1080", "Lower-third name badge, sermon titles, and offering bank account graphics"],
            ["Multiview Media Overlay", "http://127.0.0.1:45678/mce-media-overlay.html", "1920 x 1080", "Full-screen picture-in-picture layout or side-by-side scripture + video"],
            ["Auditorium Display (No OBS)", "http://127.0.0.1:45678/presentation", "1920 x 1080", "Direct high-contrast full-screen view for auditorium projectors / HDMI TVs"],
          ],
        },
      },
      {
        id: "custom-css-transparency",
        title: "4. Alpha Transparency CSS Guide",
        lead:
          "To guarantee that your live camera feed remains completely visible behind lower-thirds and lyrics, OBS requires clean alpha transparency styling.",
        paragraphs: [
          "In OBS Studio, right-click your Browser Source ➔ select Properties. Ensure the Custom CSS box matches the snippet below:",
        ],
        codeBlocks: [
          {
            label: "OBS Browser Source Custom CSS (Copy & Paste)",
            code: "body {\n  background-color: rgba(0, 0, 0, 0) !important;\n  margin: 0px auto;\n  overflow: hidden;\n}",
            language: "css",
          },
        ],
        callout: {
          type: "warn",
          title: "Avoid the Black Box Glitch",
          content:
            "If your scripture or lyrics overlay appears with an opaque black box over the camera, ensure you uncheck 'Shutdown source when not visible' in OBS Browser Source properties. This prevents OBS from unloading the transparent DOM when switching scenes.",
        },
      },
      {
        id: "custom-browser-dock",
        title: "5. In-OBS Custom Browser Dock Setup",
        lead:
          "You can control your entire church presentation without ever leaving OBS Studio by embedding MakeChurchEazy as a native OBS Custom Dock:",
        steps: [
          {
            number: 1,
            title: "Open Custom Browser Docks",
            description: "In OBS Studio, navigate to the top menu bar: Docks ➔ Custom Browser Docks...",
          },
          {
            number: 2,
            title: "Add Dock Name & Local URL",
            description: "Enter 'MakeChurchEazy' in the Dock Name field. Set the URL to http://127.0.0.1:45678/dock.",
            code: "Dock Name: MakeChurchEazy Control\nURL: http://127.0.0.1:45678/dock",
            codeLanguage: "plaintext",
          },
          {
            number: 3,
            title: "Dock Inside OBS Workspace",
            description: "Click Apply. A draggable dock window will appear. Snap it directly beside your OBS Scene Switcher or Audio Mixer for unified single-monitor control.",
          },
        ],
      },
      {
        id: "performance-optimizations",
        title: "6. OBS Performance Settings for Smooth 60fps Broadcasts",
        paragraphs: [
          "To ensure that animated lower-thirds slide smoothly without dropping stream frames:",
          "1. In OBS Studio ➔ Settings ➔ Advanced ➔ Sources: Ensure 'Enable Browser Source Hardware Acceleration' is checked. Restart OBS after toggling.",
          "2. Keep the Browser Source dimensions set to exactly your OBS Base Canvas resolution (usually 1920x1080). Do not scale or stretch the browser source using red transformation handles.",
        ],
      },
      {
        id: "obs-troubleshooting",
        title: "7. Frequently Asked OBS Questions",
        faqs: [
          {
            question: "Why does OBS say 'Authentication failed' when connecting?",
            answer:
              "Check OBS Studio ➔ Tools ➔ WebSocket Server Settings. If 'Enable Authentication' is checked, you must copy the exact server password and enter it in MakeChurchEazy Settings. If you do not require a password on your local church network, uncheck it.",
          },
          {
            question: "Can I use MakeChurchEazy with vMix, ATEM Mini, or Wirecast instead of OBS?",
            answer:
              "Yes! All MakeChurchEazy overlay endpoints (such as http://127.0.0.1:45678/mce-bible-overlay.html) are standard HTML5 URLs. You can add them directly as Browser inputs in vMix, or output a secondary HDMI monitor into an ATEM Mini key/fill channel.",
          },
          {
            question: "Do overlays update in real-time when I change Bible versions?",
            answer:
              "Yes. The local WebSocket relay bridge (ws://127.0.0.1:17891) synchronizes clicks in under 1 millisecond. When you click KJV, AMP, or type a new reference, the OBS overlay transitions instantly.",
          },
        ],
      },
    ],
    prevPage: { slug: "overview", title: "Overview & Architecture" },
    nextPage: { slug: "scripture-engine", title: "Scripture & Bible Engine" },
  },

  "scripture-engine": {
    slug: "scripture-engine",
    title: "Scripture Engine & Bible Presentation Guide",
    subtitle: "Natural language search, dual-version side-by-side display, and Speech-to-Scripture AI.",
    seoTitle: "Fast Scripture Projection & Bible Search Engine | MakeChurchEazy Docs",
    description:
      "Master church Bible projection in MakeChurchEazy: natural-language book search (e.g. Jn 3:16), dual-version comparative display, speech-to-scripture AI, and 100% offline translations.",
    keywords: [
      "church Bible presentation software",
      "Bible projection software",
      "dual version Bible display",
      "church scripture search",
      "speech to scripture church",
      "fast Bible verses OBS",
      "offline Bible projector",
    ],
    badge: "Core Feature",
    readingTime: "5 min read",
    lastUpdated: "October 2026",
    lead:
      "During live preaching, pastors frequently cite scriptures without prior warning. MakeChurchEazy's Scripture Engine is built for high-speed live church environments: natural-language parsing locates passages in milliseconds, dual-version comparison clarifies biblical nuances, and Speech-to-Scripture AI listens to the sermon to queue verses automatically.",
    toc: [
      { id: "natural-search", title: "1. Natural-Language Reference Parser" },
      { id: "keyboard-shortcuts", title: "2. Keyboard-First Live Workflow" },
      { id: "dual-version-display", title: "3. Dual-Version Comparative Mode" },
      { id: "offline-translations", title: "4. Supported Translations & Offline Storage" },
      { id: "speech-to-scripture", title: "5. Speech-to-Scripture AI ('Verse AI')" },
      { id: "broadcast-typography", title: "6. Broadcast Typography & Styling" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "TechArticle",
          headline: "Scripture Engine & Bible Presentation Guide",
          description:
            "Guide to projecting Bible scriptures rapidly with MakeChurchEazy natural search and dual translations.",
          url: "https://makechurcheazy.com/docs/scripture-engine",
          author: { "@type": "Organization", name: "MakeChurchEazy Team" },
        },
      ],
    },
    sections: [
      {
        id: "natural-search",
        title: "1. Natural-Language Reference Parser",
        lead:
          "Never click through slow dropdowns again. The search parser understands standard book names, common abbreviations, multi-verse spans, and chapter jumps:",
        table: {
          headers: ["What You Type", "Engine Interpretation", "Result Output"],
          rows: [
            ["Jn 3:16", "John Chapter 3, Verse 16", "Single verse card formatted for immediate projection"],
            ["Psalm 23 1-4", "Psalms Chapter 23, Verses 1 through 4", "Multi-verse sequence broken into readable slides"],
            ["1 Cor 13", "First Corinthians Chapter 13", "Full chapter loaded with quick verse-by-verse navigation"],
            ["Rom 8:28 AMP", "Romans 8:28 in Amplified translation", "Directly targets requested translation"],
            ["Matt 5:3-10", "Matthew 5:3 to 5:10 (Beatitudes)", "Structured sequence with auto-pagination"],
          ],
        },
      },
      {
        id: "keyboard-shortcuts",
        title: "2. Keyboard-First Live Workflow",
        lead:
          "Keep your hands on the keyboard for maximum operational speed during fast-paced sermons:",
        table: {
          headers: ["Key / Shortcut", "Action Taken", "Description"],
          rows: [
            ["Spacebar", "Take Live", "Instantly broadcasts current preview verse to OBS overlay and projector"],
            ["Enter", "Preview Verse", "Loads verse into the operator preview monitor without taking it live"],
            ["Up / Down Arrows", "Next / Previous Verse", "Advances through chapter verses smoothly"],
            ["Esc or F12", "Instant Blackout (Clear)", "Immediately clears scripture from screens to black without lag"],
            ["Tab", "Toggle Translation", "Quickly cycles through active Bible translations (e.g., KJV ➔ AMP)"],
          ],
        },
      },
      {
        id: "dual-version-display",
        title: "3. Dual-Version Comparative Mode",
        paragraphs: [
          "Many preachers quote the King James Version (KJV) alongside the Amplified Bible (AMP) or New International Version (NIV) to highlight theological meanings.",
          "In MakeChurchEazy, click the 'Dual Version' toggle in the Bible tab. Select Translation A (e.g. KJV) and Translation B (e.g. AMP).",
          "The engine formats both translations into a balanced side-by-side or stacked card layout with synchronized verse highlighting, projecting both clearly to your congregation.",
        ],
      },
      {
        id: "offline-translations",
        title: "4. Supported Translations & 100% Offline Storage",
        paragraphs: [
          "MakeChurchEazy stores your Bible database in local SQLite / IndexedDB storage on your hard drive. Pre-bundled translations include:",
          "• King James Version (KJV)\n• New International Version (NIV)\n• Amplified Bible Classic (AMP)\n• New Living Translation (NLT)\n• New King James Version (NKJV)\n• English Standard Version (ESV)\n• Yoruba Bible (Bibeli Mimo) and regional West African translations",
        ],
        callout: {
          type: "tip",
          title: "Zero Internet Required",
          content:
            "You can take your laptop deep into rural camps or sanctuaries without network coverage. All Bible queries execute locally in under 2 milliseconds.",
        },
      },
      {
        id: "speech-to-scripture",
        title: "5. Speech-to-Scripture AI ('Verse AI')",
        lead:
          "MakeChurchEazy includes an intelligent microphone transcription engine that listens to the preacher and queues scriptures automatically:",
        steps: [
          {
            number: 1,
            title: "Select Audio Input",
            description: "In Settings ➔ Speech-to-Scripture, select your audio source (such as your Behringer X32 USB card, Focusrite interface, or room mic).",
          },
          {
            number: 2,
            title: "Enable Live Verse Detection",
            description: "Toggle 'Live Speech Detection' on. The engine listens for phrases like 'Let us turn our Bibles to Philippians 4 verse 19'.",
          },
          {
            number: 3,
            title: "One-Click or Auto-Project",
            description: "When detected, the scripture appears highlighted in your dock staging panel with a 1-click 'Take Live' button, or can be set to auto-project after a 3-second operator confirmation window.",
          },
        ],
      },
      {
        id: "broadcast-typography",
        title: "6. Broadcast Typography & Safe-Area Styling",
        paragraphs: [
          "Auditorium projectors and livestream video have different contrast requirements. The Scripture Engine automatically applies Broadcast Bold outer strokes (2px black outline) and subtle drop shadows so verses remain crisp over both bright stage lighting and dark camera backgrounds.",
        ],
      },
    ],
    prevPage: { slug: "obs-setup", title: "OBS Studio Integration" },
    nextPage: { slug: "worship-lyrics", title: "Worship & EasyWorship Import" },
  },

  "worship-lyrics": {
    slug: "worship-lyrics",
    title: "Worship Lyrics, EasyWorship Import & Hymnals",
    subtitle: "Import Songs.db in seconds, project CCC hymnals, and manage live worship stanzas.",
    seoTitle: "Import EasyWorship Songs & Project Church Hymns | MakeChurchEazy Docs",
    description:
      "Learn how to import Songs.db directly from EasyWorship, project built-in Celestial Church of Christ (CCC) Hymnals and Baptist hymnals, format lyrics, and navigate verses with quick hotkeys.",
    keywords: [
      "import EasyWorship Songs db",
      "EasyWorship alternative",
      "CCC hymnal software",
      "Celestial Church of Christ hymns display",
      "church worship lyrics projection",
      "worship stanza hotkeys",
      "CCLI SongSelect integration",
    ],
    badge: "Most Requested",
    readingTime: "5 min read",
    lastUpdated: "October 2026",
    lead:
      "Switching presentation software usually means dreading the manual copy-pasting of hundreds of church worship songs. MakeChurchEazy eliminates migration friction with a 1-Click native EasyWorship importer, pre-bundled denominational hymnals, and hotkey stanza navigation designed for fluid worship services.",
    toc: [
      { id: "easyworship-migration", title: "1. 1-Click EasyWorship Migration" },
      { id: "denominational-hymnals", title: "2. Celestial Church CCC & Baptist Hymnals" },
      { id: "worship-hotkeys", title: "3. Live Worship Stanza Hotkeys" },
      { id: "lyric-formatting", title: "4. Stanza Formatting & CCLI Copyrights" },
      { id: "cloud-song-sync", title: "5. Cloud Backup & Multi-Operator Sync" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "HowTo",
          name: "How to Import EasyWorship Songs.db into MakeChurchEazy",
          description:
            "Step-by-step guide to importing existing EasyWorship databases into MakeChurchEazy without losing stanzas.",
          url: "https://makechurcheazy.com/docs/worship-lyrics",
          step: [
            {
              "@type": "HowToStep",
              name: "Locate Songs.db File",
              text: "Find your EasyWorship database in C:\\Users\\Public\\Documents\\Softouch\\EasyWorship\\Default\\Databases\\Data\\Songs.db",
            },
            {
              "@type": "HowToStep",
              name: "Open MakeChurchEazy Import Tool",
              text: "Navigate to Worship Tab ➔ Import Songs ➔ EasyWorship (.db).",
            },
            {
              "@type": "HowToStep",
              name: "Verify & Index Library",
              text: "Click Import. Songs are parsed, stanzas tagged, and indexed into local search in seconds.",
            },
          ],
        },
      ],
    },
    sections: [
      {
        id: "easyworship-migration",
        title: "1. 1-Click EasyWorship (.db) Migration",
        lead:
          "You can import your entire EasyWorship song library in less than 30 seconds:",
        steps: [
          {
            number: 1,
            title: "Navigate to Song Importer",
            description: "In MakeChurchEazy, click Worship Tab in the left sidebar, then click Import Songs ➔ EasyWorship (.db).",
          },
          {
            number: 2,
            title: "Select your Songs.db File",
            description: "On Windows, EasyWorship stores its master database at the standard public documents path:",
            code: "C:\\Users\\Public\\Documents\\Softouch\\EasyWorship\\Default\\Databases\\Data\\Songs.db",
            codeLanguage: "plaintext",
          },
          {
            number: 3,
            title: "Instant Ingestion & Tagging",
            description: "MakeChurchEazy reads the database directly. Song titles, author metadata, copyright information, and verse/chorus breakdowns are automatically indexed into your searchable local library.",
          },
        ],
        callout: {
          type: "tip",
          title: "ProPresenter & Text Import Supported",
          content:
            "If your church previously used ProPresenter, OpenLP, or plain text files, you can also import TXT, PDF sets, or CCLI SongSelect files directly via the same Import menu.",
        },
      },
      {
        id: "denominational-hymnals",
        title: "2. Celestial Church of Christ (CCC) & Baptist Hymnals",
        paragraphs: [
          "MakeChurchEazy comes pre-loaded with numbered denominational hymnals, saving countless hours for African and liturgical churches:",
          "• Celestial Church of Christ (CCC) Hymnal: Complete collection with Yoruba, English, and French hymn numbers, stanzas, antiphons, and special service songs.",
          "• Baptist Hymnal & Standard Christian Hymns: Classic hymns categorized by theme (Praise, Adoration, Communion, Funeral, Thanksgiving).",
          "Simply type the hymn number (e.g. 'CCC 176' or 'Hymn 245') into the search box to load all stanzas instantly.",
        ],
      },
      {
        id: "worship-hotkeys",
        title: "3. Live Worship Stanza Hotkeys",
        lead:
          "Worship teams often repeat choruses, skip verses, or linger on a bridge unexpectedly. MakeChurchEazy provides single-key shortcuts so operators stay in sync with the Holy Spirit:",
        table: {
          headers: ["Key", "Stanza Target", "Action Description"],
          rows: [
            ["V", "Verse", "Jumps to Verse 1 (or type V2, V3 to jump directly to specific verses)"],
            ["C", "Chorus", "Immediately jumps to the main Chorus"],
            ["B", "Bridge", "Transitions cleanly to the Bridge stanza"],
            ["T", "Tag / Vamp", "Jumps to the ending Tag or spontaneous repeat line"],
            ["E", "Ending", "Transitions to the outro / closing stanza"],
            ["Spacebar", "Take Live", "Broadcasts selected stanza to projector and OBS overlay"],
            ["Esc", "Blackout / Clear", "Clears lyrics from display immediately"],
          ],
        },
      },
      {
        id: "lyric-formatting",
        title: "4. Stanza Formatting & CCLI Copyrights",
        paragraphs: [
          "MakeChurchEazy automatically formats lyrics into comfortable 2-to-4 line stanzas with generous line height for maximum congregational legibility.",
          "In Settings ➔ Copyright & CCLI, enter your church CCLI license number. The software automatically appends compliant legal copyright text to the first and last slides of each song.",
        ],
      },
      {
        id: "cloud-song-sync",
        title: "5. Cloud Backup & Multi-Operator Sync",
        paragraphs: [
          "Songs added or edited on one computer automatically back up to your church cloud vault when connected to the internet. If an operator prepares the setlist on a personal laptop at home on Saturday, it syncs to the church media computer automatically on Sunday morning.",
        ],
      },
    ],
    prevPage: { slug: "scripture-engine", title: "Scripture Engine" },
    nextPage: { slug: "multiview-production", title: "Multi-View & Studio Switcher" },
  },

  "multiview-production": {
    slug: "multiview-production",
    title: "Multi-View Studio & Broadcast Production Guide",
    subtitle: "Canvas layouts, picture-in-picture, audio monitoring, and OBS scene switching.",
    seoTitle: "Church Studio Multi-View & Camera Switcher Guide | MakeChurchEazy Docs",
    description:
      "Configure multi-camera layouts, picture-in-picture (PIP), side-by-side pastor and scripture scenes, OBS audio monitoring, and tally indicators for professional church livestreams.",
    keywords: [
      "church multiview switcher",
      "multi camera church livestream",
      "OBS scene switcher church",
      "pastor picture in picture",
      "church live broadcast audio tally",
      "OBS camera grid church",
    ],
    badge: "Broadcast",
    readingTime: "4 min read",
    lastUpdated: "October 2026",
    lead:
      "For churches running multi-camera broadcasts, MakeChurchEazy includes a Studio Multi-View switcher. Monitor camera angles, preview program and preview tallies, control audio levels, and trigger side-by-side scripture and video layouts without switching back and forth between complicated OBS windows.",
    toc: [
      { id: "multiview-layouts", title: "1. Studio Canvas Layouts" },
      { id: "pip-side-by-side", title: "2. Picture-in-Picture & Split Screen" },
      { id: "scene-synchronization", title: "3. OBS Scene Sync & Tally Indicators" },
      { id: "audio-monitoring", title: "4. Audio Peak Monitoring & Ducking" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "TechArticle",
          headline: "Multi-View Studio & Broadcast Production Guide",
          description:
            "Guide to running multi-camera studio production and OBS scene switching in MakeChurchEazy.",
          url: "https://makechurcheazy.com/docs/multiview-production",
          author: { "@type": "Organization", name: "MakeChurchEazy Team" },
        },
      ],
    },
    sections: [
      {
        id: "multiview-layouts",
        title: "1. Studio Canvas Layouts",
        lead:
          "The Multi-View workspace gives your live director an eagle-eye view of all broadcast sources:",
        table: {
          headers: ["Layout Preset", "Description", "Best Use Case"],
          rows: [
            ["1 x 1 Solo", "Full-frame camera view with overlaid transparent lower-thirds", "Standard sermon camera or worship leader shot"],
            ["2 x 2 Multi-Cam", "Four-source grid displaying Altar, Choir, Pulpit, and Congregation cameras", "Camera monitoring for live director"],
            ["Side-by-Side (50/50)", "Camera on left half, scripture / notes card on right half", "Sermon points, teaching diagrams, Bible exposition"],
            ["PIP (Bottom-Right)", "Main presentation slide full screen with small pastor camera in corner", "Bible study slides, video testimonies, announcements"],
          ],
        },
      },
      {
        id: "pip-side-by-side",
        title: "2. Picture-in-Picture & Split Screen Setup",
        paragraphs: [
          "When preaching from intricate scripture texts, showing both the pastor's facial expression and the Bible text side-by-side keeps online viewers engaged.",
          "In MakeChurchEazy Multi-View tab, click 'Side-by-Side Scripture'. The app automatically commands OBS to position your primary camera input and the MakeChurchEazy scripture overlay cleanly within broadcast-safe margins.",
        ],
      },
      {
        id: "scene-synchronization",
        title: "3. OBS Scene Sync & Tally Indicators",
        paragraphs: [
          "MakeChurchEazy listens to OBS WebSocket events in real-time:",
          "• Red Tally (Program): Highlights the scene currently live on the broadcast stream.\n• Green Tally (Preview): Highlights the scene staged for transition in OBS Studio Studio Mode.",
          "You can trigger scene cuts, fades, and stinger transitions directly from MakeChurchEazy without reaching for the OBS keyboard.",
        ],
      },
      {
        id: "audio-monitoring",
        title: "4. Audio Peak Monitoring & Ducking",
        paragraphs: [
          "Monitor Master and Mic audio levels in real-time. MakeChurchEazy displays dBFS peak meters and warns operators if the pastor's lapel microphone is clipping into red distortion (+0 dBFS) during intense preaching.",
        ],
      },
    ],
    prevPage: { slug: "worship-lyrics", title: "Worship & Hymnals" },
    nextPage: { slug: "stage-display", title: "Mobile Remote & Stage Monitor" },
  },

  "stage-display": {
    slug: "stage-display",
    title: "Mobile Remote & Stage Confidence Monitor Guide",
    subtitle: "Pulpit tablet control, singer confidence displays, and discrete stage messaging.",
    seoTitle: "Church Stage Confidence Monitor & Mobile Remote | MakeChurchEazy Docs",
    description:
      "Turn any iPad, tablet, or smartphone into a low-latency wireless church controller. Setup singer confidence monitors with next-line lyric previews, pulpit countdown clocks, and backstage alerts.",
    keywords: [
      "church confidence monitor",
      "stage display lyrics",
      "wireless church presentation remote",
      "church mobile remote control",
      "pulpit countdown timer",
      "pastor tablet remote church",
    ],
    badge: "Hardware-Free",
    readingTime: "5 min read",
    lastUpdated: "October 2026",
    lead:
      "Media operators shouldn't have to remain locked behind a sound booth desk. MakeChurchEazy includes instant wireless device pairing that turns any smartphone, iPad, or TV into a low-latency remote controller or stage confidence display without installing special app store software.",
    toc: [
      { id: "device-pairing", title: "1. Wireless Device Pairing (QR Code & PIN)" },
      { id: "mobile-remote-view", title: "2. Mobile Handheld Remote Mode" },
      { id: "confidence-monitor-view", title: "3. Stage Confidence Monitor Mode" },
      { id: "backstage-alerts", title: "4. Discrete Backstage Stage Messaging" },
      { id: "countdown-clocks", title: "5. Sermon Timers & Service Countdowns" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "HowTo",
          name: "How to Setup Church Stage Confidence Monitor & Mobile Remote",
          description:
            "Pair an iPad or TV screen to act as a wireless confidence monitor for worship leaders and pastors.",
          url: "https://makechurcheazy.com/docs/stage-display",
          step: [
            {
              "@type": "HowToStep",
              name: "Open Devices Menu",
              text: "In MakeChurchEazy desktop, open Devices ➔ Pair Device to view QR code and 6-digit sync PIN.",
            },
            {
              "@type": "HowToStep",
              name: "Scan QR Code on Mobile Device",
              text: "Scan with your phone or visit https://makechurcheazy.com/devices on any tablet browser.",
            },
            {
              "@type": "HowToStep",
              name: "Select Display Role",
              text: "Choose 'Mobile Controller' for handheld slide control or 'Stage Confidence Monitor' for singers.",
            },
          ],
        },
      ],
    },
    sections: [
      {
        id: "device-pairing",
        title: "1. Wireless Device Pairing via QR Code & PIN",
        lead:
          "Connecting mobile devices takes less than 10 seconds without typing passwords:",
        steps: [
          {
            number: 1,
            title: "Open Pair Device Modal",
            description: "In MakeChurchEazy, click Devices ➔ Pair Device in the upper-right menu.",
          },
          {
            number: 2,
            title: "Scan QR Code with Phone Camera",
            description: "Point an iPhone, iPad, or Android camera at the QR code on the desktop monitor, or visit https://makechurcheazy.com/devices and enter the 6-digit sync PIN.",
          },
          {
            number: 3,
            title: "Instant Secure Handshake",
            description: "The mobile browser establishes a low-latency WebSocket connection directly to your church session.",
          },
        ],
      },
      {
        id: "mobile-remote-view",
        title: "2. Mobile Handheld Remote Mode",
        paragraphs: [
          "The Handheld Remote view is optimized for one-thumb operation from the altar or choir stand:",
          "• Giant 'Next' and 'Previous' touch buttons with haptic feedback.\n• Fast live Bible search with quick verse firing.\n• Panic 'Blackout' button to immediately clear screens if needed.\n• Slide preview showing exactly what is currently broadcast live.",
        ],
      },
      {
        id: "confidence-monitor-view",
        title: "3. Stage Confidence Monitor for Choir & Pastors",
        paragraphs: [
          "Place a TV monitor on the auditorium floor facing the altar or mount a screen on the back wall:",
          "• Current lyric line displayed in large, high-contrast yellow typography.\n• Upcoming lyric stanza displayed in muted gray so singers know what line is coming next.\n• Preaching outline notes visible only to the minister on stage.",
        ],
      },
      {
        id: "backstage-alerts",
        title: "4. Discrete Backstage Stage Messaging",
        paragraphs: [
          "Need to communicate with the pastor or worship team without alarming the congregation? Use Stage Messaging:",
          "• '5 Minutes Remaining in Sermon'\n• 'Car License ABC-123 is blocking the driveway'\n• 'Nursery Call: Mother of Baby David to Room 102'",
          "These messages flash exclusively on the stage confidence screen and never appear on the congregation projector or livestream broadcast.",
        ],
      },
      {
        id: "countdown-clocks",
        title: "5. Sermon Timers & Service Countdowns",
        paragraphs: [
          "Synchronize service schedules with flexible countdown timers:",
          "• Pre-service 5-minute countdown clock with ambient music.\n• Sermon preaching timer with overtime warnings (+10:00 red flashing indicator).\n• Time-of-day clock synchronized to atomic internet time.",
        ],
      },
    ],
    prevPage: { slug: "multiview-production", title: "Multi-View Studio" },
    nextPage: { slug: "hardware-projection", title: "Projectors & Dual Screens" },
  },

  "hardware-projection": {
    slug: "hardware-projection",
    title: "Dual-Screen Projector, Auditorium TV & Hardware Routing",
    subtitle: "Configuring extended desktop displays, HDMI splitters, and ATEM Mini / vMix workflows.",
    seoTitle: "Dual Screen Church Projector & TV Routing Guide | MakeChurchEazy Docs",
    description:
      "How to configure independent multi-display outputs: full-screen high-contrast congregation slides on HDMI projectors while feeding transparent lower-third graphics to OBS Studio or ATEM Mini switchers.",
    keywords: [
      "dual monitor church presentation",
      "auditorium projector setup",
      "ATEM Mini church presentation",
      "vMix church overlay",
      "independent church display outputs",
      "HDMI church splitter projector",
    ],
    badge: "Hardware",
    readingTime: "5 min read",
    lastUpdated: "October 2026",
    lead:
      "Churches often struggle with multi-screen projection: what looks good on the in-house auditorium wall (large, full-screen, high-contrast text) looks terrible on a livestream broadcast if it blocks the pastor's face. MakeChurchEazy solves this with independent multi-output routing.",
    toc: [
      { id: "display-modes", title: "1. Extending vs Mirroring Displays" },
      { id: "independent-routing", title: "2. Independent Output Routing" },
      { id: "hardware-connectivity", title: "3. HDMI, DisplayPort & ATEM Switchers" },
      { id: "aspect-ratios", title: "4. Handling 16:9 vs 4:3 Projector Ratios" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "TechArticle",
          headline: "Dual-Screen Projector & Hardware Routing Guide",
          description:
            "Guide to routing independent outputs to auditorium projectors and broadcast livestream software.",
          url: "https://makechurcheazy.com/docs/hardware-projection",
          author: { "@type": "Organization", name: "MakeChurchEazy Team" },
        },
      ],
    },
    sections: [
      {
        id: "display-modes",
        title: "1. Extending vs Mirroring Displays in Windows & macOS",
        lead:
          "To project slides to the congregation while keeping controls on your laptop, configure your OS in Extended Desktop mode:",
        steps: [
          {
            number: 1,
            title: "Windows Display Settings",
            description: "Press Win + P on your keyboard. Select 'Extend' (Never choose 'Duplicate'). Open Windows Display Settings and ensure the secondary projector is arranged to the right of your primary monitor.",
          },
          {
            number: 2,
            title: "macOS Mission Control Settings",
            description: "In macOS System Settings ➔ Displays: Select your external projector/TV and choose 'Stop Mirroring' or 'Extended Display'. Ensure 'Displays have separate Spaces' is enabled.",
          },
          {
            number: 3,
            title: "Select Output in MakeChurchEazy",
            description: "In MakeChurchEazy Settings ➔ Displays, select Display 2. Click 'Launch Fullscreen Presentation'. The clean slide feed opens immediately on the projector.",
          },
        ],
      },
      {
        id: "independent-routing",
        title: "2. Independent Auditorium vs Livestream Output Routing",
        paragraphs: [
          "MakeChurchEazy allows sending different presentation styles to different screens from a single click:",
          "• Auditorium Projector (HDMI Out): High-contrast, full-screen background with bold centered scripture/lyrics so worshippers in the back row can easily read along.\n• Livestream Broadcast (OBS Browser Source): Transparent animated lower-third overlay positioned along the bottom 25% of the frame, preserving full visibility of the camera shot.",
        ],
      },
      {
        id: "hardware-connectivity",
        title: "3. HDMI, DisplayPort & ATEM Mini Switchers",
        paragraphs: [
          "For churches using video switchers like Blackmagic ATEM Mini, ATEM SDI, or Roland V-1HD:",
          "• Connect an HDMI cable from your church computer into ATEM Input 1 or Input 2.\n• Set MakeChurchEazy Output to Fullscreen Presentation.\n• Use ATEM Downstream Keyer (DSK) with Luma Key or Picture-in-Picture to overlay church graphics over your altar cameras.",
        ],
      },
      {
        id: "aspect-ratios",
        title: "4. Handling 16:9 vs 4:3 Projector Ratios",
        paragraphs: [
          "Older sanctuaries often use 4:3 aspect ratio projectors (1024x768). In MakeChurchEazy Settings ➔ Display Output, you can toggle between 16:9 Widescreen (1080p) and 4:3 Standard.",
          "The engine automatically recalculates safe margins, font scaling, and line wraps so text never stretches or gets cropped by ceiling bezels.",
        ],
      },
    ],
    prevPage: { slug: "stage-display", title: "Mobile Remote & Stage Monitor" },
    nextPage: { slug: "troubleshooting", title: "Troubleshooting & Port Reference" },
  },

  troubleshooting: {
    slug: "troubleshooting",
    title: "Troubleshooting, Offline Failover & Port Reference",
    subtitle: "Resolve port conflicts, black overlay boxes, OBS errors, and Sunday emergencies.",
    seoTitle: "Church Presentation Troubleshooting & Port Reference | MakeChurchEazy Docs",
    description:
      "Resolve connection errors, port conflicts (45678, 17891, 4455), black overlay boxes, and learn the Sunday morning offline emergency recovery protocol.",
    keywords: [
      "OBS overlay black background fix",
      "church presentation offline emergency",
      "MakeChurchEazy port 45678",
      "OBS websocket connection error 4455",
      "church media troubleshooting",
      "ERR_CONNECTION_REFUSED church overlay",
    ],
    badge: "Essential",
    readingTime: "6 min read",
    lastUpdated: "October 2026",
    lead:
      "When tech issues arise 5 minutes before Sunday service starts, you need clear, actionable solutions without corporate runarounds. This guide covers port conflict resolutions, OBS overlay fixes, and our Sunday Emergency Offline Recovery protocol.",
    toc: [
      { id: "port-reference", title: "1. Port Reference & Architecture" },
      { id: "err-connection-refused", title: "2. Fixing ERR_CONNECTION_REFUSED" },
      { id: "black-box-overlay", title: "3. Fixing Black Box Overlay in OBS" },
      { id: "websocket-auth-error", title: "4. Fixing OBS WebSocket Password Errors" },
      { id: "sunday-offline-emergency", title: "5. Sunday Emergency Offline Protocol" },
      { id: "hotline-support", title: "6. Sunday Emergency Hotline" },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Why does my OBS Browser Source show ERR_CONNECTION_REFUSED?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "The MakeChurchEazy desktop application must be open and running on the PC. The embedded HTTP server on port 45678 only runs while the desktop app is active.",
              },
            },
            {
              "@type": "Question",
              name: "Why is there a black box covering my camera feed instead of transparent text?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "In OBS Browser Source properties, add 'body { background-color: rgba(0, 0, 0, 0) !important; }' to Custom CSS and uncheck 'Shutdown source when not visible'.",
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        id: "port-reference",
        title: "1. Canonical Port Reference Table",
        lead:
          "MakeChurchEazy relies on three primary ports. Ensure church firewalls and antivirus software do not block local loopback on these ports:",
        table: {
          headers: ["Port Number", "Protocol", "Service Role", "Troubleshooting Check"],
          rows: [
            ["45678", "HTTP / TCP", "Embedded CEF Overlay Server (Bible, lyrics, docks)", "Verify desktop app is open. Test in browser: http://127.0.0.1:45678/dock"],
            ["17891", "WebSocket / TCP", "Local event relay bridge between desktop dock and overlays", "Used strictly on 127.0.0.1. Reconnects in 1s if interrupted"],
            ["4455", "WebSocket / TCP", "OBS Studio WebSocket v5 Server", "Ensure enabled in OBS Studio ➔ Tools ➔ WebSocket Server Settings"],
          ],
        },
      },
      {
        id: "err-connection-refused",
        title: "2. Resolving ERR_CONNECTION_REFUSED on Port 45678",
        lead:
          "If OBS Studio displays an error screen stating 'ERR_CONNECTION_REFUSED' on your browser source:",
        steps: [
          {
            number: 1,
            title: "Confirm MakeChurchEazy is Running",
            description: "The embedded server on port 45678 only runs when the MakeChurchEazy desktop app is launched. If the desktop app is closed, OBS cannot load overlays.",
          },
          {
            number: 2,
            title: "Check Antivirus / Firewall Loopback Rules",
            description: "Certain aggressive Windows antivirus packages (Norton, Avast, McAfee) block local HTTP servers. Add an exemption for MakeChurchEazy executable.",
          },
          {
            number: 3,
            title: "Verify the URL Uses 127.0.0.1",
            description: "Always use http://127.0.0.1:45678/... rather than http://localhost:45678/... to avoid slow Windows IPv6 resolution latency.",
          },
        ],
      },
      {
        id: "black-box-overlay",
        title: "3. Fixing Black Box / Opaque Background in OBS",
        paragraphs: [
          "Symptom: Your Bible verses or worship lyrics appear on OBS, but there is an ugly black rectangle blocking your camera view.",
          "Solution:",
          "1. In OBS Studio Sources list, double-click your Browser Source.\n2. In the 'Custom CSS' field, paste this exact CSS:",
          "3. Scroll down in properties and uncheck 'Shutdown source when not visible'.\n4. Click OK. The background will turn completely transparent immediately.",
        ],
        codeBlocks: [
          {
            label: "OBS Alpha Transparency Fix",
            code: "body {\n  background-color: rgba(0, 0, 0, 0) !important;\n  margin: 0px auto;\n  overflow: hidden;\n}",
            language: "css",
          },
        ],
      },
      {
        id: "websocket-auth-error",
        title: "4. Fixing OBS WebSocket Password & Auth Failures",
        paragraphs: [
          "If MakeChurchEazy bottom bar shows 'OBS Connection Failed':",
          "• Open OBS ➔ Tools ➔ WebSocket Server Settings.\n• If 'Enable Authentication' is checked, click 'Show Connect Info', copy the Server Password, and paste it into MakeChurchEazy Settings.\n• Alternatively, uncheck 'Enable Authentication' if your computer is on a secure church workstation.",
        ],
      },
      {
        id: "sunday-offline-emergency",
        title: "5. Sunday Emergency Offline Protocol",
        lead:
          "If your church internet router completely fails during Sunday morning service:",
        callout: {
          type: "tip",
          title: "DO NOT PANIC — MakeChurchEazy is 100% Offline",
          content:
            "MakeChurchEazy does not require internet connection to project Bibles, songs, or lower-thirds. All database lookups and OBS overlays communicate locally on 127.0.0.1.",
        },
        steps: [
          {
            number: 1,
            title: "Ignore Internet Warning Icons",
            description: "Even if your laptop says 'No Internet Access', keep MakeChurchEazy running normally. The desktop engine will continue presenting without hiccups.",
          },
          {
            number: 2,
            title: "Continue Service via Keyboard Shortcuts",
            description: "Use Spacebar to project scriptures and V/C/B hotkeys for worship stanzas.",
          },
          {
            number: 3,
            title: "Local Wi-Fi Mobile Control (Optional)",
            description: "If your church has a local Wi-Fi router (even without internet connection to the outside world), mobile tablets on the same Wi-Fi can still pair using your laptop's local IP address (e.g. http://192.168.1.50:45678/dock).",
          },
        ],
      },
      {
        id: "hotline-support",
        title: "6. Sunday Emergency Hotline",
        lead:
          "Are you stranded on Sunday morning? Our dedicated engineering team offers direct hotline assistance during active Sunday service hours:",
        callout: {
          type: "warn",
          title: "Sunday Priority Line",
          content:
            "Sunday Emergency Hotline: +234 905 454 5286\nAvailable every Sunday from 6:00 AM to 2:00 PM GMT+1. Direct priority support for church media volunteers and pastors.",
        },
      },
    ],
    prevPage: { slug: "hardware-projection", title: "Projectors & Dual Screens" },
    nextPage: { slug: "overview", title: "Overview & Architecture" },
  },
};
