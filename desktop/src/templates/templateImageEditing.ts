export interface TemplateImageUpload {
  src: string;
  width: number;
  height: number;
}

export interface TemplateImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not prepare the image."));
    reader.onerror = () => reject(new Error("Could not prepare the image."));
    reader.readAsDataURL(blob);
  });
}

function imageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not read the image dimensions."));
    image.src = src;
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not prepare the image."));
    image.src = src;
  });
}

/** Convert an operator-uploaded image into a portable source for an MCE template. */
export async function prepareTemplateImageUpload(file: File): Promise<TemplateImageUpload> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 15 MB.");
  }

  const src = await blobToDataUrl(file);
  const { width, height } = await imageDimensions(src);
  if (!width || !height) throw new Error("Could not read the image dimensions.");
  return { src, width, height };
}

/**
 * Remove a selected image's background in the app. The model is downloaded
 * only when an operator uses this action, then retained in the browser cache.
 */
export async function removeTemplateImageBackground(
  src: string,
  onProgress?: (progress: number | null) => void,
): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not prepare the selected image.");

  const source = await response.blob();
  const { removeBackground } = await import("@imgly/background-removal");
  const result = await removeBackground(source, {
    device: "cpu",
    model: "isnet_quint8",
    output: { format: "image/png" },
    progress: (_asset, current, total) => {
      onProgress?.(total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null);
    },
  });

  return blobToDataUrl(result);
}

/** Crop a prepared image so its selection frame matches the visible subject. */
export async function cropTemplateImage(src: string, crop: TemplateImageCrop): Promise<string> {
  const image = await loadImage(src);
  const x = Math.max(0, Math.floor(crop.x));
  const y = Math.max(0, Math.floor(crop.y));
  const width = Math.max(1, Math.min(Math.floor(crop.width), image.naturalWidth - x));
  const height = Math.max(1, Math.min(Math.floor(crop.height), image.naturalHeight - y));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not crop the image.");
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}
