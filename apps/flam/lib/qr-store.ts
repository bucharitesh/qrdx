import type { BodyPattern, CornerEyeDotPattern, CornerEyePattern } from "qrdx";
import { create } from "zustand";

export type QRStyles = {
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
};

type QRState = {
  url: string;
  qrStyles: QRStyles;
  setUrl: (url: string) => void;
  setQrStyles: (styles: Partial<QRStyles>) => void;
  updateQrStyle: <K extends keyof QRStyles>(key: K, value: QRStyles[K]) => void;
};

export const useQRStore = create<QRState>((set) => ({
  url: "https://instant.cdn.flamapp.com/card?o=12345",
  qrStyles: {
    showLogo: false,
    qrColor: "#000000",
    eyeColor: "#000000",
    dotColor: "#000000",
    bodyPattern: "circle-large",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
    level: "Q",
    backgroundColor: "#ffffff",
    templateId: "circle",
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
}));
