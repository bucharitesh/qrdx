import type { CSSProperties } from "react";

export type ImageSettings = {
  src: string;
  height: number;
  width: number;
  excavate: boolean;
  x?: number;
  y?: number;
};

export type DotPattern =
  | "circle"
  | "square"
  | "diamond"
  | "circle-mixed"
  | "packman"
  | "rounded"
  | "clean-square";

export type QRProps = {
  value: string;
  size?: number;
  level?: string;
  bgColor?: string;
  fgColor?: string;
  eyeColor?: string;
  dotColor?: string;
  dotPattern?: DotPattern;
  margin?: number;
  style?: CSSProperties;
  imageSettings?: ImageSettings;
  isOGContext?: boolean;
  templateId?: string;
  customText?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number;
  fontLetterSpacing?: number;
};

export type QRPropsCanvas = QRProps &
  React.CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & React.SVGProps<SVGSVGElement>;
