import { fabric } from "fabric";
import { nanoid } from "nanoid";
import type {
  EditableTemplate,
  TemplateBackground,
  TemplateImageLayer,
  TemplateLayer,
  TemplateShapeLayer,
  TemplateTextLayer,
} from "../templates/editableTemplateCatalog";
import { cropTemplateImage, removeTemplateImageBackground } from "../templates/templateImageEditing";

export const STUDIO_WORKSPACE_FLAG = "mceDesignStudioWorkspace";
export const TEMPLATE_LAYER_ID_FLAG = "mceDesignStudioLayerId";
export const TEMPLATE_LAYER_KIND_FLAG = "mceDesignStudioLayerKind";
export const TEMPLATE_TEXT_WRAP_FLAG = "mceDesignStudioTextWrap";
export const TEMPLATE_TEXT_LETTER_SPACING_FLAG = "mceDesignStudioLetterSpacing";
export const TEMPLATE_BACKGROUND_IMAGE_FLAG = "mceDesignStudioBackgroundImage";

export const STUDIO_SERIALIZED_PROPERTIES = [
  STUDIO_WORKSPACE_FLAG,
  TEMPLATE_LAYER_ID_FLAG,
  TEMPLATE_LAYER_KIND_FLAG,
  TEMPLATE_TEXT_WRAP_FLAG,
  TEMPLATE_TEXT_LETTER_SPACING_FLAG,
  TEMPLATE_BACKGROUND_IMAGE_FLAG,
];

type StudioObject = fabric.Object & Record<string, unknown>;

function studioObject(object: fabric.Object): StudioObject {
  return object as StudioObject;
}

export function isStudioWorkspace(object: fabric.Object | null | undefined): boolean {
  return Boolean(object && studioObject(object)[STUDIO_WORKSPACE_FLAG]);
}

export function isTemplateBackgroundImage(object: fabric.Object | null | undefined): boolean {
  return Boolean(object && studioObject(object)[TEMPLATE_BACKGROUND_IMAGE_FLAG]);
}

function studioGradient(background: TemplateBackground, width: number, height: number): fabric.Gradient {
  return new fabric.Gradient({
    type: "linear",
    gradientUnits: "pixels",
    coords: { x1: 0, y1: 0, x2: width, y2: height },
    colorStops: [
      { offset: 0, color: background.gradientStart },
      { offset: 0.58, color: background.base },
      { offset: 1, color: background.gradientEnd },
    ],
  });
}

export function createStudioWorkspace(
  width: number,
  height: number,
  background?: TemplateBackground,
): fabric.Rect {
  const workspace = new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height,
    fill: background ? studioGradient(background, width, height) : "#FFFFFF",
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
  });
  studioObject(workspace)[STUDIO_WORKSPACE_FLAG] = true;
  return workspace;
}

export function canvasSnapshot(canvas: fabric.Canvas): string {
  return JSON.stringify(canvas.toJSON(STUDIO_SERIALIZED_PROPERTIES));
}

function readFill(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function scaledWidth(object: fabric.Object): number {
  return Math.max(1, Math.round(object.getScaledWidth()));
}

function scaledHeight(object: fabric.Object): number {
  return Math.max(1, Math.round(object.getScaledHeight()));
}

function addLayerMetadata(object: fabric.Object, layer: TemplateLayer): void {
  const metadata = studioObject(object);
  metadata[TEMPLATE_LAYER_ID_FLAG] = layer.id;
  metadata[TEMPLATE_LAYER_KIND_FLAG] = layer.kind;
  if (layer.kind === "text") {
    metadata[TEMPLATE_TEXT_WRAP_FLAG] = layer.wrap ?? "word";
    metadata[TEMPLATE_TEXT_LETTER_SPACING_FLAG] = layer.letterSpacing ?? 0;
  }
}

function addTextLayer(layer: TemplateTextLayer): fabric.Textbox | fabric.IText {
  const textOptions = {
    left: layer.x,
    top: layer.y,
    fontSize: layer.fontSize,
    fontFamily: layer.fontFamily,
    fontStyle: layer.fontStyle ?? "normal",
    fontWeight: String(layer.fontWeight ?? 400),
    fill: layer.fill,
    lineHeight: layer.lineHeight ?? 1.2,
    textAlign: layer.align ?? "left",
    charSpacing: Math.round(((layer.letterSpacing ?? 0) / Math.max(1, layer.fontSize)) * 1000),
    editable: true,
    splitByGrapheme: false,
    scaleX: layer.scaleX ?? 1,
    scaleY: layer.scaleY ?? 1,
  };
  // IText holds one line at its natural width, so changing the words does not
  // force the supplied title treatment into a narrower, wrapped box.
  const text = layer.wrap === "none"
    ? new fabric.IText(layer.text, textOptions)
    : new fabric.Textbox(layer.text, { ...textOptions, width: Math.max(1, layer.width) });
  addLayerMetadata(text, layer);
  return text;
}

function addShapeLayer(layer: TemplateShapeLayer): fabric.Rect | fabric.Circle {
  if (layer.kind === "rect") {
    const rectangle = new fabric.Rect({
      left: layer.x,
      top: layer.y,
      width: layer.width,
      height: layer.height,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
      opacity: layer.opacity ?? 1,
      rx: layer.cornerRadius ?? 0,
      ry: layer.cornerRadius ?? 0,
    });
    addLayerMetadata(rectangle, layer);
    return rectangle;
  }

  const circle = new fabric.Circle({
    left: layer.x,
    top: layer.y,
    radius: Math.max(1, layer.width / 2),
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    opacity: layer.opacity ?? 1,
    scaleY: Math.max(0.01, layer.height / Math.max(1, layer.width)),
  });
  addLayerMetadata(circle, layer);
  return circle;
}

function imageFromUrl(source: string): Promise<fabric.Image | null> {
  return new Promise((resolve) => {
    fabric.Image.fromURL(source, (image) => resolve(image ?? null));
  });
}

async function preparedTemplateImage(layer: TemplateImageLayer): Promise<string> {
  if (!layer.removeBackgroundOnLoad) return layer.src;
  try {
    const backgroundRemoved = await removeTemplateImageBackground(layer.src);
    return layer.crop ? cropTemplateImage(backgroundRemoved, layer.crop) : backgroundRemoved;
  } catch {
    return layer.src;
  }
}

async function addImageLayer(
  canvas: fabric.Canvas,
  layer: TemplateImageLayer,
  configureControls: (object: fabric.Object) => void,
  isCancelled?: () => boolean,
): Promise<void> {
  const source = await preparedTemplateImage(layer);
  if (isCancelled?.()) return;
  const image = await imageFromUrl(source);
  if (!image || isCancelled?.()) return;
  const sourceWidth = Math.max(1, image.width ?? layer.width);
  const sourceHeight = Math.max(1, image.height ?? layer.height);
  image.set({
    left: layer.x,
    top: layer.y,
    opacity: layer.opacity ?? 1,
    scaleX: (layer.width / sourceWidth) * (layer.scaleX ?? 1),
    scaleY: (layer.height / sourceHeight) * (layer.scaleY ?? 1),
  });
  addLayerMetadata(image, { ...layer, src: source, removeBackgroundOnLoad: false, crop: undefined });
  configureControls(image);
  canvas.add(image);
}

async function addBackgroundImage(
  canvas: fabric.Canvas,
  template: EditableTemplate,
  isCancelled?: () => boolean,
): Promise<void> {
  if (!template.background.imageUrl) return;
  const image = await imageFromUrl(template.background.imageUrl);
  if (!image || isCancelled?.()) return;
  image.set({
    left: 0,
    top: 0,
    opacity: template.background.imageOpacity ?? 1,
    scaleX: template.canvas.width / Math.max(1, image.width ?? template.canvas.width),
    scaleY: template.canvas.height / Math.max(1, image.height ?? template.canvas.height),
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
  });
  studioObject(image)[TEMPLATE_BACKGROUND_IMAGE_FLAG] = true;
  canvas.add(image);
}

/** Build a Fabric scene from the same structured layers used by the Templates gallery. */
export async function loadTemplateIntoFabricCanvas(
  canvas: fabric.Canvas,
  template: EditableTemplate,
  configureControls: (object: fabric.Object) => void,
  isCancelled?: () => boolean,
): Promise<fabric.Rect> {
  const workspace = createStudioWorkspace(template.canvas.width, template.canvas.height, template.background);
  if (isCancelled?.()) return workspace;
  canvas.add(workspace);
  await addBackgroundImage(canvas, template, isCancelled);
  if (isCancelled?.()) return workspace;

  for (const layer of template.layers) {
    if (isCancelled?.()) return workspace;
    if (layer.kind === "text") {
      const text = addTextLayer(layer);
      configureControls(text);
      canvas.add(text);
      continue;
    }
    if (layer.kind === "image") {
      await addImageLayer(canvas, layer, configureControls, isCancelled);
      continue;
    }
    const shape = addShapeLayer(layer);
    configureControls(shape);
    canvas.add(shape);
  }

  if (!isCancelled?.()) {
    canvas.sendToBack(workspace);
    canvas.clipPath = workspace;
    canvas.requestRenderAll();
  }
  return workspace;
}

function templateLayerId(object: fabric.Object): string {
  const metadata = studioObject(object);
  const existing = metadata[TEMPLATE_LAYER_ID_FLAG];
  if (typeof existing === "string" && existing.trim()) return existing;
  const next = `studio-${object.type ?? "object"}-${nanoid(8)}`;
  metadata[TEMPLATE_LAYER_ID_FLAG] = next;
  return next;
}

function textLayerFromFabric(
  object: fabric.Textbox | fabric.IText,
  original: TemplateTextLayer | undefined,
): TemplateTextLayer {
  const metadata = studioObject(object);
  const scaleX = readNumber(object.scaleX, 1);
  const scaleY = readNumber(object.scaleY, 1);
  const fontSize = Math.max(12, Math.round(readNumber(object.fontSize, original?.fontSize ?? 48)));
  const storedLetterSpacing = readNumber(metadata[TEMPLATE_TEXT_LETTER_SPACING_FLAG], Number.NaN);
  const letterSpacing = Number.isFinite(storedLetterSpacing)
    ? storedLetterSpacing
    : Math.round((readNumber(object.charSpacing, 0) / 1000) * fontSize * 100) / 100;
  const wrap = metadata[TEMPLATE_TEXT_WRAP_FLAG] === "none" ? "none" : original?.wrap ?? "word";
  return {
    ...(original ?? {}),
    id: templateLayerId(object),
    kind: "text",
    x: Math.round(readNumber(object.left, 0)),
    y: Math.round(readNumber(object.top, 0)),
    width: Math.max(1, Math.round(readNumber(object.width, object.getScaledWidth()))),
    height: Math.max(1, Math.round(readNumber(object.height, object.getScaledHeight()))),
    text: object.text ?? "",
    fill: readFill(object.fill, original?.fill ?? "#0F172A"),
    fontSize,
    fontFamily: object.fontFamily || original?.fontFamily || "Inter",
    fontStyle: object.fontStyle === "italic" ? "italic" : "normal",
    fontWeight: Math.max(100, Math.round(Number(object.fontWeight) || original?.fontWeight || 400)),
    align: object.textAlign === "center" || object.textAlign === "right" ? object.textAlign : "left",
    lineHeight: readNumber(object.lineHeight, original?.lineHeight ?? 1.2),
    letterSpacing,
    wrap,
    scaleX,
    scaleY,
    ...(scaleX !== 1 ? { preserveScaleX: true } : {}),
  };
}

function shapeLayerFromFabric(
  object: fabric.Rect | fabric.Circle,
  original: TemplateShapeLayer | undefined,
): TemplateShapeLayer {
  const isCircle = object.type === "circle";
  return {
    ...(original ?? {}),
    id: templateLayerId(object),
    kind: isCircle ? "circle" : "rect",
    x: Math.round(readNumber(object.left, 0)),
    y: Math.round(readNumber(object.top, 0)),
    width: scaledWidth(object),
    height: scaledHeight(object),
    fill: readFill(object.fill, original?.fill ?? "#1D4ED8"),
    ...(typeof object.stroke === "string" ? { stroke: object.stroke } : {}),
    ...(readNumber(object.strokeWidth, 0) > 0 ? { strokeWidth: readNumber(object.strokeWidth, 0) } : {}),
    opacity: readNumber(object.opacity, original?.opacity ?? 1),
    ...(!isCircle && object instanceof fabric.Rect && object.rx ? { cornerRadius: Math.round(object.rx) } : {}),
  };
}

function imageSource(object: fabric.Image): string {
  const source = object.getSrc();
  return typeof source === "string" ? source : "";
}

function imageLayerFromFabric(
  object: fabric.Image,
  original: TemplateImageLayer | undefined,
): TemplateImageLayer {
  return {
    ...(original ?? {}),
    id: templateLayerId(object),
    kind: "image",
    x: Math.round(readNumber(object.left, 0)),
    y: Math.round(readNumber(object.top, 0)),
    width: Math.max(1, Math.round(readNumber(object.width, object.getScaledWidth()))),
    height: Math.max(1, Math.round(readNumber(object.height, object.getScaledHeight()))),
    src: imageSource(object) || original?.src || "",
    opacity: readNumber(object.opacity, original?.opacity ?? 1),
    scaleX: readNumber(object.scaleX, 1),
    scaleY: readNumber(object.scaleY, 1),
    removeBackgroundOnLoad: false,
    crop: undefined,
  };
}

/** Convert the live Fabric scene back into the gallery's editable layer format. */
export function editableTemplateFromFabricCanvas(
  canvas: fabric.Canvas,
  source: EditableTemplate,
): EditableTemplate {
  const sourceLayers = new Map(source.layers.map((layer) => [layer.id, layer]));
  const layers: TemplateLayer[] = [];

  for (const object of canvas.getObjects()) {
    if (isStudioWorkspace(object) || isTemplateBackgroundImage(object)) continue;
    const metadata = studioObject(object);
    const originalId = typeof metadata[TEMPLATE_LAYER_ID_FLAG] === "string" ? metadata[TEMPLATE_LAYER_ID_FLAG] : "";
    const original = originalId ? sourceLayers.get(originalId) : undefined;

    if (object.type === "textbox" || object.type === "i-text") {
      layers.push(textLayerFromFabric(object as fabric.Textbox | fabric.IText, original?.kind === "text" ? original : undefined));
      continue;
    }
    if (object.type === "rect" || object.type === "circle") {
      layers.push(shapeLayerFromFabric(
        object as fabric.Rect | fabric.Circle,
        original?.kind === "rect" || original?.kind === "circle" ? original : undefined,
      ));
      continue;
    }
    if (object.type === "image") {
      layers.push(imageLayerFromFabric(object as fabric.Image, original?.kind === "image" ? original : undefined));
    }
  }

  return { ...source, layers };
}
