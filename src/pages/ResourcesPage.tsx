/**
 * ResourcesPage.tsx — Setup resources for the dock-first workflow
 *
 * Keeps Bible translations, worship songs, and media assets together so the
 * main app remains the setup surface while the MakeChurchEasy Dock stays focused on live control.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  HelpCircle,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import ResourcesTutorial, {
  isResourcesTutorialCompleted,
  markResourcesTutorialCompleted,
  resetResourcesTutorial,
} from "./ResourcesTutorial";
import BibleLibrary from "../bible/components/BibleLibrary";
import { MediaTab } from "../library/MediaTab";
import { SongsTab } from "../library/SongsTab";
import Icon from "../components/Icon";
import "../library/library.css";

type ResourceTab = "bible" | "worship" | "media";

const TAB_KEY = "production-resources-active-tab";

function parseTab(value: string | null): ResourceTab | null {
  if (value === "bible" || value === "worship" || value === "media") {
    return value;
  }
  return null;
}

const TAB_COPY: Record<ResourceTab, { title: string; subtitle: string; icon: string }> = {
  bible: {
    title: "Bible Resources",
    subtitle: "Download translations like KJV and ASV or import custom XML Bibles for the MakeChurchEasy Dock.",
    icon: "menu_book",
  },
  worship: {
    title: "Worship Resources",
    subtitle: "Manage the worship songs and lyrics that appear in the MakeChurchEasy Dock.",
    icon: "music_note",
  },
  media: {
    title: "Media Resources",
    subtitle: "Manage videos, images, and backgrounds that the dock can send into OBS.",
    icon: "perm_media",
  },
};

export default function ResourcesPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = parseTab(searchParams.get("tab"));
  const focusMediaId = searchParams.get("mediaId") ?? undefined;
  const [tab, setTab] = useState<ResourceTab>(() => {
    const saved = parseTab(localStorage.getItem(TAB_KEY));
    return requestedTab ?? saved ?? "worship";
  });

  // ── Tutorial state ──
  const [tourActive, setTourActive] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (requestedTab && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [requestedTab, tab]);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  // ── Auto-start tutorial on first visit ──
  useEffect(() => {
    if (!isResourcesTutorialCompleted() && !tourActive) {
      const timer = setTimeout(() => setTourActive(true), 600);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTab = useCallback((next: ResourceTab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  }, [setSearchParams]);

  const copy = TAB_COPY[tab];

  return (
    <div className="app-page resources-page">
      <div className="app-page__inner resources-page__inner">
        <header className="app-page__header resources-page__header" data-res-tutorial="welcome">
          <div className="app-page__header-copy resources-page__header-copy">
            <p className="app-page__eyebrow">Resources</p>
            <h1 className="app-page__title">{copy.title}</h1>
            <p className="app-page__subtitle">{copy.subtitle}</p>

            <div className="resources-tab-switcher" role="tablist" aria-label="Resource sections" data-res-tutorial="tabs">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "bible"}
                className={`resources-tab-btn${tab === "bible" ? " is-active" : ""}`}
                onClick={() => handleTab("bible")}
                title="Book">
                <Icon name="menu_book" size={20} />
                Bible
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "worship"}
                className={`resources-tab-btn${tab === "worship" ? " is-active" : ""}`}
                onClick={() => handleTab("worship")}
                title="Music">
                <Icon name="music_note" size={20} />
                Worship
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "media"}
                className={`resources-tab-btn${tab === "media" ? " is-active" : ""}`}
                onClick={() => handleTab("media")}
                title="Media">
                <Icon name="perm_media" size={20} />
                Media
              </button>
            </div>
          </div>

          <div className="app-page__actions">
            <button
              className="production-btn production-btn--ghost"
              onClick={() => { resetResourcesTutorial(); setTourActive(true); setBannerDismissed(false); }}
              title={t("rt.button.tooltip")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", background: "transparent", cursor: "pointer" }}
            >
              <HelpCircle size={16} /> {t("rt.button")}
            </button>
          </div>
        </header>

        {/* ── Incomplete tutorial banner ── */}
        {!tourActive && !isResourcesTutorialCompleted() && !bannerDismissed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", margin: "0 24px 16px", background: "rgba(var(--primary-rgb, 99, 102, 241), 0.08)", border: "1px solid rgba(var(--primary-rgb, 99, 102, 241), 0.2)", borderRadius: 8, fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            <AlertTriangle size={14} style={{ color: "var(--primary)", flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t("rt.banner")}</span>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "var(--primary)", color: "#fff", border: "1px solid var(--primary)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, cursor: "pointer" }} onClick={() => setTourActive(true)}>
                {t("rt.banner.continue")}
              </button>
              <button style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", background: "transparent", cursor: "pointer" }} onClick={() => { resetResourcesTutorial(); setTourActive(true); setBannerDismissed(false); }}>
                <RotateCcw size={12} /> {t("rt.banner.restart")}
              </button>
              <button style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", background: "transparent", cursor: "pointer" }} onClick={() => setBannerDismissed(true)}>
                {t("rt.banner.dismiss")}
              </button>
            </div>
          </div>
        )}

        <div className="resources-content" data-res-tutorial="content">
          <div className="lib-page">
            {tab === "bible" && (
              <div className="resources-embedded-panel" data-resource-tab="bible">
                <BibleLibrary
                  open
                  onClose={() => { }}
                  mode="embedded"
                />
              </div>
            )}

            {tab === "worship" && <SongsTab />}
            {tab === "media" && <MediaTab focusMediaId={focusMediaId} />}
          </div>
        </div>
      </div>

      {/* ── Tutorial Tour ── */}
      <ResourcesTutorial
        isActive={tourActive}
        onClose={() => setTourActive(false)}
        onFinish={() => { markResourcesTutorialCompleted(); setTourActive(false); }}
      />
    </div>
  );
}
