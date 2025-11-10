import type { CSSProperties } from "react";
import type { CornerEyeDotPattern } from "./corner-dot";
import type { CornerEyePattern } from "./corner-eye";
import type { BodyPattern } from "./image-pattern";
import type { TemplateDefinition } from "./template";

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
  bodyPattern?: BodyPattern;
  cornerEyePattern?: CornerEyePattern;
  cornerEyeDotPattern?: CornerEyeDotPattern;
  margin?: number;
  style?: CSSProperties;
  imageSettings?: ImageSettings;
  isOGContext?: boolean;
  templateId?: string;
  // Custom template definition - if provided, this will be used instead of looking up by templateId
  customTemplate?: TemplateDefinition<any>;
  // Generic custom props that can be used by any template
  // Each template can define its own custom props type (e.g., FlamQRProps)
  customProps?: Record<string, any>;
};

export type QRPropsCanvas = QRProps &
  React.CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & React.SVGProps<SVGSVGElement>;
