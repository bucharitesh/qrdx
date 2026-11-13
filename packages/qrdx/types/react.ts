// Prop types of the React components. Only the React entry (and the
// `qrdx/types` entry, for compatibility) reach this file; the core's types
// never do, so they work without React's types installed.
import type { CanvasHTMLAttributes, SVGProps } from "react";
import type { QRProps } from "./qr";

export type QRPropsCanvas = QRProps & CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & SVGProps<SVGSVGElement>;
