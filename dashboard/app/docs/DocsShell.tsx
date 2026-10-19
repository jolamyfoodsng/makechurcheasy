"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Code,
  Copy,
  FileText,
  Info,
  LifeBuoy,
  Menu,
  Monitor,
  Search,
  Smartphone,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import styles from "./docs.module.css";
import type { DocBlock, DocInline, DocSection } from "./docs-markdown";
import type { DocNavGroup, DocSearchEntry } from "./docs-source";

export interface DocsShellPage {
  slug: string;
  href: string;
  title: string;
  description: string;
  updated: string;
  readingTime: string;
  intro: DocBlock[];
  sections: DocSection[];
  markdown: string;
}

interface DocsShellProps {
  page: DocsShellPage;
  nav: DocNavGroup[];
  search: DocSearchEntry[];
  prev?: { href: string; title: string };
  next?: { href: string; title: string };
}

function Inline({ nodes }: { nodes: DocInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text": return <React.Fragment key={i}>{n.v}</React.Fragment>;
          case "strong": return <strong key={i}><Inline nodes={n.c} /></strong>;
          case "em": return <em key={i}><Inline nodes={n.c} /></em>;
          case "code": return <code key={i} className={styles.inlineCode}>{n.v}</code>;
          case "link":
            return n.href.startsWith("/") || n.href.startsWith("#")
              ? <Link key={i} href={n.href} className={styles.inlineLink}><Inline nodes={n.c} /></Link>
              : <a key={i} href={n.href} className={styles.inlineLink} target={n.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer"><Inline nodes={n.c} /></a>;
        }
      })}
    </>
  );
}

function Blocks({ blocks, sectionId, copied, onCopy }: { blocks: DocBlock[]; sectionId: string; copied: string | null; onCopy: (code: string, id: string) => void }) {
  return (
    <>
      {blocks.map((b, i) => {
        const key = `${sectionId}-${i}`;
        switch (b.type) {
          case "p":
            return <p key={key} className={styles.docParagraph}><Inline nodes={b.c} /></p>;
          case "h3":
            return <h3 key={key} id={b.id} className={styles.docSubheading}><Inline nodes={b.c} /></h3>;
          case "ul":
            return <ul key={key} className={styles.docList}>{b.items.map((it, j) => <li key={j}><Inline nodes={it} /></li>)}</ul>;
          case "ol":
            return <ol key={key} className={styles.docListOrdered}>{b.items.map((it, j) => <li key={j}><Inline nodes={it} /></li>)}</ol>;
          case "steps":
            return (
              <ol key={key} className={styles.stepList}>
                {b.items.map((s, j) => (
                  <li key={j} className={styles.stepCard}>
                    <div className={styles.stepHeader}>
                      <span className={styles.stepNumber}>{j + 1}</span>
                      <span className={styles.stepTitle}><Inline nodes={s.title} /></span>
                    </div>
                    {s.body.length > 0 && <p className={styles.stepBody}><Inline nodes={s.body} /></p>}
                  </li>
                ))}
              </ol>
            );
          case "callout": {
            const Icon = b.kind === "tip" ? CheckCircle2 : b.kind === "warn" ? AlertCircle : Info;
            return (
              <div key={key} className={`${styles.callout} ${b.kind === "tip" ? styles.calloutTip : b.kind === "warn" ? styles.calloutWarn : styles.calloutNote}`}>
                <div className={styles.calloutTitle}><Icon className="w-4 h-4 shrink-0" />{b.title || (b.kind === "tip" ? "Tip" : b.kind === "warn" ? "Important" : "Note")}</div>
                {b.c.map((para, j) => <p key={j}><Inline nodes={para} /></p>)}
              </div>
            );
          }
          case "table":
            return (
              <div key={key} className={styles.tableWrap}>
                <table className={styles.docTable}>
                  <thead><tr>{b.head.map((h, j) => <th key={j}><Inline nodes={h} /></th>)}</tr></thead>
                  <tbody>{b.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}><Inline nodes={cell} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <div key={key} className={styles.codeBlock}>
                <div className={styles.codeHeader}>
                  <span>{(b.lang || "text").toUpperCase()}</span>
                  <button type="button" onClick={() => onCopy(b.code, key)} className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-sans">
                    {copied === key ? <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">Copied</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>}
                  </button>
                </div>
                <pre className={styles.codePre}>{b.code}</pre>
              </div>
            );
          case "img":
            return <img key={key} src={b.src} alt={b.alt} className={styles.docImage} loading="lazy" />;
        }
      })}
    </>
  );
}

export function DocsShell({ page, nav, search, prev, next }: DocsShellProps) {
  const [filterText, setFilterText] = useState("");
  const [activeTocId, setActiveTocId] = useState<string>(page.sections[0]?.id || "");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [pageMarkdownCopied, setPageMarkdownCopied] = useState(false);
  const [showMarkdownModal, setShowMarkdownModal] = useState(false);
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ⌘K / Ctrl+K opens search, / jumps to the sidebar filter, Escape closes.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      } else if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("docs-sidebar-filter")?.focus();
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setShowMarkdownModal(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // "On this page": highlight the section being read.
  useEffect(() => {
    const els = page.sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveTocId(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [page.slug, page.sections]);

  const filteredNav = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return nav;
    return nav
      .map((g) => ({ ...g, items: g.items.filter((it) => it.title.toLowerCase().includes(q) || g.title.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [filterText, nav]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return search
      .filter((e) => `${e.pageTitle} ${e.sectionTitle} ${e.text}`.toLowerCase().includes(q))
      .slice(0, 12)
      .map((e) => {
        const at = e.text.toLowerCase().indexOf(q);
        const start = Math.max(0, at - 40);
        const snippet = at >= 0 ? `${start > 0 ? "…" : ""}${e.text.slice(start, start + 140)}…` : e.text.slice(0, 140);
        return { ...e, snippet };
      });
  }, [searchQuery, search]);

  const pageMarkdown = `# ${page.title}\n\n${page.markdown}\n\n*From the MakeChurchEazy documentation: https://makechurcheazy.com${page.href}*`;
  const copyPageMarkdown = () => {
    void navigator.clipboard.writeText(pageMarkdown);
    setPageMarkdownCopied(true);
    setTimeout(() => setPageMarkdownCopied(false), 2400);
  };
  const copyCode = (code: string, id: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className={styles.docsPage}>
      <header className={styles.header}>
        <div className={styles.brandWrap}>
          <button className={styles.mobileMenuBtn} onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation">
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link href="/" className={styles.logoLink}>
            <img src="/homepage/logo.webp" alt="MakeChurchEazy Logo" width={36} height={36} className={styles.logoIcon} />
            <span>MakeChurchEazy</span>
            <span className={styles.docsPill}>DOCS</span>
          </Link>
          <nav className={styles.navLinks}>
            <Link href="/docs" className={styles.navLink}>Start here</Link>
            <Link href="/docs/bible" className={styles.navLink}>Bible</Link>
            <Link href="/docs/worship" className={styles.navLink}>Worship</Link>
            <Link href="/docs/studio-mode" className={styles.navLink}>Studio mode</Link>
            <Link href="/docs/obs-setup" className={styles.navLink}>OBS</Link>
            <Link href="/docs/troubleshooting" className={styles.navLink}>Help</Link>
          </nav>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.searchBtn} onClick={() => setSearchOpen(true)} title="Search docs (⌘K)">
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search docs</span>
            <span className={styles.searchKbd}>⌘K</span>
          </button>
          <Link href="/download" className={styles.dashboardBtn}>Download</Link>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.mobileSidebarOpen : ""}`}>
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
          {filteredNav.map((group) => (
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.groupTitle}>{group.title}</div>
              <ul className={styles.sidebarList}>
                {group.items.map((item) => (
                  <li key={item.slug} className={styles.sidebarItem}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`${styles.sidebarLink} ${item.slug === page.slug ? styles.sidebarLinkActive : ""}`}
                      aria-current={item.slug === page.slug ? "page" : undefined}
                    >
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className={styles.sidebarHelp}>
            <div className={styles.sidebarHelpTitle}><LifeBuoy className="w-3.5 h-3.5" /> Need a hand?</div>
            <p>Visit <Link href="/support">Support</Link> or email <a href="mailto:support@makechurcheazy.com">support@makechurcheazy.com</a>.</p>
          </div>
        </aside>

        <main className={styles.contentArea}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/" className={styles.breadcrumbLink}>Home</Link>
            <span>/</span>
            <Link href="/docs" className={styles.breadcrumbLink}>Docs</Link>
            {page.slug !== "index" && <><span>/</span><span className="text-slate-900 font-medium">{page.title}</span></>}
          </nav>

          <h1 className={styles.mainTitle}>{page.title}</h1>

          <div className={styles.metaRow}>
            <span>{page.readingTime}</span>
            {page.updated && <><span>•</span><span>Updated {page.updated}</span></>}
            <span>•</span>
            <button className={styles.metaActionBtn} onClick={copyPageMarkdown} title="Copy this page as Markdown">
              <Copy className="w-3.5 h-3.5" />
              <span>{pageMarkdownCopied ? "Copied!" : "Copy as Markdown"}</span>
            </button>
            <span>•</span>
            <button className={styles.metaActionBtn} onClick={() => setShowMarkdownModal(true)} title="View this page's Markdown">
              <Code className="w-3.5 h-3.5" />
              <span>View Markdown</span>
            </button>
          </div>

          <div className={styles.docIntro}>
            <Blocks blocks={page.intro} sectionId="intro" copied={copiedCode} onCopy={copyCode} />
          </div>

          {page.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 mb-12">
              <h2 className={styles.sectionHeading}>{section.title}</h2>
              <Blocks blocks={section.blocks} sectionId={section.id} copied={copiedCode} onCopy={copyCode} />
            </section>
          ))}

          <div className="mt-16 pt-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between gap-4">
            {prev ? (
              <Link href={prev.href} className="group flex-1 p-4 rounded-md border border-slate-200 hover:border-blue-400 bg-slate-50/50 transition-colors text-left">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1"><ArrowLeft className="w-3.5 h-3.5" /><span>Previous</span></div>
                <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700">{prev.title}</div>
              </Link>
            ) : <div className="flex-1" />}
            {next ? (
              <Link href={next.href} className="group flex-1 p-4 rounded-md border border-slate-200 hover:border-blue-400 bg-slate-50/50 transition-colors text-right">
                <div className="flex items-center justify-end gap-2 text-xs text-slate-500 font-medium mb-1"><span>Next</span><ArrowRight className="w-3.5 h-3.5" /></div>
                <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700">{next.title}</div>
              </Link>
            ) : <div className="flex-1" />}
          </div>
        </main>

        <aside className={styles.tocSidebar}>
          {page.sections.length > 0 && (
            <>
              <div className={styles.tocTitle}>On this page</div>
              <ul className={styles.tocList}>
                {page.sections.map((s) => (
                  <li key={s.id} className={styles.tocItem}>
                    <a href={`#${s.id}`} className={`${styles.tocLink} ${activeTocId === s.id ? styles.tocLinkActive : ""}`}>{s.title}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={styles.helpfulBox}>
            <div className={styles.helpfulTitle}>Was this helpful?</div>
            <div className={styles.helpfulBtns}>
              <button className={`${styles.feedbackBtn} ${feedback === "yes" ? "bg-emerald-50 text-emerald-800 border-emerald-300" : ""}`} onClick={() => setFeedback("yes")}>
                <ThumbsUp className="w-3.5 h-3.5" /><span>Yes</span>
              </button>
              <button className={`${styles.feedbackBtn} ${feedback === "no" ? "bg-rose-50 text-rose-800 border-rose-300" : ""}`} onClick={() => setFeedback("no")}>
                <ThumbsDown className="w-3.5 h-3.5" /><span>No</span>
              </button>
            </div>
            {feedback && <p className="text-[11px] text-emerald-700 mb-4 font-medium">Thank you for your feedback!</p>}
            <div className={styles.helpfulLinks}>
              <Link href="/download" className={styles.subLink}><Monitor className="w-3.5 h-3.5" /><span>Download the app</span></Link>
              <Link href="/devices" className={styles.subLink}><Smartphone className="w-3.5 h-3.5" /><span>Your devices</span></Link>
              <Link href="/support" className={styles.subLink}><LifeBuoy className="w-3.5 h-3.5" /><span>Get support</span></Link>
            </div>
          </div>
        </aside>
      </div>

      {showMarkdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-md w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" role="dialog" aria-label={`Markdown: ${page.title}`}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-700" /><span>Markdown: {page.title}</span></div>
              <button onClick={() => setShowMarkdownModal(false)} className="text-slate-600 hover:text-slate-900 p-1" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-slate-700 bg-slate-50">
              <pre className="whitespace-pre-wrap">{pageMarkdown}</pre>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={copyPageMarkdown} className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded text-xs font-semibold">{pageMarkdownCopied ? "Copied!" : "Copy to clipboard"}</button>
              <button onClick={() => setShowMarkdownModal(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs">Close</button>
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-md w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]" role="dialog" aria-label="Search the docs">
            <div className="flex items-center px-4 border-b border-slate-200">
              <Search className="w-5 h-5 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search the docs: Bible, lyrics, projector, OBS…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full py-3.5 text-sm outline-none text-slate-900 placeholder-slate-400"
              />
              <button onClick={() => setSearchOpen(false)} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Close search"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-2 flex-1">
              {searchQuery.trim() === "" ? (
                <div className="p-6 text-center text-xs text-slate-500">Try “lower third”, “projector”, “import songs” or “OBS password”.</div>
              ) : searchResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">Nothing found for “{searchQuery}”.</div>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((res, i) => (
                    <Link key={i} href={res.href} onClick={() => setSearchOpen(false)} className="block p-2.5 rounded hover:bg-blue-50/70 border border-transparent hover:border-blue-100 transition-colors">
                      <div className="flex items-center justify-between text-xs font-bold text-blue-700 mb-0.5">
                        <span>{res.pageTitle}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{res.sectionTitle}</span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{res.snippet}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 px-4">
              <span>Press <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px]">Esc</kbd> to close</span>
              <span>{searchResults.length} results</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
