"use client";

import { Download } from "lucide-react";
import { type DownloadFormat, downloadQRCode, getQRData, QRCode } from "qrdx";
import { type ComponentProps, useId, useState } from "react";
import { cn } from "@/registry/lib/utils";
import { Button } from "@/registry/ui/button";
import { Input } from "@/registry/ui/input";
import { Label } from "@/registry/ui/label";

/** qrdx style options: colors, gradients, patterns, logo, template. */
export type QrCodeStyle = Omit<ComponentProps<typeof QRCode>, "value" | "size">;

export interface QrCodePreset {
  id: string;
  name: string;
  style: QrCodeStyle;
}

export const QR_CODE_PRESETS: QrCodePreset[] = [
  {
    id: "classic",
    name: "Classic",
    style: {
      fgColor: "#09090b",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
    },
  },
  {
    id: "rounded",
    name: "Rounded",
    style: {
      fgColor: "#18181b",
      bodyPattern: "rounded",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "rounded",
    },
  },
  {
    id: "dots",
    name: "Dots",
    style: {
      fgColor: "#1d4ed8",
      bodyPattern: "circle",
      cornerEyePattern: "circle",
      cornerEyeDotPattern: "circle",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    style: {
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#0369a1", offset: 0 },
          { color: "#4338ca", offset: 100 },
        ],
      },
      bodyPattern: "circle-large",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "circle",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    style: {
      fgColor: {
        type: "linear",
        angle: 135,
        stops: [
          { color: "#c2410c", offset: 0 },
          { color: "#9d174d", offset: 100 },
        ],
      },
      bodyPattern: "diamond",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "octagon",
    },
  },
  {
    id: "forest",
    name: "Forest",
    style: {
      fgColor: "#166534",
      eyeColor: "#14532d",
      bodyPattern: "small-square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "rounded",
    },
  },
];

export interface QrCodeGeneratorProps
  extends Omit<
    ComponentProps<"div">,
    "children" | "defaultValue" | "onChange"
  > {
  /**
   * Initial text or URL.
   * @default "https://qrdx.dev"
   */
  defaultValue?: string;
  /**
   * Style presets to pick from.
   * @default QR_CODE_PRESETS
   */
  presets?: QrCodePreset[];
  /** Id of the preset selected first. Defaults to the first preset. */
  defaultPreset?: string;
  /**
   * Width and height of the preview in pixels.
   * @default 200
   */
  size?: number;
  /**
   * Download buttons under the preview. Pass `[]` to hide them.
   * @default ["png", "svg"]
   */
  formats?: DownloadFormat[];
  /**
   * Download file name without extension.
   * @default "qr-code"
   */
  filename?: string;
  /** Called when the text or the preset changes. */
  onChange?: (state: { value: string; preset: QrCodePreset }) => void;
}

export function QrCodeGenerator({
  defaultValue = "https://qrdx.dev",
  presets = QR_CODE_PRESETS,
  defaultPreset,
  size = 200,
  formats = ["png", "svg"],
  filename = "qr-code",
  onChange,
  className,
  ...props
}: QrCodeGeneratorProps) {
  const inputId = useId();
  const [value, setValue] = useState(defaultValue);
  const [presetId, setPresetId] = useState(
    defaultPreset ?? presets[0]?.id ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const preset = presets.find((item) => item.id === presetId) ?? presets[0];
  const style = preset?.style;

  function update(nextValue: string, nextPreset = preset) {
    setValue(nextValue);
    if (nextPreset) {
      setPresetId(nextPreset.id);
      onChange?.({ value: nextValue, preset: nextPreset });
    }
  }

  async function download(format: DownloadFormat) {
    setPending(true);
    setError("");
    try {
      // getQRData lays a logo out for 1024px, the size of this file.
      await downloadQRCode(getQRData({ margin: 2, ...style, value }), {
        format,
        size: { width: 1024, height: 1024 },
        filename: `${filename}.${format}`,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not download the file.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        "grid w-full max-w-2xl gap-6 rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6",
        className,
      )}
      data-slot="qr-code-generator"
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor={inputId}>Text or URL</Label>
          <Input
            id={inputId}
            onChange={(event) => update(event.target.value)}
            placeholder="https://example.com"
            value={value}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-medium text-sm leading-none">
            Style
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((item) => {
              const active = item.id === preset?.id;
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-2 font-medium text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active && "border-foreground/40 bg-accent",
                  )}
                  key={item.id}
                  onClick={() => update(value, item)}
                  type="button"
                >
                  <span
                    className="overflow-hidden rounded-[3px]"
                    aria-hidden="true"
                  >
                    <QRCode margin={1} {...item.style} size={44} value="qrdx" />
                  </span>
                  {item.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div
          aria-label={value ? `QR code: ${value}` : "Empty QR code preview"}
          className="overflow-hidden rounded-[10px] border"
          role="img"
          style={{ width: size, height: size }}
        >
          {value ? (
            <QRCode margin={2} {...style} size={size} value={value} />
          ) : (
            <div className="flex size-full items-center justify-center bg-muted p-6 text-center text-muted-foreground text-xs">
              Type some text to generate a code
            </div>
          )}
        </div>
        {formats.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {formats.map((format) => (
              <Button
                disabled={!value || pending}
                key={format}
                onClick={() => download(format)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Download aria-hidden="true" />
                {format.toUpperCase()}
              </Button>
            ))}
          </div>
        ) : null}
        {error ? (
          <p
            className="max-w-[200px] text-center text-destructive text-xs"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
