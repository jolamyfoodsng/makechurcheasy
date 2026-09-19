import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import {
  type EditableTemplate,
  type TemplateCategory,
  type TemplateTextLayer,
} from "../templates/editableTemplateCatalog";
import { loadEditableTemplates } from "../templates/editableTemplateStorage";
import { TemplateCanvas } from "../templates/TemplateCanvas";
import "./TemplatesPage.css";

type CategoryFilter = "All" | TemplateCategory;

const CATEGORY_FILTERS: CategoryFilter[] = ["All", "Bible", "Worship", "Announcements", "Service"];

const CATEGORY_ICONS: Record<CategoryFilter, string> = {
  All: "apps",
  Bible: "menu_book",
  Worship: "music_note",
  Announcements: "campaign",
  Service: "church",
};

function formatCategory(category: TemplateCategory): string {
  return category === "Announcements" ? "Announcements" : category;
}

function formatCanvas(template: EditableTemplate): string {
  const ratio = template.canvas.width / template.canvas.height;
  const ratioLabel = Math.abs(ratio - 16 / 9) < 0.06
    ? "16:9"
    : Math.abs(ratio - 4 / 3) < 0.06
      ? "4:3"
      : ratio > 1
        ? "Landscape"
        : "Portrait";
  return `${ratioLabel} · ${template.canvas.width} × ${template.canvas.height}`;
}

function templateSearchText(template: EditableTemplate): string {
  return [
    template.name,
    template.description,
    template.category,
    ...template.tags,
    ...template.layers
      .filter((layer): layer is TemplateTextLayer => layer.kind === "text")
      .map((layer) => layer.text),
  ].join(" ").toLowerCase();
}

function TemplateCard({
  template,
  onPreview,
  onEdit,
}: {
  template: EditableTemplate;
  onPreview: (template: EditableTemplate) => void;
  onEdit: (template: EditableTemplate) => void;
}) {
  return (
    <article className="templates-card">
      <button
        type="button"
        className="templates-card__preview-button"
        onClick={() => onPreview(template)}
        aria-label={`Preview ${template.name}`}
      >
        <TemplateCanvas template={template} />
        <span className="templates-card__preview-overlay">
          <Icon name="visibility" size={16} />
          View template
        </span>
      </button>

      <div className="templates-card__body">
        <div className="templates-card__meta">
          <span className="templates-card__category" style={{ color: template.accentColor }}>
            {formatCategory(template.category)}
          </span>
          <span className="templates-card__format">{formatCanvas(template)}</span>
        </div>
        <h2>{template.name}</h2>
        <p>{template.description}</p>
        <div className="templates-card__tags">
          {template.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="templates-card__actions">
          <button type="button" className="templates-button templates-button--secondary" onClick={() => onPreview(template)}>
            <Icon name="visibility" size={15} />
            Preview
          </button>
          <button type="button" className="templates-button templates-button--primary" onClick={() => onEdit(template)}>
            <Icon name="edit" size={15} />
            Edit template
          </button>
        </div>
      </div>
    </article>
  );
}

function PreviewModal({
  template,
  onClose,
  onEdit,
}: {
  template: EditableTemplate;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="templates-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="templates-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="templates-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="templates-preview-modal__header">
          <div>
            <p className="templates-preview-modal__eyebrow">{formatCategory(template.category)} template</p>
            <h2 id="templates-preview-title">{template.name}</h2>
          </div>
          <button type="button" className="templates-icon-button" onClick={onClose} aria-label="Close preview" title="Close preview">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="templates-preview-modal__body">
          <div className="templates-preview-modal__canvas">
            <TemplateCanvas template={template} />
          </div>
          <aside className="templates-preview-modal__details">
            <div>
              <p className="templates-section-label">About this template</p>
              <p className="templates-preview-modal__description">{template.description}</p>
            </div>
            <div className="templates-preview-modal__specs">
              <div><span>Canvas</span><strong>{formatCanvas(template)}</strong></div>
              <div><span>Editable</span><strong>Text, artwork, and layout</strong></div>
              <div><span>Best for</span><strong>{template.tags.join(" · ")}</strong></div>
            </div>
            <div className="templates-preview-modal__note">
              <Icon name="layers" size={17} />
              <span>Every element stays separate. Click an object to select it, drag it anywhere, or double-click text to edit it.</span>
            </div>
            <button type="button" className="templates-button templates-button--primary templates-button--large" onClick={onEdit}>
              <Icon name="edit" size={17} />
              Edit this template
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [templates] = useState<EditableTemplate[]>(() => loadEditableTemplates());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  const editingTemplateId = searchParams.get("edit");
  const editingTemplate = templates.find((template) => template.id === editingTemplateId) ?? null;
  const previewTemplate = templates.find((template) => template.id === previewTemplateId) ?? null;

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesCategory = category === "All" || template.category === category;
      return matchesCategory && (!normalizedQuery || templateSearchText(template).includes(normalizedQuery));
    });
  }, [category, query, templates]);

  useEffect(() => {
    if (!previewTemplate && previewTemplateId) setPreviewTemplateId(null);
  }, [previewTemplate, previewTemplateId]);

  useEffect(() => {
    if (!previewTemplate) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewTemplateId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewTemplate]);

  const openEditor = useCallback((template: EditableTemplate) => {
    setPreviewTemplateId(null);
    navigate(`/design-studio?template=${encodeURIComponent(template.id)}`);
  }, [navigate]);

  // Preserve bookmarked legacy editor links while routing them through Fabric Design Studio.
  if (editingTemplate) {
    return <Navigate to={`/design-studio?template=${encodeURIComponent(editingTemplate.id)}`} replace />;
  }

  return (
    <div className="app-page templates-page">
      <div className="app-page__inner templates-page__inner">
        <header className="app-page__header templates-page__header">
          <div className="app-page__header-copy">
            <p className="app-page__eyebrow">MAKECHURCHEASY TEMPLATES</p>
            <h1 className="app-page__title">Start with a service-ready design</h1>
            <p className="app-page__subtitle">
              Choose a structured graphic, preview it, and update the words in the app. Your team can move from idea to a usable church visual in minutes.
            </p>
          </div>
          <div className="templates-page__header-mark" aria-hidden="true">
            <Icon name="layers" size={18} />
            <span>{templates.length} editable templates</span>
          </div>
        </header>

        <section className="templates-toolbar" aria-label="Find templates">
          <label className="templates-search">
            <Icon name="search" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates, verses, events…"
              aria-label="Search templates"
            />
            {query && (
              <button type="button" className="templates-search__clear" onClick={() => setQuery("")} aria-label="Clear template search">
                <Icon name="close" size={14} />
              </button>
            )}
          </label>
          <div className="templates-category-tabs" role="tablist" aria-label="Template categories">
            {CATEGORY_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={category === item}
                className={category === item ? "is-active" : ""}
                onClick={() => setCategory(item)}
              >
                <Icon name={CATEGORY_ICONS[item]} size={15} />
                {item}
              </button>
            ))}
          </div>
        </section>

        <div className="templates-results-bar">
          <div>
            <strong>{filteredTemplates.length}</strong> {filteredTemplates.length === 1 ? "template" : "templates"}
            {category !== "All" && <span> in {category}</span>}
          </div>
          <span className="templates-results-bar__hint">Every template keeps its text editable.</span>
        </div>

        {filteredTemplates.length > 0 ? (
          <section className="templates-grid" aria-label="Editable church templates">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onPreview={(selectedTemplate) => setPreviewTemplateId(selectedTemplate.id)}
                onEdit={openEditor}
              />
            ))}
          </section>
        ) : (
          <section className="templates-empty">
            <Icon name="search_off" size={28} />
            <h2>No matching templates</h2>
            <p>Try another search or choose a different category.</p>
            <button type="button" className="templates-button templates-button--secondary" onClick={() => { setQuery(""); setCategory("All"); }}>
              Clear filters
            </button>
          </section>
        )}
      </div>

      {previewTemplate && (
        <PreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplateId(null)}
          onEdit={() => openEditor(previewTemplate)}
        />
      )}
    </div>
  );
}
