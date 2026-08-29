import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import {
  type EditableTemplate,
  type TemplateCategory,
  type TemplateLayer,
  type TemplateTextLayer,
} from "../templates/editableTemplateCatalog";
import {
  loadEditableTemplates,
  saveEditableTemplate,
} from "../templates/editableTemplateStorage";
import { TemplateCanvas } from "../templates/TemplateCanvas";
import { downloadMceTemplate } from "../templates/mceTemplatePackage";
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
          <span className="templates-card__format">16:9</span>
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
              <div><span>Canvas</span><strong>16:9 · 1600 × 900</strong></div>
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

function TemplateEditor({
  template,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onMoveLayer,
  onSave,
  saveMessage,
  onBack,
}: {
  template: EditableTemplate;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayer: (layerId: string, changes: Partial<TemplateLayer>) => void;
  onMoveLayer: (layerId: string, x: number, y: number) => void;
  onSave: () => void;
  saveMessage: string | null;
  onBack: () => void;
}) {
  const selectedLayer = selectedLayerId
    ? template.layers.find((layer) => layer.id === selectedLayerId) ?? null
    : null;
  const selectedTextLayer = selectedLayer?.kind === "text" ? selectedLayer : null;

  return (
    <div className="templates-editor-page">
      <header className="templates-editor-header">
        <div className="templates-editor-header__left">
          <button type="button" className="templates-icon-button" onClick={onBack} aria-label="Back to templates" title="Back to templates">
            <Icon name="arrow_back" size={18} />
          </button>
          <div>
            <p className="templates-preview-modal__eyebrow">Editing {formatCategory(template.category)} template</p>
            <h1>{template.name}</h1>
          </div>
        </div>
        <div className="templates-editor-header__actions">
          {saveMessage && <span className="templates-save-message" role="status"><Icon name="check_circle" size={15} />{saveMessage}</span>}
          <button type="button" className="templates-button templates-button--secondary" onClick={() => downloadMceTemplate(template)}>
            <Icon name="download" size={16} />
            Download .mce
          </button>
          <button type="button" className="templates-button templates-button--primary" onClick={onSave}>
            <Icon name="save" size={16} />
            Save changes
          </button>
        </div>
      </header>

      <div className="templates-editor-layout">
        <aside className="templates-inspector" aria-label="Template editor controls">
          <section className="templates-inspector__section">
            <p className="templates-section-label">Layers</p>
            <p className="templates-inspector__hint">Click any object on the canvas to select it. Drag it anywhere to reposition it.</p>
            <div className="templates-layer-list">
              {template.layers.map((layer, index) => (
                <button
                  key={layer.id}
                  type="button"
                  className={`templates-layer-row${selectedLayer?.id === layer.id ? " is-selected" : ""}`}
                  onClick={() => onSelectLayer(layer.id)}
                >
                  <span>{layer.kind === "text" ? "T" : "A"}</span>
                  <strong>
                    {layer.kind === "text"
                      ? layer.text.replace(/\n/g, " ").slice(0, 30) || "Empty text"
                      : `${layer.kind === "circle" ? "Circle" : "Shape"} artwork ${String(index + 1).padStart(2, "0")}`}
                  </strong>
                </button>
              ))}
            </div>
          </section>

          {selectedTextLayer && (
            <section className="templates-inspector__section templates-inspector__section--form">
              <p className="templates-section-label">Selected text</p>
              <label className="templates-field">
                <span>Content</span>
                <textarea
                  value={selectedTextLayer.text}
                  onChange={(event) => onUpdateLayer(selectedTextLayer.id, { text: event.target.value })}
                  rows={4}
                />
              </label>
              <div className="templates-field-grid">
                <label className="templates-field">
                  <span>Font size</span>
                  <div className="templates-range-field">
                    <input
                      type="range"
                      min={16}
                      max={140}
                      step={1}
                      value={selectedTextLayer.fontSize}
                      onChange={(event) => onUpdateLayer(selectedTextLayer.id, { fontSize: Number(event.target.value) })}
                    />
                    <output>{selectedTextLayer.fontSize}px</output>
                  </div>
                </label>
                <label className="templates-field">
                  <span>Text color</span>
                  <div className="templates-color-field">
                    <input
                      type="color"
                      value={selectedTextLayer.fill.startsWith("#") ? selectedTextLayer.fill : "#FFFFFF"}
                      onChange={(event) => onUpdateLayer(selectedTextLayer.id, { fill: event.target.value })}
                      aria-label="Text color"
                    />
                    <code>{selectedTextLayer.fill}</code>
                  </div>
                </label>
              </div>
              <div className="templates-field">
                <span className="templates-field__label">Alignment</span>
                <div className="templates-segmented" role="group" aria-label="Text alignment">
                  {(["left", "center", "right"] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      className={selectedTextLayer.align === align ? "is-selected" : ""}
                      onClick={() => onUpdateLayer(selectedTextLayer.id, { align })}
                    >
                      <Icon name={`format_align_${align}`} size={15} />
                      <span className="sr-only">{align}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {selectedLayer && !selectedTextLayer && (
            <section className="templates-inspector__section">
              <p className="templates-section-label">Artwork layer selected</p>
              <p className="templates-inspector__hint">This decorative layer is already part of the template. Drag it directly on the canvas to reposition it.</p>
            </section>
          )}

          <div className="templates-inspector__footer">
            <Icon name="info" size={15} />
            Double-click text to edit it directly. Changes are saved to this device.
          </div>
        </aside>

        <main className="templates-editor-workspace">
          <div className="templates-editor-toolbar">
            <span><Icon name="layers" size={15} /> Freeform canvas</span>
            <span className="templates-editor-toolbar__muted">Click to select · drag to move · double-click text to edit</span>
          </div>
          <div className="templates-editor-canvas-wrap">
            <TemplateCanvas
              template={template}
              editable
              selectedLayerId={selectedLayerId}
              onSelectLayer={onSelectLayer}
              onMoveLayer={onMoveLayer}
              onEditText={(layerId, text) => onUpdateLayer(layerId, { text })}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState<EditableTemplate[]>(() => loadEditableTemplates());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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
    if (!editingTemplate) {
      setSelectedLayerId(null);
      return;
    }
    const firstTextLayer = editingTemplate.layers.find((layer) => layer.kind === "text");
    if (selectedLayerId && !editingTemplate.layers.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(firstTextLayer?.id ?? null);
    }
  }, [editingTemplate, selectedLayerId]);

  useEffect(() => {
    if (!previewTemplate && previewTemplateId) setPreviewTemplateId(null);
  }, [previewTemplate, previewTemplateId]);

  useEffect(() => {
    if (!previewTemplate && !editingTemplate) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewTemplate) setPreviewTemplateId(null);
      else navigate("/templates");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingTemplate, navigate, previewTemplate]);

  const openEditor = useCallback((template: EditableTemplate) => {
    setPreviewTemplateId(null);
    setSaveMessage(null);
    setSelectedLayerId(template.layers.find((layer) => layer.kind === "text")?.id ?? null);
    navigate(`/templates?edit=${encodeURIComponent(template.id)}`);
  }, [navigate]);

  const updateLayer = useCallback((layerId: string, changes: Partial<TemplateLayer>) => {
    setTemplates((current) => current.map((template) => {
      if (template.id !== editingTemplateId) return template;
      return {
        ...template,
        layers: template.layers.map((layer) => (
          layer.id === layerId ? { ...layer, ...changes } as TemplateLayer : layer
        )),
      };
    }));
    setSaveMessage(null);
  }, [editingTemplateId]);

  const moveLayer = useCallback((layerId: string, x: number, y: number) => {
    updateLayer(layerId, {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
    });
  }, [updateLayer]);

  const saveCurrentTemplate = useCallback(() => {
    if (!editingTemplate) return;
    saveEditableTemplate(editingTemplate);
    setSaveMessage("Saved on this device");
    window.setTimeout(() => setSaveMessage(null), 2200);
  }, [editingTemplate]);

  if (editingTemplate) {
    return (
      <div className="app-page templates-page templates-page--editor">
        <div className="app-page__inner templates-page__inner">
          <TemplateEditor
            template={editingTemplate}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onUpdateLayer={updateLayer}
            onMoveLayer={moveLayer}
            onSave={saveCurrentTemplate}
            saveMessage={saveMessage}
            onBack={() => navigate("/templates")}
          />
        </div>
      </div>
    );
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
