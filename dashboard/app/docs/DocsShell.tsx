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
  BookOpen,
  Music,
  Layers,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  Tv,
  PhoneCall,
  Sliders,
  ChevronDown,
} from "lucide-react";
import styles from "./docs.module.css";
import { DOC_NAV_SECTIONS, DOC_PAGES, DocPageData } from "./docs-data";

interface DocsShellProps {
  page: DocPageData;
}

export function DocsShell({ page }: DocsShellProps) {
  const [filterText, setFilterText] = useState("");
  const [activeTocId, setActiveTocId] = useState<string>(page.toc[0]?.id || "");
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<string | null>(null);
  const [pageMarkdownCopied, setPageMarkdownCopied] = useState(false);
  const [showMarkdownModal, setShowMarkdownModal] = useState(false);
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Keyboard shortcuts listener: Cmd+K / Ctrl+K for search modal, / for sidebar filter, Escape to close
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

  // IntersectionObserver for Table of Contents spy
  useEffect(() => {
    const sectionElements = page.toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sectionElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) {
          setActiveTocId(visible.target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    sectionElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [page.slug, page.toc]);

  // Filter sections by search text
  const filteredNavSections = useMemo(() => {
    if (!filterText.trim()) return DOC_NAV_SECTIONS;
    const q = filterText.toLowerCase();
    return DOC_NAV_SECTIONS.map((sec) => ({
      ...sec,
      items: sec.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          sec.title.toLowerCase().includes(q)
      ),
    })).filter((sec) => sec.items.length > 0);
  }, [filterText]);

  // Global search items across all documentation pages
  const globalSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: { pageTitle: string; sectionTitle: string; href: string; snippet: string }[] = [];

    Object.values(DOC_PAGES).forEach((doc) => {
      // Check page lead
      if (doc.title.toLowerCase().includes(q) || doc.lead.toLowerCase().includes(q)) {
        results.push({
          pageTitle: doc.title,
          sectionTitle: "Overview & Introduction",
          href: doc.slug === "overview" ? "/docs" : `/docs/${doc.slug}`,
          snippet: doc.lead.slice(0, 140) + "...",
        });
      }

      // Check sections
      doc.sections.forEach((sec) => {
        const titleMatch = sec.title.toLowerCase().includes(q);
        const textContent = (sec.paragraphs || []).join(" ") + " " + (sec.lead || "");
        const textMatch = textContent.toLowerCase().includes(q);

        if (titleMatch || textMatch) {
          const matchIdx = textContent.toLowerCase().indexOf(q);
          const snippetStart = Math.max(0, matchIdx - 30);
          const snippet =
            textContent.length > 0
              ? (snippetStart > 0 ? "..." : "") +
                textContent.slice(snippetStart, snippetStart + 130) +
                "..."
              : sec.lead || doc.title;

          results.push({
            pageTitle: doc.title,
            sectionTitle: sec.title,
            href: (doc.slug === "overview" ? "/docs" : `/docs/${doc.slug}`) + `#${sec.id}`,
            snippet,
          });
        }
      });
    });

    return results.slice(0, 12);
  }, [searchQuery]);

  // Copy page content as Markdown
  const copyPageMarkdown = () => {
    let md = `# ${page.title}\n\n`;
    if (page.subtitle) md += `*${page.subtitle}*\n\n`;
    md += `${page.lead}\n\n---\n\n`;

    page.sections.forEach((sec) => {
      md += `## ${sec.title}\n\n`;
      if (sec.lead) md += `${sec.lead}\n\n`;
      if (sec.paragraphs) {
        sec.paragraphs.forEach((p) => {
          md += `${p}\n\n`;
        });
      }
      if (sec.steps) {
        sec.steps.forEach((step, idx) => {
          md += `### Step ${step.number || idx + 1}: ${step.title}\n`;
          md += `${step.description}\n\n`;
          if (step.code) {
            md += `\`\`\`${step.codeLanguage || ""}\n${step.code}\n\`\`\`\n\n`;
          }
        });
      }
      if (sec.table) {
        md += `| ${sec.table.headers.join(" | ")} |\n`;
        md += `| ${sec.table.headers.map(() => "---").join(" | ")} |\n`;
        sec.table.rows.forEach((row) => {
          md += `| ${row.join(" | ")} |\n`;
        });
        md += `\n`;
      }
      if (sec.faqs) {
        sec.faqs.forEach((faq) => {
          md += `**Q: ${faq.question}**\n\n${faq.answer}\n\n`;
        });
      }
      md += `---\n\n`;
    });

    md += `\n*Official Documentation: https://makechurcheazy.com${page.slug === "overview" ? "/docs" : `/docs/${page.slug}`}*`;

    navigator.clipboard.writeText(md);
    setPageMarkdownCopied(true);
    setTimeout(() => setPageMarkdownCopied(false), 2400);
  };

  const copyCodeToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIndex(id);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  const isCurrentNav = (href: string) => {
    if (href === "/docs" && page.slug === "overview") return true;
    if (href === `/docs/${page.slug}`) return true;
    return false;
  };

  return (
    <div className={styles.docsPage}>
      {/* ---------------- JSON-LD Structured Data ---------------- */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(page.jsonLd) }}
      />

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
            <img
              src="/homepage/logo.webp"
              alt="MakeChurchEazy Logo"
              width={36}
              height={36}
              className={styles.logoIcon}
            />
            <span>MakeChurchEazy</span>
            <span className={styles.docsPill}>DOCS</span>
          </Link>
          <nav className={styles.navLinks}>
            <Link href="/docs" className={styles.navLink}>
              Overview
            </Link>
            <Link href="/docs/obs-setup" className={styles.navLink}>
              OBS Studio 30+
            </Link>
            <Link href="/docs/scripture-engine" className={styles.navLink}>
              Scriptures
            </Link>
            <Link href="/docs/worship-lyrics" className={styles.navLink}>
              EasyWorship & Hymns
            </Link>
            <Link href="/docs/stage-display" className={styles.navLink}>
              Mobile Remote
            </Link>
            <Link href="/download" className={styles.navLink}>
              Download App
            </Link>
          </nav>
        </div>

        <div className={styles.headerRight}>
          <button
            className={styles.searchBtn}
            onClick={() => setSearchOpen(true)}
            title="Search docs (⌘K)"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search docs</span>
            <span className={styles.searchKbd}>⌘K</span>
          </button>
          <Link href="/dashboard" className={styles.dashboardBtn}>
            Dashboard
          </Link>
        </div>
      </header>

      {/* ---------------- Layout Body ---------------- */}
      <div className={styles.layout}>
        {/* Left Sidebar Navigation */}
        <aside
          className={`${styles.sidebar} ${
            mobileMenuOpen ? styles.mobileSidebarOpen : ""
          }`}
        >
          <div className={styles.productSwitcher}>
            <Monitor className="w-4 h-4 text-blue-700" />
            <span>MakeChurchEazy Knowledge Base</span>
          </div>

          <div className={styles.filterWrap}>
            <Search className={styles.filterIcon} />
            <input
              id="docs-sidebar-filter"
              type="text"
              placeholder="Filter topics (/)"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className={styles.filterInput}
            />
          </div>

          {filteredNavSections.map((section, idx) => (
            <div key={idx} className={styles.navGroup}>
              <div className={styles.groupTitle}>{section.title}</div>
              <ul className={styles.sidebarList}>
                {section.items.map((item) => {
                  const active = isCurrentNav(item.href);
                  return (
                    <li key={item.id} className={styles.sidebarItem}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`${styles.sidebarLink} ${
                          active ? styles.sidebarLinkActive : ""
                        }`}
                      >
                        <span className="truncate">{item.title}</span>
                        {item.badge && (
                          <span className={styles.itemBadge}>{item.badge}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Sidebar Emergency Hotline Card */}
          <div className="mt-8 p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/60 text-xs">
            <div className="flex items-center gap-2 text-blue-900 font-bold mb-1">
              <PhoneCall className="w-3.5 h-3.5 text-blue-700" />
              <span>Sunday Emergency Hotline</span>
            </div>
            <p className="text-blue-950 font-mono font-semibold">
              +234 905 454 5286
            </p>
            <p className="text-blue-700 mt-1 text-[11px] leading-tight">
              Direct line for media directors & pastors during live services.
            </p>
          </div>
        </aside>

        {/* Center Main Content Area */}
        <main className={styles.contentArea}>
          {/* Breadcrumbs */}
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/" className={styles.breadcrumbLink}>
              Home
            </Link>
            <span>/</span>
            <Link href="/docs" className={styles.breadcrumbLink}>
              Documentation
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-medium">{page.title}</span>
          </nav>

          {/* Main Title & Badge */}
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className={styles.mainTitle}>{page.title}</h1>
            {page.badge && (
              <span className="px-2.5 py-1 bg-blue-100/80 text-blue-800 text-xs font-bold rounded-full uppercase tracking-wider">
                {page.badge}
              </span>
            )}
          </div>

          {page.subtitle && (
            <p className="text-slate-600 text-lg mb-4 font-normal">
              {page.subtitle}
            </p>
          )}

          {/* Meta Bar */}
          <div className={styles.metaRow}>
            <span>🕒 {page.readingTime}</span>
            <span>•</span>
            <span>Updated {page.lastUpdated}</span>
            <span>•</span>
            <button
              className={styles.metaActionBtn}
              onClick={copyPageMarkdown}
              title="Copy markdown content"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{pageMarkdownCopied ? "Copied!" : "Copy as Markdown"}</span>
            </button>
            <span>•</span>
            <button
              className={styles.metaActionBtn}
              onClick={() => setShowMarkdownModal(true)}
              title="View markdown preview"
            >
              <Code className="w-3.5 h-3.5" />
              <span>View Markdown</span>
            </button>
          </div>

          {/* Lead Paragraph */}
          <p className={styles.leadParagraph}>{page.lead}</p>

          {/* Dynamic Content Sections */}
          {page.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-24 mb-14"
            >
              <h2 className={styles.sectionHeading}>{section.title}</h2>

              {section.lead && (
                <p className="text-slate-700 leading-relaxed text-base mb-4 font-normal">
                  {section.lead}
                </p>
              )}

              {section.paragraphs && (
                <div className="space-y-3 text-slate-700 text-sm leading-relaxed mb-5">
                  {section.paragraphs.map((p, pIdx) => (
                    <p key={pIdx} className="whitespace-pre-line">
                      {p}
                    </p>
                  ))}
                </div>
              )}

              {/* Callout box */}
              {section.callout && (
                <div
                  className={`${styles.callout} ${
                    section.callout.type === "tip"
                      ? styles.calloutTip
                      : section.callout.type === "warn"
                      ? styles.calloutWarn
                      : styles.calloutNote
                  }`}
                >
                  {section.callout.title && (
                    <strong className="block mb-1 font-bold text-sm">
                      {section.callout.title}
                    </strong>
                  )}
                  <span className="text-sm whitespace-pre-line">
                    {section.callout.content}
                  </span>
                </div>
              )}

              {/* Step Cards */}
              {section.steps && (
                <div className="space-y-5 my-6">
                  {section.steps.map((step, sIdx) => (
                    <div key={sIdx} className={styles.stepCard}>
                      <div className={styles.stepHeader}>
                        <div className={styles.stepNumber}>
                          {step.number || sIdx + 1}
                        </div>
                        <h3 className={styles.stepTitle}>{step.title}</h3>
                      </div>
                      <p className="text-slate-700 text-sm leading-relaxed mb-3">
                        {step.description}
                      </p>
                      {step.code && (
                        <div className={styles.codeBlock}>
                          <div className={styles.codeHeader}>
                            <span>
                              {step.codeLanguage?.toUpperCase() || "CODE"}
                            </span>
                            <button
                              onClick={() =>
                                copyCodeToClipboard(
                                  step.code!,
                                  `${section.id}-step-${sIdx}`
                                )
                              }
                              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-sans"
                            >
                              {copiedCodeIndex ===
                              `${section.id}-step-${sIdx}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-emerald-700">
                                    Copied
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className={styles.codePre}>{step.code}</pre>
                        </div>
                      )}
                      {step.note && (
                        <p className="text-xs text-slate-500 italic mt-2">
                          Note: {step.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Data Table */}
              {section.table && (
                <div className={styles.tableWrap}>
                  <table className={styles.docTable}>
                    <thead>
                      <tr>
                        {section.table.headers.map((h, hIdx) => (
                          <th key={hIdx}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx}>
                              {cell.startsWith("http") ||
                              cell.startsWith("ws") ||
                              cell.startsWith("C:\\") ? (
                                <code className="bg-slate-100 text-blue-700 font-mono px-1.5 py-0.5 rounded text-xs">
                                  {cell}
                                </code>
                              ) : cell.includes("✓") ||
                                cell.includes("0ms") ||
                                cell.includes("Native") ? (
                                <strong className="text-emerald-700 font-semibold">
                                  {cell}
                                </strong>
                              ) : (
                                cell
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Code Blocks */}
              {section.codeBlocks && (
                <div className="space-y-4 my-5">
                  {section.codeBlocks.map((cb, cbIdx) => (
                    <div key={cbIdx} className={styles.codeBlock}>
                      <div className={styles.codeHeader}>
                        <span>{cb.label || cb.language || "CODE"}</span>
                        <button
                          onClick={() =>
                            copyCodeToClipboard(
                              cb.code,
                              `${section.id}-cb-${cbIdx}`
                            )
                          }
                          className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-sans"
                        >
                          {copiedCodeIndex === `${section.id}-cb-${cbIdx}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className={styles.codePre}>{cb.code}</pre>
                    </div>
                  ))}
                </div>
              )}

              {/* FAQs accordion */}
              {section.faqs && (
                <div className="space-y-3.5 my-6">
                  {section.faqs.map((faq, fIdx) => (
                    <div
                      key={fIdx}
                      className="border border-slate-200 bg-white rounded-xl p-4 shadow-sm"
                    >
                      <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-blue-700 shrink-0" />
                        <span>{faq.question}</span>
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed pl-6">
                        {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* ---------------- Pagination Links (Prev / Next) ---------------- */}
          <div className="mt-16 pt-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between gap-4">
            {page.prevPage ? (
              <Link
                href={
                  page.prevPage.slug === "overview"
                    ? "/docs"
                    : `/docs/${page.prevPage.slug}`
                }
                className="group flex-1 p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/20 transition-all text-left"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                  <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
                  <span>Previous Guide</span>
                </div>
                <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700">
                  {page.prevPage.title}
                </div>
              </Link>
            ) : (
              <div className="flex-1" />
            )}

            {page.nextPage ? (
              <Link
                href={
                  page.nextPage.slug === "overview"
                    ? "/docs"
                    : `/docs/${page.nextPage.slug}`
                }
                className="group flex-1 p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/20 transition-all text-right"
              >
                <div className="flex items-center justify-end gap-2 text-xs text-slate-500 font-medium mb-1">
                  <span>Next Guide</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </div>
                <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700">
                  {page.nextPage.title}
                </div>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        </main>

        {/* Right Sidebar: Table of Contents & Quick Reference */}
        <aside className={styles.tocSidebar}>
          <div className={styles.tocTitle}>On this page</div>
          <ul className={styles.tocList}>
            {page.toc.map((item) => (
              <li key={item.id} className={styles.tocItem}>
                <a
                  href={`#${item.id}`}
                  className={`${styles.tocLink} ${
                    activeTocId === item.id ? styles.tocLinkActive : ""
                  }`}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>

          {/* Quick Technical Reference Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-6 space-y-2">
            <div className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-700" />
              <span>Canonical Ports</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span>MCE Server</span>
              <code className="text-blue-700 font-mono font-bold">45678</code>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-1">
              <span>WS Relay</span>
              <code className="text-blue-700 font-mono font-bold">17891</code>
            </div>
            <div className="flex justify-between">
              <span>OBS v5 WS</span>
              <code className="text-blue-700 font-mono font-bold">4455</code>
            </div>
          </div>

          {/* Was this page helpful? feedback */}
          <div className={styles.helpfulBox}>
            <div className={styles.helpfulTitle}>Was this helpful?</div>
            <div className={styles.helpfulBtns}>
              <button
                className={`${styles.feedbackBtn} ${
                  feedback === "yes" ? "bg-emerald-50 text-emerald-800 border-emerald-300" : ""
                }`}
                onClick={() => setFeedback("yes")}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>Yes</span>
              </button>
              <button
                className={`${styles.feedbackBtn} ${
                  feedback === "no" ? "bg-rose-50 text-rose-800 border-rose-300" : ""
                }`}
                onClick={() => setFeedback("no")}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                <span>No</span>
              </button>
            </div>
            {feedback && (
              <p className="text-[11px] text-emerald-700 mb-4 font-medium">
                Thank you for your feedback!
              </p>
            )}

            <div className={styles.helpfulLinks}>
              <Link href="/download" className={styles.subLink}>
                <Monitor className="w-3.5 h-3.5" />
                <span>Download Desktop App</span>
              </Link>
              <Link href="/devices" className={styles.subLink}>
                <Smartphone className="w-3.5 h-3.5" />
                <span>Pair Mobile Remote</span>
              </Link>
              <a
                href="https://github.com/jolamyfoodsng/makechurcheasy/issues"
                target="_blank"
                rel="noreferrer"
                className={styles.subLink}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Report an Issue</span>
              </a>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------- View as Markdown Modal ---------------- */}
      {showMarkdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-700" />
                <span>Markdown Source: {page.title}</span>
              </div>
              <button
                onClick={() => setShowMarkdownModal(false)}
                className="text-slate-600 hover:text-slate-900 p-1"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-slate-700 bg-slate-50">
              <pre className="whitespace-pre-wrap">{`# ${page.title}

${page.lead}

${page.sections
  .map(
    (s) => `## ${s.title}
${s.paragraphs?.join("\n\n") || s.lead || ""}
`
  )
  .join("\n\n")}`}</pre>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={copyPageMarkdown}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold"
              >
                {pageMarkdownCopied ? "Copied!" : "Copy to Clipboard"}
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
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
            <div className="flex items-center px-4 border-b border-slate-200">
              <Search className="w-5 h-5 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search all guides, ports, shortcuts, features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full py-3.5 text-sm outline-none text-slate-900 placeholder-slate-400"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
                aria-label="Close search"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-2 flex-1">
              {searchQuery.trim() === "" ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <p className="font-semibold text-slate-600 mb-1">
                    Quick Search Tips:
                  </p>
                  <p>Try searching &quot;OBS setup&quot;, &quot;port 45678&quot;, &quot;EasyWorship import&quot;, &quot;CCC hymns&quot;, or &quot;speech to scripture&quot;.</p>
                </div>
              ) : globalSearchResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No matching documentation found for &quot;{searchQuery}&quot;.
                </div>
              ) : (
                <div className="space-y-1">
                  {globalSearchResults.map((res, i) => (
                    <Link
                      key={i}
                      href={res.href}
                      onClick={() => setSearchOpen(false)}
                      className="block p-2.5 rounded-lg hover:bg-blue-50/70 border border-transparent hover:border-blue-100 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-blue-700 mb-0.5">
                        <span>{res.pageTitle}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {res.sectionTitle}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">
                        {res.snippet}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 px-4">
              <span>Press <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px]">ESC</kbd> to exit</span>
              <span>{globalSearchResults.length} results</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
