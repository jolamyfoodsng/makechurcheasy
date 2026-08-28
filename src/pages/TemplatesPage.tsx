import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Layer, Rect, Circle, Stage, Text as KonvaText } from "react-konva";
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

function textLayerDisplayHeight(layer: TemplateTextLayer): number {
  const lineHeight = layer.lineHeight ?? 1.2;
  const charactersPerLine = Math.max(12, Math.floor(layer.width / Math.max(1, layer.fontSize * 0.56)));
  const estimatedLines = Math.max(
    1,
    layer.text.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0),
  );
  return Math.max(layer.height, Math.ceil(estimatedLines * layer.fontSize * lineHeight + 16));
}

function TemplateCanvas({
  template,
  editable = false,
  selectedLayerId = null,
  onSelectLayer,
  onMoveLayer,
  onEditText,
}: {
  template: EditableTemplate;
  editable?: boolean;
  selectedLayerId?: string | null;
  onSelectLayer?: (layerId: string | null) => void;
  onMoveLayer?: (layerId: string, x: number, y: number) => void;
  onEditText?: (layerId: string, text: string) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const inlineEditorRef = useRef<HTMLTextAreaElement>(null);
  const [scale, setScale] = useState(1);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineText, setInlineText] = useState("");

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const updateScale = () => {
      const availableWidth = shell.clientWidth;
      if (!availableWidth) return;
      setScale(Math.min(1, Math.max(0.1, availableWidth / template.canvas.width)));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [template.canvas.width]);

  const stageWidth = Math.max(1, Math.round(template.canvas.width * scale));
  const stageHeight = Math.max(1, Math.round(template.canvas.height * scale));
  const shellWidth = shellRef.current?.clientWidth ?? stageWidth;
  const shellHeight = shellRef.current?.clientHeight ?? stageHeight;
  const stageOffsetX = Math.max(0, (shellWidth - stageWidth) / 2);
  const stageOffsetY = Math.max(0, (shellHeight - stageHeight) / 2);

  useEffect(() => {
    if (!inlineEditId) return;
    inlineEditorRef.current?.focus();
    inlineEditorRef.current?.select();
  }, [inlineEditId]);

  const beginInlineEdit = (layer: TemplateTextLayer) => {
    if (!editable) return;
    onSelectLayer?.(layer.id);
    setInlineText(layer.text);
    setInlineEditId(layer.id);
  };

  const commitInlineEdit = () => {
    if (!inlineEditId) return;
    onEditText?.(inlineEditId, inlineText);
    setInlineEditId(null);
  };

  const inlineLayer = inlineEditId
    ? template.layers.find((layer): layer is TemplateTextLayer => layer.id === inlineEditId && layer.kind === "text")
    : null;

  return (
    <div
      ref={shellRef}
      className={`templates-canvas-shell${editable ? " templates-canvas-shell--editable" : ""}`}
      style={{ aspectRatio: `${template.canvas.width} / ${template.canvas.height}` }}
    >
      <Stage
        width={stageWidth}
        height={stageHeight}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) onSelectLayer?.(null);
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) onSelectLayer?.(null);
        }}
      >
        <Layer scaleX={scale} scaleY={scale}>
          <Rect
            x={0}
            y={0}
            width={template.canvas.width}
            height={template.canvas.height}
            fill={template.background.base}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: template.canvas.width, y: template.canvas.height }}
            fillLinearGradientColorStops={[0, template.background.gradientStart, 0.58, template.background.base, 1, template.background.gradientEnd]}
            listening={false}
          />

          {template.layers.map((layer) => {
            if (layer.kind === "rect") {
              return (
                <Rect
                  key={layer.id}
                  x={layer.x}
                  y={layer.y}
                  width={layer.width}
                  height={layer.height}
                  fill={layer.fill}
                  opacity={layer.opacity}
                  cornerRadius={layer.cornerRadius ?? 0}
                  draggable={editable}
                  onDragStart={() => onSelectLayer?.(layer.id)}
                  onClick={() => onSelectLayer?.(layer.id)}
                  onTap={() => onSelectLayer?.(layer.id)}
                  onDragEnd={(event) => {
                    onMoveLayer?.(layer.id, event.target.x(), event.target.y());
                  }}
                />
              );
            }

            if (layer.kind === "circle") {
              return (
                <Circle
                  key={layer.id}
                  x={layer.x + layer.width / 2}
                  y={layer.y + layer.height / 2}
                  radius={layer.width / 2}
                  fill={layer.fill}
                  opacity={layer.opacity}
                  draggable={editable}
                  onDragStart={() => onSelectLayer?.(layer.id)}
                  onClick={() => onSelectLayer?.(layer.id)}
                  onTap={() => onSelectLayer?.(layer.id)}
                  onDragEnd={(event) => {
                    onMoveLayer?.(layer.id, event.target.x() - layer.width / 2, event.target.y() - layer.height / 2);
                  }}
                />
              );
            }

            if (layer.kind !== "text") return null;

            return (
              <KonvaText
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                height={textLayerDisplayHeight(layer)}
                text={layer.text}
                fill={layer.fill}
                fontSize={layer.fontSize}
                fontFamily={layer.fontFamily}
                fontStyle={layer.fontStyle}
                fontWeight={layer.fontWeight}
                align={layer.align}
                lineHeight={layer.lineHeight}
                letterSpacing={layer.letterSpacing}
                wrap="word"
                padding={4}
                draggable={editable}
                onDragStart={() => onSelectLayer?.(layer.id)}
                onClick={() => onSelectLayer?.(layer.id)}
                onTap={() => onSelectLayer?.(layer.id)}
                onDblClick={() => beginInlineEdit(layer)}
                onDblTap={() => beginInlineEdit(layer)}
                onDragEnd={(event) => {
                  onMoveLayer?.(layer.id, event.target.x(), event.target.y());
                }}
              />
            );
          })}

          {editable && selectedLayerId && (() => {
            const selectedLayer = template.layers.find((layer) => layer.id === selectedLayerId);
            if (!selectedLayer) return null;
            return (
              <Rect
                x={selectedLayer.x - 4}
                y={selectedLayer.y - 4}
                width={selectedLayer.width + 8}
                height={(selectedLayer.kind === "text" ? textLayerDisplayHeight(selectedLayer) : selectedLayer.height) + 8}
                stroke={template.background.accent}
                strokeWidth={4}
                dash={[12, 8]}
                cornerRadius={selectedLayer.kind === "rect" ? selectedLayer.cornerRadius ?? 0 : 8}
                listening={false}
              />
            );
          })()}
        </Layer>
      </Stage>

      {editable && inlineLayer && (
        <textarea
          ref={inlineEditorRef}
          className="templates-inline-editor"
          value={inlineText}
          onChange={(event) => {
            setInlineText(event.target.value);
            onEditText?.(inlineLayer.id, event.target.value);
          }}
          onBlur={commitInlineEdit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              setInlineEditId(null);
            } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              commitInlineEdit();
            }
          }}
          style={{
            left: stageOffsetX + inlineLayer.x * scale,
            top: stageOffsetY + inlineLayer.y * scale,
            width: inlineLayer.width * scale,
            height: textLayerDisplayHeight(inlineLayer) * scale,
            color: inlineLayer.fill,
            fontFamily: inlineLayer.fontFamily,
            fontSize: inlineLayer.fontSize * scale,
            fontStyle: inlineLayer.fontStyle,
            fontWeight: inlineLayer.fontWeight,
            lineHeight: inlineLayer.lineHeight,
            textAlign: inlineLayer.align,
            letterSpacing: inlineLayer.letterSpacing ? `${inlineLayer.letterSpacing * scale}px` : undefined,
          } as CSSProperties}
          aria-label={`Edit ${inlineLayer.text || "text layer"}`}
        />
      )}
    </div>
  );
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

export { TemplateCanvas };
