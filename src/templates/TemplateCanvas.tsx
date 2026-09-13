import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { Layer, Rect, Circle, Image as KonvaImage, Stage, Text as KonvaText } from "react-konva";
import type Konva from "konva";
import type { EditableTemplate, TemplateImageLayer, TemplateTextLayer } from "./editableTemplateCatalog";
import { ensureGoogleFontsLoaded } from "./googleFonts";
import { cropTemplateImage, removeTemplateImageBackground } from "./templateImageEditing";
import "./TemplateCanvas.css";

/** Synthetic selection id used when an operator clicks the full-canvas background image. */
export const TEMPLATE_BACKGROUND_SELECTION_ID = "__template-background-image__";
const preparedLibraryImages = new Map<string, Promise<string>>();

/** An export of the real Konva canvas, used for the pixel-perfect Dock PNG. */
export interface TemplateCanvasHandle {
  capturePng: () => Promise<string>;
}

interface TemplateCanvasProps {
  template: EditableTemplate;
  editable?: boolean;
  selectedLayerId?: string | null;
  onSelectLayer?: (layerId: string | null) => void;
  onMoveLayer?: (layerId: string, x: number, y: number) => void;
  onEditText?: (layerId: string, changes: Partial<TemplateTextLayer>) => void;
  onPreparedImage?: (layerId: string, src: string) => void;
  onImageProcessingChange?: (layerId: string, processing: boolean) => void;
}

function textLayerDisplayHeight(layer: TemplateTextLayer): number {
  const lineHeight = layer.lineHeight ?? 1.2;
  if (layer.wrap === "none") {
    return Math.max(layer.height, Math.ceil(Math.max(1, layer.text.split("\n").length) * layer.fontSize * lineHeight + 16));
  }
  const charactersPerLine = Math.max(12, Math.floor(layer.width / Math.max(1, layer.fontSize * 0.56)));
  const estimatedLines = Math.max(
    1,
    layer.text.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0),
  );
  return Math.max(layer.height, Math.ceil(estimatedLines * layer.fontSize * lineHeight + 16));
}

function textLayerScaleX(layer: TemplateTextLayer): number {
  // Text entered by an operator should never be squeezed to fit a fixed box.
  // Only the few source layers marked as deliberately condensed retain an
  // independent horizontal scale.
  return layer.preserveScaleX && layer.scaleX && layer.scaleX > 0 ? layer.scaleX : 1;
}

function textLayerScaleY(layer: TemplateTextLayer): number {
  return layer.scaleY && layer.scaleY > 0 ? layer.scaleY : 1;
}

function measureUnwrappedTextWidth(layer: TemplateTextLayer): number {
  const longestLine = layer.text.split("\n").reduce((longest, line) => (
    line.length > longest.length ? line : longest
  ), "");
  if (!longestLine) return Math.max(32, layer.fontSize * 0.35);

  if (typeof document === "undefined") {
    return Math.ceil(longestLine.length * layer.fontSize * 0.56);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return Math.ceil(longestLine.length * layer.fontSize * 0.56);

  context.font = `${layer.fontStyle ?? "normal"} ${layer.fontWeight ?? 400} ${layer.fontSize}px ${layer.fontFamily}`;
  const letterSpacing = layer.letterSpacing ?? 0;
  return Math.ceil(context.measureText(longestLine).width + Math.max(0, longestLine.length - 1) * letterSpacing + 8);
}

interface TextLayerLayout {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

export function getTextLayerLayout(layer: TemplateTextLayer): TextLayerLayout {
  const height = textLayerDisplayHeight(layer);
  const scaleX = textLayerScaleX(layer);
  const scaleY = textLayerScaleY(layer);
  if (layer.wrap !== "none") {
    return { width: layer.width, height, scaleX, scaleY };
  }

  // A fixed text box is the source of missing characters and bent lettering.
  // Single-line text grows with its words and keeps its natural proportions,
  // even when it runs wider than its original source frame.
  const width = Math.max(32, measureUnwrappedTextWidth(layer));
  return {
    width,
    height,
    scaleX,
    scaleY,
  };
}

function textEditChanges(layer: TemplateTextLayer, text: string): Partial<TemplateTextLayer> {
  const nextLayer = { ...layer, text };
  if (nextLayer.wrap !== "none") return { text };
  const layout = getTextLayerLayout(nextLayer);
  return {
    text,
    width: layout.width,
    height: layout.height,
    scaleX: layout.scaleX,
  };
}

interface TemplateImageLoadOptions {
  enabled?: boolean;
  removeBackground?: boolean;
  crop?: TemplateImageLayer["crop"];
  onPrepared?: (src: string) => void;
  onProcessingChange?: (processing: boolean) => void;
}

function prepareLibraryImage(source: string, crop?: TemplateImageLayer["crop"]): Promise<string> {
  const key = `${source}|${crop ? `${crop.x}:${crop.y}:${crop.width}:${crop.height}` : "full"}`;
  const existing = preparedLibraryImages.get(key);
  if (existing) return existing;

  const task = removeTemplateImageBackground(source)
    .then((transparentImage) => crop ? cropTemplateImage(transparentImage, crop) : transparentImage)
    .catch((error) => {
      preparedLibraryImages.delete(key);
      throw error;
    });
  preparedLibraryImages.set(key, task);
  return task;
}

function useTemplateImage(source?: string, {
  enabled = true,
  removeBackground = false,
  crop,
  onPrepared,
  onProcessingChange,
}: TemplateImageLoadOptions = {}): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const preparedRef = useRef(onPrepared);
  const processingRef = useRef(onProcessingChange);

  useEffect(() => {
    preparedRef.current = onPrepared;
    processingRef.current = onProcessingChange;
  });

  useEffect(() => {
    if (!source || !enabled) {
      setImage(null);
      return;
    }

    let active = true;
    const load = async () => {
      let imageSource = source;
      if (removeBackground) {
        processingRef.current?.(true);
        try {
          imageSource = await prepareLibraryImage(source, crop);
          if (!active) return;
          preparedRef.current?.(imageSource);
        } catch {
          // Keep the source selectable if the device cannot prepare it now.
          imageSource = source;
        } finally {
          if (active) processingRef.current?.(false);
        }
      }

      if (!active) return;
      const nextImage = new Image();
      nextImage.onload = () => {
        if (active) setImage(nextImage);
      };
      nextImage.onerror = () => {
        if (active) setImage(null);
      };
      nextImage.src = imageSource;
    };

    void load();

    return () => {
      active = false;
    };
  }, [crop, enabled, removeBackground, source]);

  return image;
}

function imageLayerScaleX(layer: TemplateImageLayer): number {
  return layer.scaleX && layer.scaleX > 0 ? layer.scaleX : 1;
}

function imageLayerScaleY(layer: TemplateImageLayer): number {
  return layer.scaleY && layer.scaleY > 0 ? layer.scaleY : 1;
}

function TemplateImageNode({
  layer,
  editable,
  onSelectLayer,
  onMoveLayer,
  onPreparedImage,
  onImageProcessingChange,
}: {
  layer: TemplateImageLayer;
  editable: boolean;
  onSelectLayer?: (layerId: string | null) => void;
  onMoveLayer?: (layerId: string, x: number, y: number) => void;
  onPreparedImage?: (layerId: string, src: string) => void;
  onImageProcessingChange?: (layerId: string, processing: boolean) => void;
}) {
  const isLibraryImagePreparing = editable && Boolean(layer.removeBackgroundOnLoad);
  const image = useTemplateImage(layer.src, {
    enabled: editable || !layer.removeBackgroundOnLoad,
    removeBackground: isLibraryImagePreparing,
    crop: isLibraryImagePreparing ? layer.crop : undefined,
    onPrepared: (src) => onPreparedImage?.(layer.id, src),
    onProcessingChange: (processing) => onImageProcessingChange?.(layer.id, processing),
  });

  // The read-only card uses the completed poster image beneath the layers.
  // Do not show the temporary source (which is only used to make the speaker
  // transparent in the editor) on top of that card.
  if (!editable && layer.removeBackgroundOnLoad) return null;
  if (!image) return null;

  return (
    <KonvaImage
      image={image}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      opacity={layer.opacity ?? 1}
      scaleX={imageLayerScaleX(layer)}
      scaleY={imageLayerScaleY(layer)}
      crop={isLibraryImagePreparing ? undefined : layer.crop}
      draggable={editable}
      onDragStart={() => onSelectLayer?.(layer.id)}
      onClick={() => onSelectLayer?.(layer.id)}
      onTap={() => onSelectLayer?.(layer.id)}
      onDragEnd={(event) => onMoveLayer?.(layer.id, event.target.x(), event.target.y())}
    />
  );
}

export const TemplateCanvas = forwardRef<TemplateCanvasHandle, TemplateCanvasProps>(function TemplateCanvas({
  template,
  editable = false,
  selectedLayerId = null,
  onSelectLayer,
  onMoveLayer,
  onEditText,
  onPreparedImage,
  onImageProcessingChange,
}, ref) {
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const inlineEditorRef = useRef<HTMLTextAreaElement>(null);
  const [scale, setScale] = useState(1);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineText, setInlineText] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [, refreshTextLayout] = useState(0);
  const backgroundImageUrl = editable
    ? template.background.imageUrl
    : template.background.previewImageUrl ?? template.background.imageUrl;
  const backgroundImage = useTemplateImage(backgroundImageUrl);
  const showReferencePreview = !editable && Boolean(template.background.previewImageUrl);
  const textFontFamilies = template.layers
    .filter((layer): layer is TemplateTextLayer => layer.kind === "text")
    .map((layer) => layer.fontFamily);
  const textFontFamiliesKey = textFontFamilies.join("|");

  useEffect(() => {
    let active = true;
    void ensureGoogleFontsLoaded(textFontFamilies).finally(() => {
      if (active) refreshTextLayout((revision) => revision + 1);
    });
    return () => {
      active = false;
    };
  }, [textFontFamiliesKey]);

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

  useImperativeHandle(ref, () => ({
    capturePng: async () => {
      const stage = stageRef.current;
      if (!stage) throw new Error("The template canvas is still loading.");

      // Selection borders are editor-only UI. Hide them for one paint before
      // capturing the exact Konva canvas the operator is looking at.
      setIsCapturing(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      try {
        const activeStage = stageRef.current;
        if (!activeStage) throw new Error("The template canvas is no longer available.");
        return activeStage.toDataURL({
          mimeType: "image/png",
          pixelRatio: template.canvas.width / Math.max(1, activeStage.width()),
        });
      } finally {
        setIsCapturing(false);
      }
    },
  }), [template.canvas.width]);

  const beginInlineEdit = (layer: TemplateTextLayer) => {
    if (!editable) return;
    onSelectLayer?.(layer.id);
    setInlineText(layer.text);
    setInlineEditId(layer.id);
  };

  const commitInlineEdit = () => {
    if (!inlineEditId) return;
    const layer = template.layers.find((candidate): candidate is TemplateTextLayer => (
      candidate.id === inlineEditId && candidate.kind === "text"
    ));
    if (layer) onEditText?.(inlineEditId, textEditChanges(layer, inlineText));
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
        ref={stageRef}
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
          {backgroundImage && (
            <KonvaImage
              image={backgroundImage}
              x={0}
              y={0}
              width={template.canvas.width}
              height={template.canvas.height}
              opacity={template.background.imageOpacity ?? 1}
              listening={editable}
              onClick={() => onSelectLayer?.(TEMPLATE_BACKGROUND_SELECTION_ID)}
              onTap={() => onSelectLayer?.(TEMPLATE_BACKGROUND_SELECTION_ID)}
            />
          )}

          {!showReferencePreview && template.layers.map((layer) => {
            if (layer.kind === "rect") {
              return (
                <Rect
                  key={layer.id}
                  x={layer.x}
                  y={layer.y}
                  width={layer.width}
                  height={layer.height}
                  fill={layer.fill}
                  stroke={layer.stroke}
                  strokeWidth={layer.strokeWidth}
                  opacity={layer.opacity}
                  cornerRadius={layer.cornerRadius ?? 0}
                  draggable={editable}
                  onDragStart={() => onSelectLayer?.(layer.id)}
                  onClick={() => onSelectLayer?.(layer.id)}
                  onTap={() => onSelectLayer?.(layer.id)}
                  onDragEnd={(event) => onMoveLayer?.(layer.id, event.target.x(), event.target.y())}
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
                  stroke={layer.stroke}
                  strokeWidth={layer.strokeWidth}
                  opacity={layer.opacity}
                  draggable={editable}
                  onDragStart={() => onSelectLayer?.(layer.id)}
                  onClick={() => onSelectLayer?.(layer.id)}
                  onTap={() => onSelectLayer?.(layer.id)}
                  onDragEnd={(event) => onMoveLayer?.(layer.id, event.target.x() - layer.width / 2, event.target.y() - layer.height / 2)}
                />
              );
            }

            if (layer.kind === "image") {
              return (
                <TemplateImageNode
                  key={layer.id}
                  layer={layer}
                  editable={editable}
                  onSelectLayer={onSelectLayer}
                  onMoveLayer={onMoveLayer}
                  onPreparedImage={onPreparedImage}
                  onImageProcessingChange={onImageProcessingChange}
                />
              );
            }

            if (layer.kind !== "text") return null;
            const layout = getTextLayerLayout(layer);

            return (
              <KonvaText
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layout.width}
                height={layout.height}
                text={layer.text}
                fill={layer.fill}
                fontSize={layer.fontSize}
                fontFamily={layer.fontFamily}
                fontStyle={layer.fontStyle}
                fontWeight={layer.fontWeight}
                align={layer.align}
                lineHeight={layer.lineHeight}
                letterSpacing={layer.letterSpacing}
                scaleX={layout.scaleX}
                scaleY={layout.scaleY}
                wrap={layer.wrap ?? "word"}
                padding={4}
                draggable={editable}
                onDragStart={() => onSelectLayer?.(layer.id)}
                onClick={() => onSelectLayer?.(layer.id)}
                onTap={() => onSelectLayer?.(layer.id)}
                onDblClick={() => beginInlineEdit(layer)}
                onDblTap={() => beginInlineEdit(layer)}
                onDragEnd={(event) => onMoveLayer?.(layer.id, event.target.x(), event.target.y())}
              />
            );
          })}

          {editable && !isCapturing && selectedLayerId === TEMPLATE_BACKGROUND_SELECTION_ID && template.background.imageUrl && (
            <Rect
              x={4}
              y={4}
              width={template.canvas.width - 8}
              height={template.canvas.height - 8}
              stroke={template.background.accent}
              strokeWidth={4}
              dash={[16, 10]}
              cornerRadius={8}
              fillEnabled={false}
              listening={false}
            />
          )}

          {editable && !isCapturing && selectedLayerId && selectedLayerId !== TEMPLATE_BACKGROUND_SELECTION_ID && (() => {
            const selectedLayer = template.layers.find((layer) => layer.id === selectedLayerId);
            if (!selectedLayer) return null;
            const isText = selectedLayer.kind === "text";
            const isImage = selectedLayer.kind === "image";
            const textLayout = isText ? getTextLayerLayout(selectedLayer) : null;
            const scaleX = textLayout?.scaleX ?? (isImage ? imageLayerScaleX(selectedLayer) : 1);
            const scaleY = textLayout?.scaleY ?? (isImage ? imageLayerScaleY(selectedLayer) : 1);
            const width = textLayout?.width ?? selectedLayer.width;
            const height = textLayout?.height ?? selectedLayer.height;
            return (
              <Rect
                x={selectedLayer.x - 4}
                y={selectedLayer.y - 4}
                width={width + 8}
                height={height + 8}
                scaleX={scaleX}
                scaleY={scaleY}
                stroke={template.background.accent}
                strokeWidth={4}
                dash={[12, 8]}
                cornerRadius={selectedLayer.kind === "rect" ? selectedLayer.cornerRadius ?? 0 : 8}
                fillEnabled={false}
                listening={false}
              />
            );
          })()}
        </Layer>
      </Stage>

      {editable && inlineLayer && (
        (() => {
          const inlineLayout = getTextLayerLayout({ ...inlineLayer, text: inlineText });
          return <textarea
          ref={inlineEditorRef}
          className={`templates-inline-editor${inlineLayer.wrap === "none" ? " templates-inline-editor--single-line" : ""}`}
          wrap={inlineLayer.wrap === "none" ? "off" : "soft"}
          value={inlineText}
          onChange={(event) => {
            const nextText = event.target.value;
            setInlineText(nextText);
            onEditText?.(inlineLayer.id, textEditChanges(inlineLayer, nextText));
          }}
          onBlur={commitInlineEdit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") setInlineEditId(null);
            else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") commitInlineEdit();
          }}
          style={{
            left: stageOffsetX + inlineLayer.x * scale,
            top: stageOffsetY + inlineLayer.y * scale,
            width: inlineLayout.width * scale,
            height: inlineLayout.height * scale,
            color: inlineLayer.fill,
            fontFamily: inlineLayer.fontFamily,
            fontSize: inlineLayer.fontSize * scale,
            fontStyle: inlineLayer.fontStyle,
            fontWeight: inlineLayer.fontWeight,
            lineHeight: inlineLayer.lineHeight,
            textAlign: inlineLayer.align,
            letterSpacing: inlineLayer.letterSpacing ? `${inlineLayer.letterSpacing * scale}px` : undefined,
            transform: `scale(${inlineLayout.scaleX}, ${inlineLayout.scaleY})`,
            transformOrigin: "top left",
            whiteSpace: inlineLayer.wrap === "none" ? "pre" : "pre-wrap",
          } as CSSProperties}
          aria-label={`Edit ${inlineLayer.text || "text layer"}`}
          />;
        })()
      )}
    </div>
  );
});
