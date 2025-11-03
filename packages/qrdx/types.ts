import type { CSSProperties } from "react";
import type qrcodegen from "./codegen";

export type Modules = ReturnType<qrcodegen.QrCode["getModules"]>;
export type Excavation = { x: number; y: number; w: number; h: number };

export type ImageSettings = {
  src: string;
  height: number;
  width: number;
  excavate: boolean;
  x?: number;
  y?: number;
};

export type QRProps = {
  value: string;
  size?: number;
  level?: string;
  bgColor?: string;
  fgColor?: string;
  eyeColor?: string;
  dotColor?: string;
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

// Base props that all templates support
export type BaseTemplateProps = {
  fgColor?: string;
  bgColor?: string;
};

// Generic template definition that allows custom props
export type TemplateDefinition<TCustomProps = Record<string, never>> = {
  id: string;
  name: string;
  description?: string;
  wrapper: (
    children: React.ReactNode,
    props?: BaseTemplateProps & TCustomProps
  ) => React.ReactNode;
};
