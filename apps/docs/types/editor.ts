/** biome-ignore-all lint/suspicious/noExplicitAny: false positive */
/** biome-ignore-all lint/complexity/noBannedTypes: false positive */
import type { ThemePreset, ThemeStyles } from "./theme";

export type QRPreset = ThemePreset;
export type QRStyle = ThemeStyles;

// Base interface for any editor's state
export interface BaseEditorState {
  styles: QRStyle;
}

// // Interface for editor-specific controls
// export interface EditorControls {
// }

export interface EditorPreviewProps {
  styles: QRStyle;
}

export interface ThemeEditorState extends BaseEditorState {
  preset?: string;
  styles: QRStyle;
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
  defaultState: BaseEditorState;
  controls: React.ComponentType<any>;
  preview: React.ComponentType<any>;
}
