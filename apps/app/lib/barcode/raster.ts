// Browser-only helpers for the barcode generator: SVG to canvas (the PNG and
// the scan check use the same pixels) and saving a file.

/** Draws `svg` on a canvas of `width` × `height` pixels. */
export function svgToCanvas(
  svg: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("This browser can't draw the barcode image."));
        return;
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't draw the barcode image."));
    };
    image.src = url;
  });
}

/** The canvas as PNG or JPEG (92% quality: clean bar edges, small files). */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg" | string = "image/png",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // A browser that can't encode the type falls back to PNG.
        if (blob && blob.type === type) resolve(blob);
        else
          reject(
            new Error(
              `This browser can't make ${type === "image/jpeg" ? "a JPG" : "this image"}.`,
            ),
          );
      },
      type,
      type === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the download a moment to start before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
