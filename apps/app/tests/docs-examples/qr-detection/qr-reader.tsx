"use client";

import { handleImageLoad } from "qrdx";
import { useState } from "react";

async function decodeFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const result = await handleImageLoad(image, image.naturalWidth);
    return typeof result === "string" && result !== "NO_QR" ? result : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function QrReader() {
  const [result, setResult] = useState("");

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setResult((await decodeFile(file)) ?? "No QR code found");
    } catch {
      setResult("Could not read that image");
    }
  }

  return (
    <div>
      <input
        accept="image/*"
        aria-label="Image with a QR code"
        type="file"
        onChange={onChange}
      />
      {result ? <p>{result}</p> : null}
    </div>
  );
}
