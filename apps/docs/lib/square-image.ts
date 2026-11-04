/**
 * Center-crops a picture to a square of `pixels` and re-encodes it (which
 * also drops EXIF data such as GPS position): WebP, or PNG where the browser
 * can't write WebP. Browser only. Profile pictures and workspace logos.
 */
export async function squareImage(file: File, pixels: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    pixels,
    pixels,
  );
  bitmap.close();
  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
  const blob = (await encode("image/webp", 0.9)) ?? (await encode("image/png"));
  if (!blob) throw new Error("Encoding failed");
  return blob;
}
