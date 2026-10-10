/**
 * ResourcesPage.tsx — Setup resources for the dock-first workflow
 *
 * Keeps the media library as the default setup surface while the
 * MakeChurchEasy Dock stays focused on live control.
 */

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BibleLibrary from "../bible/components/BibleLibrary";
import { MediaTab } from "../library/MediaTab";
import { SongsTab } from "../library/SongsTab";
import "../library/library.css";

type ResourceTab = "bible" | "worship" | "media";

function parseTab(value: string | null): ResourceTab | null {
  if (value === "bible" || value === "worship" || value === "media") {
    return value;
  }
  return null;
}

export default function ResourcesPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = parseTab(searchParams.get("tab"));
  const focusMediaId = searchParams.get("mediaId") ?? undefined;
  const openReceiver = searchParams.get("receiver") === "1";
  // Resources opens on Media by default. Bible and Worship remain available
  // through their direct sidebar links, without adding another tab strip to
  // the media workspace.
  const tab: ResourceTab = requestedTab ?? "media";

  const translatedTabCopy = useMemo(() => ({
    bible: { title: t("resources.tabBibleTitle"), subtitle: t("resources.tabBibleSubtitle") },
    worship: { title: t("resources.tabWorshipTitle"), subtitle: t("resources.tabWorshipSubtitle") },
    media: { title: t("resources.tabMediaTitle"), subtitle: t("resources.tabMediaSubtitle") },
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
          </div>

          {/* Direct Tab Switcher without emojis */}
          <div className="lib-tab-switcher" style={{ marginTop: "14px", borderBottom: "1px solid var(--border, rgba(255, 255, 255, 0.1))", display: "flex", gap: "8px" }}>
            <button
              type="button"
              className={`lib-tab-btn${tab === "bible" ? " lib-tab-btn--active" : ""}`}
              onClick={() => setSearchParams({ tab: "bible" })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                fontSize: "0.9375rem",
                fontWeight: tab === "bible" ? 700 : 500,
                color: tab === "bible" ? "#ffffff" : "var(--text-muted, #a1a1aa)",
                borderBottom: tab === "bible" ? "2px solid var(--primary, #4F46E5)" : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                transition: "color 0.15s ease",
              }}
            >
              Bible Library & Downloads
            </button>
            <button
              type="button"
              className={`lib-tab-btn${tab === "worship" ? " lib-tab-btn--active" : ""}`}
              onClick={() => setSearchParams({ tab: "worship" })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                fontSize: "0.9375rem",
                fontWeight: tab === "worship" ? 700 : 500,
                color: tab === "worship" ? "#ffffff" : "var(--text-muted, #a1a1aa)",
                borderBottom: tab === "worship" ? "2px solid var(--primary, #4F46E5)" : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                transition: "color 0.15s ease",
              }}
            >
              Worship Songs
            </button>
            <button
              type="button"
              className={`lib-tab-btn${tab === "media" ? " lib-tab-btn--active" : ""}`}
              onClick={() => setSearchParams({ tab: "media" })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                fontSize: "0.9375rem",
                fontWeight: tab === "media" ? 700 : 500,
                color: tab === "media" ? "#ffffff" : "var(--text-muted, #a1a1aa)",
                borderBottom: tab === "media" ? "2px solid var(--primary, #4F46E5)" : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                transition: "color 0.15s ease",
              }}
            >
              Media Library
            </button>
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
            {tab === "media" && <MediaTab focusMediaId={focusMediaId} openReceiver={openReceiver} />}
          </div>
        </div>
      </div>

    </div>
  );
}
