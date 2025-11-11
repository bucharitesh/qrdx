import {
  type BodyPattern,
  bodyPatternSchema,
  type CornerEyeDotPattern,
  type CornerEyePattern,
  cornerEyeDotPatternSchema,
  cornerEyePatternSchema,
  type ErrorLevel,
  errorLevelSchema,
} from "qrdx/types";
import { z } from "zod";
import { create } from "zustand";

// Zod schemas for the store
export const qrStylesSchema = z.object({
  showLogo: z.boolean().optional(),
  qrLogo: z.string().optional(),
  qrColor: z.string(),
  backgroundColor: z.string(),
  eyeColor: z.string(),
  dotColor: z.string(),
  bodyPattern: bodyPatternSchema.optional(),
  cornerEyePattern: cornerEyePatternSchema.optional(),
  cornerEyeDotPattern: cornerEyeDotPatternSchema.optional(),
  level: errorLevelSchema.optional(),
  customLogo: z.string().optional(),
  templateId: z.string().optional(),
});

export const downloadOptionsSchema = z.object({
  size: z.enum(["small", "medium", "large", "xlarge", "2xl", "3xl", "custom"]),
  format: z.enum(["png", "jpg", "svg"]),
  width: z.number(),
  height: z.number(),
});

// Inferred types from schemas
export type QRStyles = z.infer<typeof qrStylesSchema>;
export type DownloadOptions = z.infer<typeof downloadOptionsSchema>;

interface QRState {
  url: string;
  qrStyles: QRStyles;
  downloadOptions: DownloadOptions;
  setUrl: (url: string) => void;
  setQrStyles: (styles: Partial<QRStyles>) => void;
  updateQrStyle: <K extends keyof QRStyles>(key: K, value: QRStyles[K]) => void;
  setDownloadOptions: (options: DownloadOptions) => void;
  updateDownloadOption: <K extends keyof DownloadOptions>(
    key: K,
    value: DownloadOptions[K],
  ) => void;
}

export const useQRStore = create<QRState>((set) => ({
  url: "https://google.com",
  qrStyles: {
    showLogo: false,
    qrColor: "#000000",
    eyeColor: "#000000",
    dotColor: "#000000",
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
    level: "Q",
    backgroundColor: "#ffffff",
    templateId: "default",
  },
  downloadOptions: {
    size: "medium",
    format: "png",
    width: 600,
    height: 600,
  },
  setUrl: (url) => set({ url }),
  setQrStyles: (styles) =>
    set((state) => ({
      qrStyles: { ...state.qrStyles, ...styles },
    })),
  updateQrStyle: (key, value) =>
    set((state) => ({
      qrStyles: { ...state.qrStyles, [key]: value },
    })),
  setDownloadOptions: (options: DownloadOptions) =>
    set({ downloadOptions: options }),
  updateDownloadOption: (
    key: keyof DownloadOptions,
    value: DownloadOptions[keyof DownloadOptions],
  ) =>
    set((state) => ({
      downloadOptions: { ...state.downloadOptions, [key]: value },
    })),
}));
