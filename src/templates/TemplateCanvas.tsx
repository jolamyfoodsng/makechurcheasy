import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Layer, Rect, Circle, Stage, Text as KonvaText } from "react-konva";
import type { EditableTemplate, TemplateTextLayer } from "./editableTemplateCatalog";
import "./TemplateCanvas.css";

function textLayerDisplayHeight(layer: TemplateTextLayer): number {
  const lineHeight = layer.lineHeight ?? 1.2;
  const charactersPerLine = Math.max(12, Math.floor(layer.width / Math.max(1, layer.fontSize * 0.56)));
  const estimatedLines = Math.max(
    1,
    layer.text.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0),
  );
  return Math.max(layer.height, Math.ceil(estimatedLines * layer.fontSize * lineHeight + 16));
}

export function TemplateCanvas({
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
                  opacity={layer.opacity}
                  draggable={editable}
                  onDragStart={() => onSelectLayer?.(layer.id)}
                  onClick={() => onSelectLayer?.(layer.id)}
                  onTap={() => onSelectLayer?.(layer.id)}
                  onDragEnd={(event) => onMoveLayer?.(layer.id, event.target.x() - layer.width / 2, event.target.y() - layer.height / 2)}
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
                onDragEnd={(event) => onMoveLayer?.(layer.id, event.target.x(), event.target.y())}
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
            if (event.key === "Escape") setInlineEditId(null);
            else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") commitInlineEdit();
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
