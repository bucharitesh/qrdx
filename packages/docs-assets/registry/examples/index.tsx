"use client";

// Live previews for the docs. Each example loads on its own, so a page only
// ships the examples it shows. Keys match the file names in this folder.
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

export const examples: Record<string, ComponentType> = {
  "qr-code-card-demo": dynamic(() => import("./qr-code-card-demo")),
  "qr-code-card-frames": dynamic(() => import("./qr-code-card-frames")),
  "qr-code-colors": dynamic(() => import("./qr-code-colors")),
  "qr-code-dark-mode": dynamic(() => import("./qr-code-dark-mode")),
  "qr-code-demo": dynamic(() => import("./qr-code-demo")),
  "qr-code-download-demo": dynamic(() => import("./qr-code-download-demo")),
  "qr-code-download-styled": dynamic(() => import("./qr-code-download-styled")),
  "qr-code-downloads": dynamic(() => import("./qr-code-downloads")),
  "qr-code-generator-demo": dynamic(() => import("./qr-code-generator-demo")),
  "qr-code-generator-presets": dynamic(
    () => import("./qr-code-generator-presets"),
  ),
  "qr-code-gradient": dynamic(() => import("./qr-code-gradient")),
  "qr-code-logo": dynamic(() => import("./qr-code-logo")),
  "qr-code-patterns": dynamic(() => import("./qr-code-patterns")),
  "qr-code-scanner-demo": dynamic(() => import("./qr-code-scanner-demo")),
  "qr-code-scanner-tickets": dynamic(() => import("./qr-code-scanner-tickets")),
  "qr-code-share-dialog-demo": dynamic(
    () => import("./qr-code-share-dialog-demo"),
  ),
  "qr-code-share-dialog-trigger": dynamic(
    () => import("./qr-code-share-dialog-trigger"),
  ),
  "qr-code-sizes": dynamic(() => import("./qr-code-sizes")),
  "qr-code-template": dynamic(() => import("./qr-code-template")),
  "vcard-qr-code-demo": dynamic(() => import("./vcard-qr-code-demo")),
  "vcard-qr-code-payload": dynamic(() => import("./vcard-qr-code-payload")),
  "wifi-qr-code-demo": dynamic(() => import("./wifi-qr-code-demo")),
  "wifi-qr-code-payload": dynamic(() => import("./wifi-qr-code-payload")),
  "wifi-qr-code-variants": dynamic(() => import("./wifi-qr-code-variants")),
};
