import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QuickMergePanel } from "../components/modules/QuickMergePanel";
import Icon from "../components/Icon";

export default function QuickMergePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="app-page quick-merge-page">
      <div className="app-page__inner quick-merge-page__inner">
        <header className="app-page__header quick-merge-page-header">
          <div className="quick-merge-page-head-left">
            <button
              type="button"
              className="quick-merge-page-back-btn"
              onClick={() => navigate("/hub?mode=live")}
              title={t("quickMerge.tooltip.backToHub")}>
              <Icon name="arrow_back" size={20} />
              {t("quickMerge.serviceHub")}
            </button>
            <div className="app-page__header-copy quick-merge-page-head-copy">
              <p className="app-page__eyebrow">{t("quickMerge.eyebrow")}</p>
              <h1 className="app-page__title">{t("quickMerge.description")}</h1>
              <p className="app-page__subtitle">{t("quickMerge.subtitle")}</p>
            </div>
          </div>
        </header>

        <main className="quick-merge-page-main">
          <QuickMergePanel isActive />
        </main>
      </div>
    </div>
  );
}
