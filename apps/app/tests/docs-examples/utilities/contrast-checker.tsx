"use client";

import { getContrastLevel, getContrastRatio } from "qrdx";
import { useState } from "react";

export function ContrastChecker() {
  const [fgColor, setFgColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const ratio = getContrastRatio(fgColor, bgColor);
  const level = getContrastLevel(ratio);

  return (
    <div>
      <input
        aria-label="Module color"
        type="color"
        value={fgColor}
        onChange={(event) => setFgColor(event.target.value)}
      />
      <input
        aria-label="Background color"
        type="color"
        value={bgColor}
        onChange={(event) => setBgColor(event.target.value)}
      />
      <p>
        {ratio.toFixed(2)}:1, {level.level}. {level.message}
      </p>
    </div>
  );
}
