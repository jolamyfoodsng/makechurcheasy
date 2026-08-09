/**
 * ResourcesPage.tsx — Setup resources for the dock-first workflow
 *
 * Keeps Bible translations, worship songs, and media assets together so the
 * main app remains the setup surface while the MakeChurchEasy Dock stays focused on live control.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

const TAB_COPY: Record<ResourceTab, { icon: string }> = {
  bible: {
    icon: "menu_book",
  },
  worship: {
    icon: "music_note",
  },
  media: {
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

  useEffect(() => {
    if (requestedTab && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [requestedTab, tab]);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const handleTab = useCallback((next: ResourceTab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  }, [setSearchParams]);

  const translatedTabCopy = useMemo(() => ({
    bible: { title: t("resources.tabBibleTitle"), subtitle: t("resources.tabBibleSubtitle"), icon: TAB_COPY.bible.icon },
    worship: { title: t("resources.tabWorshipTitle"), subtitle: t("resources.tabWorshipSubtitle"), icon: TAB_COPY.worship.icon },
    media: { title: t("resources.tabMediaTitle"), subtitle: t("resources.tabMediaSubtitle"), icon: TAB_COPY.media.icon },
  }), [t]);

  const copy = translatedTabCopy[tab];

  return (
    <div className="app-page resources-page">
      <div className="app-page__inner resources-page__inner">
        <header className="app-page__header resources-page__header">
          <div className="app-page__header-copy resources-page__header-copy">
            <p className="app-page__eyebrow">{t("resources.pageEyebrow")}</p>
            <h1 className="app-page__title">{copy.title}</h1>
            <p className="app-page__subtitle">{copy.subtitle}</p>

            <div className="resources-tab-switcher" role="tablist" aria-label={t("resources.ariaSections")}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "bible"}
                className={`resources-tab-btn${tab === "bible" ? " is-active" : ""}`}
                onClick={() => handleTab("bible")}
                title={t("resources.tabTitleBible")}>
                <Icon name="menu_book" size={20} />
                {t("resources.tabLabelBible")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "worship"}
                className={`resources-tab-btn${tab === "worship" ? " is-active" : ""}`}
                onClick={() => handleTab("worship")}
                title={t("resources.tabTitleWorship")}>
                <Icon name="music_note" size={20} />
                {t("resources.tabLabelWorship")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "media"}
                className={`resources-tab-btn${tab === "media" ? " is-active" : ""}`}
                onClick={() => handleTab("media")}
                title={t("resources.tabTitleMedia")}>
                <Icon name="perm_media" size={20} />
                {t("resources.tabLabelMedia")}
              </button>
            </div>
          </div>
        </header>

        <div className="resources-content">
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

    </div>
  );
}
