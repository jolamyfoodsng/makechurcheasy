import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fabric } from "fabric";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Circle,
  Copy,
  Download,
  ImagePlus,
  Italic,
  Layers3,
  Minus,
  MousePointer2,
  Palette,
  Plus,
  Redo2,
  Save,
  SendToBack,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { nanoid } from "nanoid";
import { GOOGLE_FONT_CATALOG } from "../templates/googleFontCatalog";
import { ensureGoogleFontLoaded, ensureGoogleFontsLoaded } from "../templates/googleFonts";
import { loadEditableTemplates, saveDesignStudioDockImage, saveEditableTemplate } from "../templates/editableTemplateStorage";
import type { EditableTemplate } from "../templates/editableTemplateCatalog";
import { loadDesignStudioDocument, saveDesignStudioDocument } from "../design-studio/designStudioStorage";
import {
  canvasSnapshot,
  createStudioWorkspace,
  editableTemplateFromFabricCanvas,
  isStudioWorkspace as isWorkspace,
  loadTemplateIntoFabricCanvas,
} from "../design-studio/fabricTemplateBridge";
import "./DesignStudioPage.css";

const STUDIO_WIDTH = 1600;
const STUDIO_HEIGHT = 900;
const HISTORY_LIMIT = 80;
const STUDIO_ACCENT = "#1D4ED8";

function isTextObject(object: fabric.Object | null): object is fabric.Textbox | fabric.IText {
  return Boolean(object && (object.type === "textbox" || object.type === "i-text"));
}

function configureObjectControls(object: fabric.Object): void {
  object.set({
    cornerColor: "#FFFFFF",
    cornerStrokeColor: STUDIO_ACCENT,
    cornerStyle: "circle",
    cornerSize: 13,
    transparentCorners: false,
    borderColor: STUDIO_ACCENT,
    borderScaleFactor: 1.5,
    borderOpacityWhenMoving: 1,
    padding: 7,
  });
}

function clampFontSize(value: number): number {
  return Math.max(12, Math.min(420, Math.round(value)));
}

function fileName(value: string): string {
  return (value.trim() || "Untitled design")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "untitled-design";
}

export default function DesignStudioPage() {
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get("template")?.trim() || null;
  return <DesignStudioEditor key={templateId ?? "blank"} templateId={templateId} />;
}

function DesignStudioEditor({ templateId }: { templateId: string | null }) {
  const navigate = useNavigate();
  const sourceTemplate = useMemo<EditableTemplate | null>(() => {
    if (!templateId) return null;
    return loadEditableTemplates().find((template) => template.id === templateId) ?? null;
  }, [templateId]);
  const savedDocumentRef = useRef(sourceTemplate ? null : loadDesignStudioDocument());
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const workspaceRef = useRef<fabric.Rect | null>(null);
  const sourceTemplateRef = useRef<EditableTemplate | null>(sourceTemplate);
  const canvasSizeRef = useRef(sourceTemplate?.canvas ?? { width: STUDIO_WIDTH, height: STUDIO_HEIGHT });
  const documentIdRef = useRef(savedDocumentRef.current?.id || sourceTemplate?.id || `design-studio-${nanoid(10)}`);
  const documentNameRef = useRef(savedDocumentRef.current?.name || sourceTemplate?.name || "Untitled design");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(0);
  const suppressHistoryRef = useRef(true);
  const fitCanvasRef = useRef<() => void>(() => undefined);
  const [designName, setDesignName] = useState(documentNameRef.current);
  const [activeObject, setActiveObject] = useState<fabric.Object | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [, refreshToolbar] = useState(0);

  const selectedText = isTextObject(activeObject) ? activeObject : null;
  const selectedFontSize = clampFontSize(Number(selectedText?.fontSize ?? 48));
  const selectedFontFamily = selectedText?.fontFamily || "Inter";
  const selectedFill = typeof selectedText?.fill === "string" && selectedText.fill.startsWith("#")
    ? selectedText.fill
    : "#0F172A";

  const updateHistoryControls = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const persistCurrentDesign = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !workspaceRef.current || sourceTemplateRef.current) return;
    saveDesignStudioDocument({
      id: documentIdRef.current,
      name: documentNameRef.current.trim() || "Untitled design",
      json: canvasSnapshot(canvas),
      width: canvasSizeRef.current.width,
      height: canvasSizeRef.current.height,
    });
  }, []);

  const resetHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current = [canvasSnapshot(canvas)];
    historyIndexRef.current = 0;
    updateHistoryControls();
    persistCurrentDesign();
  }, [persistCurrentDesign, updateHistoryControls]);

  const recordHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || suppressHistoryRef.current) return;
    const snapshot = canvasSnapshot(canvas);
    if (historyRef.current[historyIndexRef.current] === snapshot) return;

    const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), snapshot].slice(-HISTORY_LIMIT);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    updateHistoryControls();
    persistCurrentDesign();
  }, [persistCurrentDesign, updateHistoryControls]);

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    const workspace = workspaceRef.current;
    if (!canvas || !container || !workspace) return;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const padding = Math.min(88, Math.max(32, Math.min(width, height) * 0.075));
    const canvasWidth = canvasSizeRef.current.width;
    const canvasHeight = canvasSizeRef.current.height;
    const zoom = Math.min((width - padding * 2) / canvasWidth, (height - padding * 2) / canvasHeight);
    const safeZoom = Math.max(0.08, zoom);
    canvas.setDimensions({ width, height });
    canvas.setViewportTransform([
      safeZoom,
      0,
      0,
      safeZoom,
      (width - canvasWidth * safeZoom) / 2 - (workspace.left ?? 0) * safeZoom,
      (height - canvasHeight * safeZoom) / 2 - (workspace.top ?? 0) * safeZoom,
    ]);
    canvas.requestRenderAll();
  }, []);

  fitCanvasRef.current = fitCanvas;

  useEffect(() => {
    sourceTemplateRef.current = sourceTemplate;
    canvasSizeRef.current = sourceTemplate?.canvas ?? { width: STUDIO_WIDTH, height: STUDIO_HEIGHT };
  }, [sourceTemplate]);

  useEffect(() => {
    documentNameRef.current = designName;
  }, [designName]);

  useEffect(() => {
    const element = canvasElementRef.current;
    const container = canvasContainerRef.current;
    if (!element || !container) return;
    let isDisposed = false;

    const canvas = new fabric.Canvas(element, {
      controlsAboveOverlay: true,
      preserveObjectStacking: true,
      selection: true,
      selectionColor: "rgba(29, 78, 216, 0.08)",
      selectionBorderColor: STUDIO_ACCENT,
    });
    canvasRef.current = canvas;

    const syncSelection = () => {
      setActiveObject(canvas.getActiveObject() ?? null);
      refreshToolbar((revision) => revision + 1);
    };
    const syncMutation = () => {
      recordHistory();
      syncSelection();
    };
    const handleWheel = (event: fabric.IEvent<Event>) => {
      const wheelEvent = event.e as WheelEvent;
      const delta = wheelEvent.deltaY;
      let zoom = canvas.getZoom() * (0.999 ** delta);
      zoom = Math.max(0.12, Math.min(2.4, zoom));
      canvas.zoomToPoint(new fabric.Point(wheelEvent.offsetX, wheelEvent.offsetY), zoom);
      wheelEvent.preventDefault();
      wheelEvent.stopPropagation();
    };

    canvas.on("selection:created", syncSelection);
    canvas.on("selection:updated", syncSelection);
    canvas.on("selection:cleared", syncSelection);
    canvas.on("object:added", syncMutation);
    canvas.on("object:modified", syncMutation);
    canvas.on("object:removed", syncMutation);
    canvas.on("text:changed", syncMutation);
    canvas.on("mouse:wheel", handleWheel);

    const setupWorkspace = (providedWorkspace?: fabric.Rect) => {
      let workspace = canvas.getObjects().find((object) => isWorkspace(object)) as fabric.Rect | undefined;
      workspace ??= providedWorkspace;
      if (!workspace) {
        workspace = createStudioWorkspace(canvasSizeRef.current.width, canvasSizeRef.current.height);
        canvas.add(workspace);
      }
      workspace.set({ selectable: false, evented: false, hasControls: false, hasBorders: false });
      canvas.sendToBack(workspace);
      canvas.getObjects().filter((object) => !isWorkspace(object)).forEach(configureObjectControls);
      workspaceRef.current = workspace;
      canvas.clipPath = workspace;
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      suppressHistoryRef.current = false;
      resetHistory();
      fitCanvasRef.current();
      setIsReady(true);
    };

    const initializeCanvas = async () => {
      const template = sourceTemplateRef.current;
      const savedDocument = savedDocumentRef.current;
      if (template) {
        await ensureGoogleFontsLoaded(
          template.layers.flatMap((layer) => layer.kind === "text" ? [layer.fontFamily] : []),
        );
        if (isDisposed) return;
        const workspace = await loadTemplateIntoFabricCanvas(canvas, template, configureObjectControls, () => isDisposed);
        if (isDisposed) return;
        setupWorkspace(workspace);
        return;
      }
      if (savedDocument?.json) {
        canvas.loadFromJSON(savedDocument.json, () => {
          if (!isDisposed) setupWorkspace();
        });
        return;
      }
      setupWorkspace();
    };
    void initializeCanvas();

    const resizeObserver = new ResizeObserver(() => fitCanvasRef.current());
    resizeObserver.observe(container);

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      canvas.off("selection:created", syncSelection);
      canvas.off("selection:updated", syncSelection);
      canvas.off("selection:cleared", syncSelection);
      canvas.off("object:added", syncMutation);
      canvas.off("object:modified", syncMutation);
      canvas.off("object:removed", syncMutation);
      canvas.off("text:changed", syncMutation);
      canvas.off("mouse:wheel", handleWheel);
      canvas.dispose();
      canvasRef.current = null;
      workspaceRef.current = null;
    };
  }, [recordHistory, resetHistory]);

  const addText = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const text = new fabric.Textbox("Edit this text", {
      left: 480,
      top: 360,
      width: 620,
      fontSize: 72,
      fontFamily: "Inter",
      fontWeight: "700",
      fill: "#0F172A",
      lineHeight: 1.05,
      editable: true,
      splitByGrapheme: false,
    });
    configureObjectControls(text);
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
  }, []);

  const addRectangle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shape = new fabric.Rect({ left: 610, top: 300, width: 380, height: 220, rx: 24, ry: 24, fill: "#1D4ED8" });
    configureObjectControls(shape);
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
  }, []);

  const addCircle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shape = new fabric.Circle({ left: 650, top: 300, radius: 130, fill: "#7C3AED" });
    configureObjectControls(shape);
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
  }, []);

  const uploadImage = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const canvas = canvasRef.current;
    if (!file || !canvas) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      fabric.Image.fromURL(reader.result, (image) => {
        const maxWidth = 680;
        const maxHeight = 580;
        const sourceWidth = image.width || maxWidth;
        const sourceHeight = image.height || maxHeight;
        image.scale(Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1));
        image.set({ left: 800 - image.getScaledWidth() / 2, top: 450 - image.getScaledHeight() / 2 });
        configureObjectControls(image);
        canvas.add(image);
        canvas.setActiveObject(image);
        canvas.requestRenderAll();
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const updateSelectedText = useCallback((changes: Record<string, unknown>) => {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject() ?? null;
    if (!canvas || !isTextObject(object)) return;
    object.set(changes);
    object.setCoords();
    canvas.requestRenderAll();
    recordHistory();
    refreshToolbar((revision) => revision + 1);
  }, [recordHistory]);

  const changeFont = useCallback((fontFamily: string) => {
    void ensureGoogleFontLoaded(fontFamily).finally(() => {
      updateSelectedText({ fontFamily });
    });
  }, [updateSelectedText]);

  const deleteSelected = useCallback(() => {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || isWorkspace(object)) return;
    canvas.remove(object);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, []);

  const duplicateSelected = useCallback(() => {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || isWorkspace(object)) return;
    object.clone((clone: fabric.Object) => {
      clone.set({ left: (object.left ?? 0) + 28, top: (object.top ?? 0) + 28 });
      configureObjectControls(clone);
      canvas.add(clone);
      canvas.setActiveObject(clone);
      canvas.requestRenderAll();
    });
  }, []);

  const moveSelected = useCallback((direction: "forward" | "back") => {
    const canvas = canvasRef.current;
    const object = canvas?.getActiveObject();
    if (!canvas || !object || isWorkspace(object)) return;
    if (direction === "forward") canvas.bringForward(object);
    else canvas.sendBackwards(object);
    const workspace = workspaceRef.current;
    if (workspace) canvas.sendToBack(workspace);
    canvas.requestRenderAll();
    recordHistory();
  }, [recordHistory]);

  const restoreHistory = useCallback((index: number) => {
    const canvas = canvasRef.current;
    const snapshot = historyRef.current[index];
    if (!canvas || !snapshot) return;
    suppressHistoryRef.current = true;
    canvas.loadFromJSON(snapshot, () => {
      const workspace = canvas.getObjects().find((object) => isWorkspace(object)) as fabric.Rect | undefined;
      if (workspace) {
        workspaceRef.current = workspace;
        canvas.clipPath = workspace;
        canvas.sendToBack(workspace);
      }
      canvas.getObjects().filter((object) => !isWorkspace(object)).forEach(configureObjectControls);
      historyIndexRef.current = index;
      suppressHistoryRef.current = false;
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      setActiveObject(null);
      updateHistoryControls();
      persistCurrentDesign();
      fitCanvasRef.current();
    });
  }, [persistCurrentDesign, updateHistoryControls]);

  const undo = useCallback(() => restoreHistory(historyIndexRef.current - 1), [restoreHistory]);
  const redo = useCallback(() => restoreHistory(historyIndexRef.current + 1), [restoreHistory]);

  const exportPng = useCallback((): string | null => {
    const canvas = canvasRef.current;
    const workspace = workspaceRef.current;
    if (!canvas || !workspace) return null;
    const viewport = canvas.viewportTransform ? [...canvas.viewportTransform] : fabric.iMatrix.concat();
    const active = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.setViewportTransform(fabric.iMatrix.concat());
    canvas.requestRenderAll();
    const png = canvas.toDataURL({
      format: "png",
      quality: 1,
      left: workspace.left ?? 0,
      top: workspace.top ?? 0,
      width: canvasSizeRef.current.width,
      height: canvasSizeRef.current.height,
      multiplier: 1,
    });
    canvas.setViewportTransform(viewport);
    if (active) canvas.setActiveObject(active);
    canvas.requestRenderAll();
    return png;
  }, []);

  const downloadPng = useCallback(() => {
    const png = exportPng();
    if (!png) return;
    const link = document.createElement("a");
    link.href = png;
    link.download = `${fileName(documentNameRef.current)}.png`;
    link.click();
  }, [exportPng]);

  const saveToDock = useCallback(async () => {
    const png = exportPng();
    const canvas = canvasRef.current;
    if (!png || !canvas || isSaving) return;
    setIsSaving(true);
    setNotice(null);
    try {
      const template = sourceTemplateRef.current;
      const result = template
        ? await saveEditableTemplate(editableTemplateFromFabricCanvas(canvas, template), png)
        : await (async () => {
          persistCurrentDesign();
          return saveDesignStudioDockImage({
            id: documentIdRef.current,
            name: documentNameRef.current.trim() || "Untitled design",
            category: "Announcements",
            accentColor: STUDIO_ACCENT,
            imageUrl: png,
            width: canvasSizeRef.current.width,
            height: canvasSizeRef.current.height,
          });
        })();
      setNotice(result.dockSynced ? "Saved to Dock Templates" : "Saved locally — Dock image unavailable");
    } finally {
      setIsSaving(false);
    }
  }, [exportPng, isSaving, persistCurrentDesign]);

  const startNewDesign = useCallback(() => {
    if (sourceTemplateRef.current) {
      navigate("/design-studio");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    suppressHistoryRef.current = true;
    canvas.getObjects().filter((object) => !isWorkspace(object)).forEach((object) => canvas.remove(object));
    documentIdRef.current = `design-studio-${nanoid(10)}`;
    documentNameRef.current = "Untitled design";
    setDesignName("Untitled design");
    setNotice(null);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    suppressHistoryRef.current = false;
    resetHistory();
  }, [navigate, resetHistory]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable='true']")) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      } else if (key === "d") {
        event.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duplicateSelected, redo, undo]);

  const fontOptions = useMemo(() => GOOGLE_FONT_CATALOG.map((font) => font.family), []);

  return (
    <div className="app-page design-studio-page">
      <div className="app-page__inner design-studio-page__inner">
        <header className="design-studio-header">
          {sourceTemplate && (
            <button
              type="button"
              className="design-studio-icon-button"
              onClick={() => navigate("/templates")}
              aria-label="Back to templates"
              title="Back to templates"
            >
              <ArrowLeft size={17} />
            </button>
          )}
          <div className="design-studio-header__identity">
            <div className="design-studio-header__mark"><Layers3 size={18} /></div>
            <div>
              <p>{sourceTemplate ? `${sourceTemplate.category.toUpperCase()} TEMPLATE` : "MAKECHURCHEASY"}</p>
              <h1>Design Studio</h1>
            </div>
          </div>
          <input
            className={`design-studio-title-input${sourceTemplate ? " is-readonly" : ""}`}
            value={designName}
            onChange={(event) => setDesignName(event.target.value)}
            onBlur={persistCurrentDesign}
            readOnly={Boolean(sourceTemplate)}
            aria-label={sourceTemplate ? "Template name" : "Design name"}
          />
          <div className="design-studio-header__actions">
            {notice && <span className="design-studio-save-notice" role="status">{notice}</span>}
            <button type="button" className="design-studio-icon-button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl or Command + Z)"><Undo2 size={17} /></button>
            <button type="button" className="design-studio-icon-button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl or Command + Shift + Z)"><Redo2 size={17} /></button>
            <button type="button" className="design-studio-button design-studio-button--secondary" onClick={downloadPng} disabled={!isReady}><Download size={16} />Download PNG</button>
            <button type="button" className="design-studio-button design-studio-button--primary" onClick={() => void saveToDock()} disabled={!isReady || isSaving}><Save size={16} />{isSaving ? "Saving…" : sourceTemplate ? "Save template" : "Save to Dock"}</button>
          </div>
        </header>

        <div className="design-studio-layout">
          <aside className="design-studio-rail" aria-label="Design tools">
            <button type="button" onClick={addText} title="Add text" aria-label="Add text"><Type size={20} /><span>Text</span></button>
            <button type="button" onClick={() => fileInputRef.current?.click()} title="Upload image" aria-label="Upload image"><ImagePlus size={20} /><span>Image</span></button>
            <button type="button" onClick={addRectangle} title="Add rectangle" aria-label="Add rectangle"><Square size={20} /><span>Shape</span></button>
            <button type="button" onClick={addCircle} title="Add circle" aria-label="Add circle"><Circle size={20} /><span>Circle</span></button>
            <button type="button" onClick={startNewDesign} title="New blank design" aria-label="New blank design"><Plus size={20} /><span>New</span></button>
          </aside>

          <main className="design-studio-workspace">
            <div className="design-studio-toolbar" aria-label="Selected object options">
              {selectedText ? (
                <>
                  <label className="design-studio-font-field">
                    <span className="sr-only">Font family</span>
                    <input list="design-studio-fonts" value={selectedFontFamily} onChange={(event) => changeFont(event.target.value)} aria-label="Font family" />
                    <datalist id="design-studio-fonts">{fontOptions.map((font) => <option value={font} key={font} />)}</datalist>
                  </label>
                  <div className="design-studio-size-field" aria-label="Font size">
                    <button type="button" onClick={() => updateSelectedText({ fontSize: clampFontSize(selectedFontSize - 1) })} aria-label="Decrease font size"><Minus size={15} /></button>
                    <input type="number" min={12} max={420} value={selectedFontSize} onChange={(event) => updateSelectedText({ fontSize: clampFontSize(Number(event.target.value) || 12) })} aria-label="Font size" />
                    <button type="button" onClick={() => updateSelectedText({ fontSize: clampFontSize(selectedFontSize + 1) })} aria-label="Increase font size"><Plus size={15} /></button>
                  </div>
                  <label className="design-studio-color-field" title="Text color">
                    <Palette size={18} />
                    <input type="color" value={selectedFill} onChange={(event) => updateSelectedText({ fill: event.target.value })} aria-label="Text color" />
                  </label>
                  <span className="design-studio-toolbar__divider" />
                  <button type="button" className={selectedText.fontWeight === "700" || Number(selectedText.fontWeight) >= 600 ? "is-active" : ""} onClick={() => updateSelectedText({ fontWeight: selectedText.fontWeight === "700" || Number(selectedText.fontWeight) >= 600 ? "400" : "700" })} aria-label="Bold"><Bold size={17} /></button>
                  <button type="button" className={selectedText.fontStyle === "italic" ? "is-active" : ""} onClick={() => updateSelectedText({ fontStyle: selectedText.fontStyle === "italic" ? "normal" : "italic" })} aria-label="Italic"><Italic size={17} /></button>
                  <span className="design-studio-toolbar__divider" />
                  <button type="button" className={selectedText.textAlign === "left" ? "is-active" : ""} onClick={() => updateSelectedText({ textAlign: "left" })} aria-label="Align left"><AlignLeft size={17} /></button>
                  <button type="button" className={selectedText.textAlign === "center" ? "is-active" : ""} onClick={() => updateSelectedText({ textAlign: "center" })} aria-label="Align center"><AlignCenter size={17} /></button>
                  <button type="button" className={selectedText.textAlign === "right" ? "is-active" : ""} onClick={() => updateSelectedText({ textAlign: "right" })} aria-label="Align right"><AlignRight size={17} /></button>
                </>
              ) : activeObject ? (
                <span className="design-studio-toolbar__hint">Drag to move · use the white handles to resize · double-click text to edit</span>
              ) : (
                <span className="design-studio-toolbar__hint"><MousePointer2 size={16} />Choose an object to edit it. Side handles change text width; corner handles scale it.</span>
              )}
              {activeObject && !isWorkspace(activeObject) && (
                <div className="design-studio-toolbar__object-actions">
                  <button type="button" onClick={duplicateSelected} aria-label="Duplicate selected object" title="Duplicate"><Copy size={16} /></button>
                  <button type="button" onClick={() => moveSelected("forward")} aria-label="Bring forward" title="Bring forward"><Layers3 size={16} /></button>
                  <button type="button" onClick={() => moveSelected("back")} aria-label="Send backward" title="Send backward"><SendToBack size={16} /></button>
                  <button type="button" className="is-danger" onClick={deleteSelected} aria-label="Delete selected object" title="Delete"><Trash2 size={16} /></button>
                </div>
              )}
            </div>
            <div className="design-studio-canvas-stage" ref={canvasContainerRef}>
              <canvas ref={canvasElementRef} aria-label="Editable design canvas" />
            </div>
          </main>
        </div>
        <input ref={fileInputRef} className="design-studio-file-input" type="file" accept="image/*" onChange={uploadImage} />
      </div>
    </div>
  );
}
