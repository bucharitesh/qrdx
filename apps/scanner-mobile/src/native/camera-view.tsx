import { registerPlugin } from "@capacitor/core";
import { Button } from "@repo/design-system/components/ui/button";
import { Camera } from "iconsax-reactjs";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import type { DetectedCode } from "@/components/scanner/detector";

// The camera tab (components/scanner/camera-view.tsx, same props): the
// system's own scanner instead of a video element: Apple Vision on iOS,
// ML Kit on Android (@capacitor/barcode-scanner). It opens full screen,
// returns one code and closes; frames never leave the device.

interface ScanOptions {
  hint: number;
  scanInstructions: string;
  scanButton: boolean;
  scanText: string;
  cameraDirection: number;
  scanOrientation: number;
  cancelButtonAccessibilityLabel?: string;
  torchButtonOnAccessibilityLabel?: string;
  torchButtonOffAccessibilityLabel?: string;
  android?: { scanningLibrary?: "mlkit" | "zxing" };
}

// Registered directly rather than through the package's index, which also
// pulls in a web scanner the app never uses.
const BarcodeScanner = registerPlugin<{
  scanBarcode(
    options: ScanOptions
  ): Promise<{ ScanResult: string; format: number }>;
}>("CapacitorBarcodeScanner");

/** The plugin's format numbers, in order, as the web scanner names formats. */
const FORMATS = [
  "qr_code",
  "aztec",
  "codabar",
  "code_39",
  "code_93",
  "code_128",
  "data_matrix",
  "maxicode",
  "itf",
  "ean_13",
  "ean_8",
  "pdf417",
  "rss_14",
  "rss_expanded",
  "upc_a",
  "upc_e",
  "upc_ean_extension",
];
const ANY_FORMAT = 17;
const BACK_CAMERA = 1;
const ADAPTIVE = 3;
const CANCELLED = "OS-PLUG-BARC-0006";
const CAMERA_DENIED = "OS-PLUG-BARC-0007";

export function formatName(format: number): string {
  return FORMATS[format] ?? "qr_code";
}

export function CameraView({
  active,
  continuous,
  onActiveChange,
  onDetect,
}: {
  active: boolean;
  /** Keep scanning after a detection (batch mode). */
  continuous: boolean;
  onActiveChange: (active: boolean) => void;
  onDetect: (codes: DetectedCode[]) => void;
}) {
  const t = useTranslations("scanner.camera");
  const app = useTranslations("scannerApp");
  const cancel = useTranslations("scanner.main")("cancel");
  const [error, setError] = useState<"blocked" | "failed" | null>(null);
  const continuousRef = useRef(continuous);
  const onDetectRef = useRef(onDetect);
  const onActiveChangeRef = useRef(onActiveChange);
  continuousRef.current = continuous;
  onDetectRef.current = onDetect;
  onActiveChangeRef.current = onActiveChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the strings are stable for a session
  useEffect(() => {
    if (!active) {
      return;
    }
    let stopped = false;
    const seen = new Set<string>();
    const scan = async () => {
      setError(null);
      try {
        // Batch mode reopens the scanner after each new code; the same
        // code twice in a row means the person is done.
        while (!stopped) {
          const result = await BarcodeScanner.scanBarcode({
            hint: ANY_FORMAT,
            scanInstructions: app("scanInstructions"),
            scanButton: false,
            scanText: " ",
            cameraDirection: BACK_CAMERA,
            scanOrientation: ADAPTIVE,
            cancelButtonAccessibilityLabel: cancel,
            torchButtonOnAccessibilityLabel: t("torchOff"),
            torchButtonOffAccessibilityLabel: t("torchOn"),
            android: { scanningLibrary: "mlkit" },
          });
          if (stopped || !result.ScanResult) {
            return;
          }
          const format = formatName(result.format);
          const key = `${format}\u0000${result.ScanResult}`;
          const repeat = seen.has(key);
          seen.add(key);
          onDetectRef.current([
            { rawValue: result.ScanResult, format, cornerPoints: [] },
          ]);
          if (!continuousRef.current || repeat) {
            return;
          }
        }
      } catch (caught) {
        const code = (caught as { code?: string }).code;
        if (!stopped && code !== CANCELLED) {
          setError(code === CAMERA_DENIED ? "blocked" : "failed");
        }
      } finally {
        if (!stopped) {
          onActiveChangeRef.current(false);
        }
      }
    };
    scan();
    return () => {
      stopped = true;
    };
  }, [active]);

  return (
    <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-4 rounded-2xl bg-neutral-950 px-6 text-center text-white sm:aspect-video">
      <Camera aria-hidden className="size-9 opacity-80" />
      <p className="max-w-xs text-sm text-white/80">
        {error === "blocked"
          ? app("cameraBlocked")
          : error === "failed"
            ? t("errors.failed")
            : t("idle")}
      </p>
      <Button
        disabled={active}
        onClick={() => onActiveChange(true)}
        type="button"
      >
        <Camera className="size-4" />
        {error ? t("retry") : t("start")}
      </Button>
    </div>
  );
}
