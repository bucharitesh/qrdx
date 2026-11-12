"use client";

import { QRCodeSVG } from "qrdx";
import { useState } from "react";

export function LiveQrCode() {
  const [value, setValue] = useState("https://example.com");
  return (
    <div>
      <input
        aria-label="Text or link to encode"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {value ? <QRCodeSVG value={value} size={200} margin={4} /> : null}
    </div>
  );
}
