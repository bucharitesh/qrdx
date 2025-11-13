/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
/** biome-ignore-all lint/complexity/noBannedTypes: <explanation> */
import type { QRPreset, QRStyle } from "./qr";

/**
 * Base interface for QR editor state
 */
export interface BaseQREditorState {
  style: Partial<QRStyle>;
  value: string;
}

/**
 * QR Editor State with preset support
 */
export interface QREditorState extends BaseQREditorState {
  preset?: QRPreset;
  history: Partial<QRStyle>[];
  historyIndex: number;
}

/**
 * QR Editor Controls Props
 */
export interface QREditorControlsProps {
  style: Partial<QRStyle>;
  value: string;
  onChange: (style: Partial<QRStyle>) => void;
  onValueChange: (value: string) => void;
  presets?: QRPreset[];
  onPresetSelect?: (preset: QRPreset) => void;
}

/**
 * QR Editor Preview Props
 */
export interface QREditorPreviewProps {
  style: Partial<QRStyle>;
  value: string;
  showControls?: boolean;
}

/**
 * Type for available QR editor sections
 */
export type QREditorSection =
  | "basic"
  | "colors"
  | "patterns"
  | "logo"
  | "advanced"
  | "download";

/**
 * Interface for QR editor configuration
 */
export interface QREditorConfig {
  name: string;
  description: string;
  defaultState: BaseQREditorState;
  sections: QREditorSection[];
  presets?: QRPreset[];
}

/**
 * QR Editor Action Types
 */
export type QREditorAction =
  | { type: "UPDATE_STYLE"; payload: Partial<QRStyle> }
  | { type: "UPDATE_VALUE"; payload: string }
  | { type: "LOAD_PRESET"; payload: QRPreset }
  | { type: "RESET" }
  | { type: "UNDO" }
  | { type: "REDO" };
