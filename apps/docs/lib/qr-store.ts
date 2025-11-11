import type { BodyPattern, CornerEyeDotPattern, CornerEyePattern } from "qrdx";
import { create } from "zustand";

export interface QRStyles {
  showLogo?: boolean;
  qrLogo?: string;
  qrColor: string;
  backgroundColor: string;
  eyeColor: string;
  dotColor: string;
  bodyPattern?: BodyPattern;
  cornerEyePattern?: CornerEyePattern;
  cornerEyeDotPattern?: CornerEyeDotPattern;
  level?: "L" | "M" | "Q" | "H";
  customLogo?: string;
  templateId?: string;
}

export interface DownloadOptions {
  size: "small" | "medium" | "large" | "xlarge" | "2xl" | "3xl" | "custom";
  format: "png" | "jpg" | "svg";
  width: number;
  height: number;
}

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
