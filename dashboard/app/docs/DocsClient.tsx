"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Copy,
  Check,
  Code,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Menu,
  X,
  FileText,
  Monitor,
  Tv,
  BookOpen,
  Music,
  Layers,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import styles from "./docs.module.css";
import { DOC_SECTIONS, ON_THIS_PAGE } from "./docs-data";

export function DocsClient() {
  const [filterText, setFilterText] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [showMarkdownModal, setShowMarkdownModal] = useState(false);
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Keyboard shortcut listener (Cmd+K for search, / for filter)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        const input = document.getElementById("docs-sidebar-filter");
        input?.focus();
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setShowMarkdownModal(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter sections by search text
  const filteredSections = useMemo(() => {
    if (!filterText.trim()) return DOC_SECTIONS;
    const q = filterText.toLowerCase();
    return DOC_SECTIONS.map((sec) => ({
      ...sec,
      items: sec.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          sec.title.toLowerCase().includes(q)
      ),
    })).filter((sec) => sec.items.length > 0);
  }, [filterText]);

  // Copy full documentation as Markdown
  const copyDocumentationMarkdown = () => {
    const markdownContent = `# MakeChurchEazy — Complete Step-by-Step Documentation

## Overview
MakeChurchEazy is an all-in-one church presentation and live-production software. It connects directly with OBS Studio, in-person projectors, and mobile controllers to project Scriptures, worship lyrics, lower-thirds, and sermon notes with zero latency.

---

### Step 1: Install & Pair MakeChurchEazy Desktop App
1. Download MakeChurchEazy for Windows or macOS from https://makechurcheazy.com/download.
2. Launch the desktop app and log in with your church account or Google credentials.
3. The app connects to the local WebSocket engine and syncs your church media library.

---

### Step 2: Connect to OBS Studio (Zero-Latency Browser Source)
1. Open OBS Studio on your broadcast computer.
2. In your active Scene, click **+** ➔ **Browser**. Name it \`MakeChurchEazy Presentation\`.
3. Set the **URL** to: \`http://localhost:3004/overlay\` (or your cloud presentation link).
4. Set **Width** to \`1920\` and **Height** to \`1080\`.
5. In **Custom CSS**, ensure:
\`\`\`css
body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }
\`\`\`
6. Click **OK**. Any slide you trigger in MakeChurchEazy will immediately animate on your livestream with transparency.

---

### Step 3: Instant Scripture Projection & Bible Engine
- Type any book, chapter, or natural reference in the search box (e.g. \`John 3:16\`, \`Psalm 23:1-6\`, \`Rom 8:28\`).
- Switch versions seamlessly between KJV, NIV, AMP, NLT, and NKJV.
- Dual-version comparison allows displaying two translations side-by-side.
- Click **Live** or press **Spacebar** to broadcast immediately to screen and OBS.

---

### Step 4: Worship Lyrics & EasyWorship Import
- Migrate from EasyWorship in seconds: import your existing \`Songs.db\` or text exports.
- Search and project built-in Celestial Church of Christ (CCC) Hymnals and standard hymns.
- Use hotkeys (\`V\` for Verse, \`C\` for Chorus, \`B\` for Bridge) for fluid worship leading.

---

### Step 5: Animated Lower-Thirds & Production Themes
- Toggle speaker names, sermon topics, and announcements.
- Pre-animated spring entrance and exit physics.
- Transparent alpha channels preserve your camera feed.

---

### Step 6: Mobile Remote & Stage Confidence Monitor
- Open \`https://makechurcheazy.com/devices\` to pair a phone or iPad via QR code.
- Control the service remotely from the pulpit, choir stand, or audio desk.
- Stage display mode shows current lyrics, next lyrics, and live countdown timer.

---

For full interactive guide and support: https://makechurcheazy.com/docs`;

    navigator.clipboard.writeText(markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.docsPage}>
      {/* ---------------- Top Navbar ---------------- */}
      <header className={styles.header}>
        <div className={styles.brandWrap}>
          <button
            className={styles.mobileMenuBtn}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link href="/" className={styles.logoLink}>
            <img src="/homepage/logo.webp" alt="" width={36} height={36} className={styles.logoIcon} />
            <span>MakeChurchEazy</span>
            <span className={styles.docsPill}>DOCS</span>
          </Link>
          <nav className={styles.navLinks}>
            <a href="#overview" className={styles.navLink}>Quickstart</a>
            <a href="#step-2-obs-setup" className={styles.navLink}>OBS Studio</a>
            <a href="#step-3-scripture-engine" className={styles.navLink}>Bible Engine</a>
            <a href="#step-4-lyrics-hymns" className={styles.navLink}>Lyrics & Hymns</a>
            <a href="#step-5-lower-thirds" className={styles.navLink}>Lower-Thirds</a>
            <Link href="/download" className={styles.navLink}>Downloads</Link>
          </nav>
        </div>

        <div className={styles.headerRight}>
          <button
            className={styles.searchBtn}
            onClick={() => setSearchOpen(true)}
            title="Search docs"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search</span>
            <span className={styles.searchKbd}>⌘K</span>
          </button>
          <Link href="/dashboard" className={styles.dashboardBtn}>
            Dashboard
          </Link>
        </div>
      </header>

      {/* ---------------- Layout Body ---------------- */}
      <div className={styles.layout}>
        {/* Left Sidebar */}
        <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.mobileSidebarOpen : ""}`}>
          <div className={styles.productSwitcher}>
            <Monitor className="w-4 h-4 text-blue-700" />
            <span>MakeChurchEazy Docs</span>
          </div>

          <div className={styles.filterWrap}>
            <Search className={styles.filterIcon} />
            <input
              id="docs-sidebar-filter"
              type="text"
              placeholder="Filter sidebar /"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className={styles.filterInput}
            />
          </div>

          {filteredSections.map((section, idx) => (
            <div key={idx} className={styles.navGroup}>
              <div className={styles.groupTitle}>{section.title}</div>
              <ul className={styles.sidebarList}>
                {section.items.map((item) => (
                  <li key={item.id} className={styles.sidebarItem}>
                    <a
                      href={`#${item.id}`}
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`${styles.sidebarLink} ${
                        activeSection === item.id ? styles.sidebarLinkActive : ""
                      }`}
                    >
                      <span>{item.title}</span>
                      {item.badge && <span className={styles.itemBadge}>{item.badge}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* Center Main Content */}
        <main className={styles.contentArea}>
          {/* Breadcrumbs */}
          <div className={styles.breadcrumbs}>
            <Link href="/" className={styles.breadcrumbLink}>Home</Link>
            <span>/</span>
            <span>MakeChurchEazy</span>
            <span>/</span>
            <span>Documentation</span>
            <span>/</span>
            <span className="text-slate-900">Step-by-Step Guide</span>
          </div>

          {/* Title */}
          <h1 className={styles.mainTitle}>Getting Started with MakeChurchEazy</h1>

          {/* Meta Bar */}
          <div className={styles.metaRow}>
            <span>🕒 Last updated Oct 2026</span>
            <span>•</span>
            <button className={styles.metaActionBtn} onClick={copyDocumentationMarkdown}>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy as Markdown</span>
            </button>
            <span>•</span>
            <button
              className={styles.metaActionBtn}
              onClick={() => setShowMarkdownModal(true)}
            >
              <Code className="w-3.5 h-3.5" />
              <span>View as Markdown</span>
            </button>
          </div>

          {/* Intro Paragraph */}
          <p className={styles.leadParagraph}>
            <strong>MakeChurchEazy</strong> is a unified church presentation and live-production workspace. It replaces clunky legacy software with a high-speed engine that connects your media desk directly to in-person projectors, OBS Studio livestreams, and mobile stage monitors with zero latency.
          </p>

          {/* ---------------- Section 1: Overview ---------------- */}
          <section id="overview" className="scroll-mt-20">
            <h2 className={styles.sectionHeading}>System Architecture & Overview</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              Traditional church software requires duplicating work: one operator clicks slides in presentation software, while another tries to match lower thirds or scenes inside OBS Studio. MakeChurchEazy combines these into a single authoritative pipeline.
            </p>

            <div className={styles.callout + " " + styles.calloutNote}>
              <strong>Key Architecture Principle:</strong> OBS is treated as a first-class display output. You do not need video capture cards between two computers; MakeChurchEazy feeds clean, transparent 1080p/4K motion overlays directly into OBS via native Browser Sources or WebSocket synchronization.
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.docTable}>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Target Hardware</th>
                    <th>Primary Function</th>
                    <th>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Desktop App</strong></td>
                    <td>Windows 10/11, macOS</td>
                    <td>Media operator dock, instant scripture lookup, song library</td>
                    <td>&lt; 5ms (Local)</td>
                  </tr>
                  <tr>
                    <td><strong>OBS Browser Source</strong></td>
                    <td>Broadcast PC / OBS Studio</td>
                    <td>Transparent animated lower-thirds, lyrics overlay, scripture overlay</td>
                    <td>0ms (Direct CEF)</td>
                  </tr>
                  <tr>
                    <td><strong>Projector Output</strong></td>
                    <td>Secondary HDMI / DisplayPort</td>
                    <td>Full-screen in-house church congregation display</td>
                    <td>Hardware V-Sync</td>
                  </tr>
                  <tr>
                    <td><strong>Mobile Controller</strong></td>
                    <td>iPad, iPhone, Android</td>
                    <td>Wireless remote from pulpit, choir stand, or sound booth</td>
                    <td>WebSocket Realtime</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------- Step 1: Install & Pair ---------------- */}
          <section id="step-1-install-pair" className="scroll-mt-20">
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepNumber}>1</div>
                <h3 className={styles.stepTitle}>Install & Pair MakeChurchEazy Desktop App</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                The desktop app runs locally on your church laptop. It provides offline-first reliability, ensuring that even if your church internet disconnects on Sunday morning, Bible verses, downloaded hymns, and local presentation graphics never stop working.
              </p>

              <ol className="list-decimal list-inside space-y-3 text-slate-700 mb-6 text-sm">
                <li>
                  Download the latest release for your platform from the{" "}
                  <Link href="/download" className="text-blue-700 underline font-medium">
                    Downloads Portal
                  </Link>{" "}
                  (Windows 64-bit installer or macOS Apple Silicon/Intel DMG).
                </li>
                <li>Launch the installer and open <strong>MakeChurchEazy</strong>.</li>
                <li>
                  Sign in with your MakeChurchEazy church credentials. If you prefer to pair a new device, click <strong>Pair Device</strong> and enter your 6-digit sync code or scan the QR code.
                </li>
              </ol>

              <div className={styles.callout + " " + styles.calloutTip}>
                <strong>Offline-Ready Guarantee:</strong> All core scriptures (KJV, NIV, AMP) and imported hymn libraries are cached locally on your device. Cloud connection is only required for initial account sync and remote mobile control.
              </div>
            </div>
          </section>

          {/* ---------------- Step 2: OBS Studio Setup ---------------- */}
          <section id="step-2-obs-setup" className="scroll-mt-20">
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepNumber}>2</div>
                <h3 className={styles.stepTitle}>Connect to OBS Studio (Browser Source)</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                Integrating with OBS Studio takes less than 60 seconds. You do not need virtual cameras, NDI plugins, or screen captures. MakeChurchEazy renders directly as an accelerated Browser Source.
              </p>

              <div className="space-y-4 mb-6">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
                    OBS Browser Source Configuration
                  </div>
                  <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
                    <li>In OBS, click <strong>+</strong> under Sources and select <strong>Browser</strong>.</li>
                    <li>Name the source: <code className="text-blue-700 bg-slate-50 px-1.5 py-0.5 rounded">MakeChurchEazy Overlay</code>.</li>
                    <li>Set <strong>URL</strong> to your local overlay URL or cloud presentation link:</li>
                  </ul>

                  <div className={styles.codeBlock}>
                    <div className={styles.codeHeader}>
                      <span>URL Setting</span>
                      <button
                        onClick={() => copyCode("http://localhost:3004/overlay")}
                        className="text-xs hover:text-slate-900"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className={styles.codePre}>http://localhost:3004/overlay</pre>
                  </div>

                  <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside mt-3">
                    <li>Set <strong>Width</strong> to <code className="text-blue-700 bg-slate-50 px-1.5 py-0.5 rounded">1920</code>.</li>
                    <li>Set <strong>Height</strong> to <code className="text-blue-700 bg-slate-50 px-1.5 py-0.5 rounded">1080</code>.</li>
                    <li>Set <strong>FPS</strong> to <code className="text-blue-700 bg-slate-50 px-1.5 py-0.5 rounded">60</code> (or matching your canvas).</li>
                    <li>Paste the following in <strong>Custom CSS</strong> to guarantee 100% transparent alpha:</li>
                  </ul>

                  <div className={styles.codeBlock}>
                    <div className={styles.codeHeader}>
                      <span>Custom CSS</span>
                      <button
                        onClick={() =>
                          copyCode(
                            "body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }"
                          )
                        }
                        className="text-xs hover:text-slate-900"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className={styles.codePre}>
                      body &#123; background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; &#125;
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- Step 3: Presenting Scriptures ---------------- */}
          <section id="step-3-scripture-engine" className="scroll-mt-20">
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepNumber}>3</div>
                <h3 className={styles.stepTitle}>Instant Scripture & Bible Engine</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                During live sermons, pastors frequently cite verses without warning. MakeChurchEazy includes a natural-language scripture parser that locates verses in milliseconds as the preacher speaks.
              </p>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-white border border-slate-200">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
                    <BookOpen className="w-4 h-4 text-blue-700" />
                    <span>Smart Reference Search</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Type shortcuts like <code className="text-blue-700">Jn 3:16</code>, <code className="text-blue-700">Ps 23 1-4</code>, or <code className="text-blue-700">1 Cor 13</code>. The engine automatically expands and formats the verse cards instantly.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
                    <Layers className="w-4 h-4 text-blue-700" />
                    <span>Dual-Version Comparison</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Select two translations (e.g. KJV and AMP) to project them side-by-side or stacked on the in-house screen, clarifying nuanced biblical passages for the congregation.
                  </p>
                </div>
              </div>

              <div className={styles.callout + " " + styles.calloutNote}>
                <strong>Keyboard Workflow:</strong> Press <code className="bg-slate-100 px-1 rounded text-blue-700">Enter</code> to preview, <code className="bg-slate-100 px-1 rounded text-blue-700">Spacebar</code> to take Live, and <code className="bg-slate-100 px-1 rounded text-blue-700">Esc</code> or <code className="bg-slate-100 px-1 rounded text-blue-700">F12</code> to immediately clear the output to black.
              </div>
            </div>
          </section>

          {/* ---------------- Step 4: Lyrics & EasyWorship Import ---------------- */}
          <section id="step-4-lyrics-hymns" className="scroll-mt-20">
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepNumber}>4</div>
                <h3 className={styles.stepTitle}>Worship Songs, EasyWorship Import & Hymnals</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                Switching to a new presentation system often poses the pain of migrating hundreds of church worship songs. MakeChurchEazy includes a native <strong>1-Click EasyWorship Importer</strong> and pre-bundled denominational hymnals (including Celestial Church of Christ CCC Hymns).
              </p>

              <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4 space-y-3">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Music className="w-4 h-4 text-blue-700" />
                  <span>Migrating from EasyWorship (Songs.db)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Go to <strong>Worship Tab ➔ Import Songs ➔ EasyWorship (.db)</strong>. Select your EasyWorship database file located at:
                </p>
                <div className={styles.codeBlock}>
                  <pre className={styles.codePre}>
                    C:\Users\Public\Documents\Softouch\EasyWorship\Default\Databases\Data\Songs.db
                  </pre>
                </div>
                <p className="text-xs text-slate-600">
                  All song titles, author metadata, verses, and choruses are automatically parsed, cleaned, and indexed in your local search library.
                </p>
              </div>
            </div>
          </section>

          {/* ---------------- Step 5: Lower-Thirds & Production Themes ---------------- */}
          <section id="step-5-lower-thirds" className="scroll-mt-20">
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepNumber}>5</div>
                <h3 className={styles.stepTitle}>Animated Lower-Thirds & Production Themes</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                Enhance your broadcast stream with broadcast-grade lower-thirds for preaching pastors, guest ministers, worship leaders, and church announcements.
              </p>

              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <div className="border border-slate-200 bg-white p-3.5 rounded-lg">
                  <div className="text-xs font-bold text-slate-900 mb-1">Speaker Presets</div>
                  <div className="text-xs text-slate-600">
                    Store resident pastors, visiting ministers, and worship leaders for 1-click on-screen triggering.
                  </div>
                </div>
                <div className="border border-slate-200 bg-white p-3.5 rounded-lg">
                  <div className="text-xs font-bold text-slate-900 mb-1">Spring Physics</div>
                  <div className="text-xs text-slate-600">
                    Fluid entrance and exit animations powered by programmatic Remotion-style spring physics.
                  </div>
                </div>
                <div className="border border-slate-200 bg-white p-3.5 rounded-lg">
                  <div className="text-xs font-bold text-slate-900 mb-1">Church Branding</div>
                  <div className="text-xs text-slate-600">
                    Embed church logos, customize accent lines, and choose brand typography in seconds.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- Step 6: Mobile Remote ---------------- */}
          <section id="step-6-mobile-stage" className="scroll-mt-20">
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepNumber}>6</div>
                <h3 className={styles.stepTitle}>Mobile Remote Control & Stage Confidence Monitor</h3>
              </div>
              <p className="text-slate-700 leading-relaxed mb-4">
                No need to remain anchored to the media booth. Operators or pastoral staff can advance slides, switch verses, or monitor presentation status wirelessly from an iPad or smartphone.
              </p>

              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Smartphone className="w-4 h-4 text-blue-700" />
                  <span>How to Connect a Mobile Device</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
                  <li>In MakeChurchEazy, open <strong>Devices ➔ Pair Mobile</strong>.</li>
                  <li>Scan the displayed QR code with your phone camera or visit <code className="text-blue-700">makechurcheazy.com/devices</code>.</li>
                  <li>Your phone transforms into a low-latency touch controller with large Next/Previous buttons and live search.</li>
                  <li>For choir stands, open the dedicated <strong>Confidence Monitor</strong> view to show current lyric line, upcoming stanza, and service countdown timer.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* ---------------- Comparison Matrix ---------------- */}
          <section id="comparison-matrix" className="scroll-mt-20">
            <h2 className={styles.sectionHeading}>Platform Comparison Matrix</h2>
            <p className="text-slate-700 mb-4 text-sm">
              See how MakeChurchEazy compares with traditional legacy software:
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.docTable}>
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Legacy Software (EasyWorship / ProPresenter)</th>
                    <th>MakeChurchEazy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>OBS Studio Integration</strong></td>
                    <td>Requires NDI, virtual cameras, or second capture PC</td>
                    <td><strong className="text-green-700">Native 0ms Browser Source</strong></td>
                  </tr>
                  <tr>
                    <td><strong>Scripture Search Speed</strong></td>
                    <td>Hierarchical book/chapter click dropdowns</td>
                    <td><strong className="text-green-700">Instant natural-language typing</strong></td>
                  </tr>
                  <tr>
                    <td><strong>Mobile / Tablet Remote</strong></td>
                    <td>Paid add-on or restricted companion apps</td>
                    <td><strong className="text-green-700">Built-in web controller via QR code</strong></td>
                  </tr>
                  <tr>
                    <td><strong>EasyWorship Migration</strong></td>
                    <td>Manual copy/paste or expensive format converters</td>
                    <td><strong className="text-green-700">1-Click direct .db import</strong></td>
                  </tr>
                  <tr>
                    <td><strong>Cloud Backup & Team Sync</strong></td>
                    <td>Files saved on a single local hard drive</td>
                    <td><strong className="text-green-700">Automatic cloud backup & multi-device sync</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------- Sunday Morning Checklist ---------------- */}
          <section id="sunday-morning-checklist" className="scroll-mt-20">
            <h2 className={styles.sectionHeading}>Sunday Morning 5-Minute Checklist</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">1. Power On & Launch MakeChurchEazy</div>
                  <div className="text-xs text-slate-600">Ensure the desktop dock is running and secondary projector screen is extended.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">2. Verify OBS Browser Source Overlay</div>
                  <div className="text-xs text-slate-600">Trigger a test scripture in MakeChurchEazy and verify it appears clearly on OBS Studio preview.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">3. Review Today&apos;s Service Order</div>
                  <div className="text-xs text-slate-600">Preload the sermon theme scripture, speaker lower-third preset, and opening worship songs.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">4. Check Mobile Remote (Optional)</div>
                  <div className="text-xs text-slate-600">If pastor or sound technician uses a tablet, scan the QR code to verify live connectivity.</div>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- Troubleshooting & FAQ ---------------- */}
          <section id="troubleshooting-faq" className="scroll-mt-20">
            <h2 className={styles.sectionHeading}>Troubleshooting & Frequently Asked Questions</h2>

            <div className="space-y-4 my-6">
              <div className="border border-slate-200 bg-white p-4 rounded-xl">
                <h4 className="text-sm font-semibold text-slate-900 mb-1">
                  Why does the OBS Browser Source have a black box instead of transparency?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  In OBS Studio, right-click your Browser Source ➔ <strong>Properties</strong>. Ensure the <strong>Custom CSS</strong> field includes <code className="text-blue-700">body &#123; background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; &#125;</code> and uncheck &quot;Shutdown source when not visible&quot;.
                </p>
              </div>

              <div className="border border-slate-200 bg-white p-4 rounded-xl">
                <h4 className="text-sm font-semibold text-slate-900 mb-1">
                  Can we operate MakeChurchEazy if the church Wi-Fi fails?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Yes. The desktop application has full offline persistence. All scriptures, hymns, and media caches run directly on localhost without requiring an active internet connection.
                </p>
              </div>

              <div className="border border-slate-200 bg-white p-4 rounded-xl">
                <h4 className="text-sm font-semibold text-slate-900 mb-1">
                  How do we output different content to the in-house projector vs the livestream?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  In the <strong>Output Routing Settings</strong>, toggle &quot;Full-Screen Congregation Mode&quot; for the HDMI Projector and &quot;Lower-Third Overlay Mode&quot; for the OBS Browser Source. This displays readable full-screen slides on the wall while keeping your stream camera visible.
                </p>
              </div>
            </div>
          </section>
        </main>

        {/* Right Sidebar (On This Page) */}
        <aside className={styles.tocSidebar}>
          <div className={styles.tocTitle}>On this page</div>
          <ul className={styles.tocList}>
            {ON_THIS_PAGE.map((item) => (
              <li key={item.id} className={styles.tocItem}>
                <a
                  href={`#${item.id}`}
                  onClick={() => setActiveSection(item.id)}
                  className={`${styles.tocLink} ${
                    activeSection === item.id ? styles.tocLinkActive : ""
                  }`}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>

          <div className={styles.helpfulBox}>
            <div className={styles.helpfulTitle}>Was this helpful?</div>
            <div className={styles.helpfulBtns}>
              <button
                className={styles.feedbackBtn}
                onClick={() => setFeedback("yes")}
                style={{
                  borderColor: feedback === "yes" ? "#22c55e" : undefined,
                  color: feedback === "yes" ? "#166534" : undefined,
                }}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>Yes</span>
              </button>
              <button
                className={styles.feedbackBtn}
                onClick={() => setFeedback("no")}
                style={{
                  borderColor: feedback === "no" ? "#ef4444" : undefined,
                  color: feedback === "no" ? "#B91C1C" : undefined,
                }}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                <span>No</span>
              </button>
            </div>
            {feedback && (
              <p className="text-xs text-slate-600 mb-4">
                Thank you for your feedback!
              </p>
            )}

            <div className={styles.helpfulLinks}>
              <Link href="/support" className={styles.subLink}>
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Contact Church Support</span>
              </Link>
              <Link href="/tutorials" className={styles.subLink}>
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Video Tutorials</span>
              </Link>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------- View as Markdown Modal ---------------- */}
      {showMarkdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-700" />
                <span>Documentation Markdown Source</span>
              </div>
              <button
                onClick={() => setShowMarkdownModal(false)}
                className="text-slate-600 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-slate-700 bg-slate-50">
              <pre className="whitespace-pre-wrap">
{`# MakeChurchEazy Documentation

Step 1: Install & Pair Desktop App
- Download from https://makechurcheazy.com/download
- Windows & macOS native installer
- Pair via 6-digit sync code or Google credentials

Step 2: Connect to OBS Studio
- Browser Source URL: http://localhost:3004/overlay
- Resolution: 1920x1080 @ 60 FPS
- Custom CSS: body { background-color: rgba(0, 0, 0, 0); overflow: hidden; }

Step 3: Present Scriptures
- Natural-language search (e.g., 'John 3:16', 'Ps 23')
- Multi-version KJV, NIV, AMP, NLT side-by-side
- Spacebar = Go Live

Step 4: Worship Songs & EasyWorship Import
- 1-Click Songs.db database import
- Celestial Church of Christ (CCC) Hymnals pre-indexed
- Verse / Chorus hotkeys

Step 5: Animated Lower-Thirds
- Preacher & guest speaker presets
- Broadcast-safe margins and church brand themes

Step 6: Mobile Remote & Confidence Monitor
- Pair phone or iPad via QR code
- Dedicated stage confidence monitor with lyrics & countdown timer`}
              </pre>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={copyDocumentationMarkdown}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowMarkdownModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Search Palette (⌘K) ---------------- */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="flex items-center px-4 border-b border-slate-200">
              <Search className="w-5 h-5 text-slate-600 mr-2" />
              <input
                autoFocus
                type="text"
                placeholder="Search documentation, steps, features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent py-4 text-sm text-slate-900 outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded"
              >
                ESC
              </button>
            </div>
            <div className="p-3 max-h-72 overflow-y-auto space-y-1">
              {ON_THIS_PAGE.filter(
                (item) =>
                  !searchQuery ||
                  item.title.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setSearchOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-lg text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  <span>{item.title}</span>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Copy Toast */}
      {copied && (
        <div className={styles.toast}>
          <Check className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Copied to clipboard!
        </div>
      )}
    </div>
  );
}
