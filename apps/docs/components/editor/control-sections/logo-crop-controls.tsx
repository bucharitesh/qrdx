"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Magicpen } from "iconsax-reactjs";
import { removeLogoBackground } from "qrdx";
import { LOGO_SHAPES, type LogoOptions, type LogoShape } from "qrdx/types";
import { useEffect, useState } from "react";
import type { QRStyle } from "@/types/theme";
import { FrameColorField } from "./frame-fields";

export const LOGO_SHAPE_NAMES: Record<LogoShape, string> = {
  square: "Square",
  rounded: "Rounded",
  circle: "Circle",
};

const PLATE_DEFAULT = "#ffffff";

const PLATE_NOUNS: Record<LogoShape, string> = {
  square: "square",
  rounded: "rounded square",
  circle: "circle",
};

/** Uploaded raster logos (a solid background is a raster thing). */
const RASTER_LOGO = /^data:image\/(?:png|jpe?g|webp)[;,]/i;

type Cleanup =
  | { status: "idle" | "checking" | "none" }
  | { status: "ready"; cleaned: string };

/**
 * The logo with its solid background removed, worked out once per logo so
 * the button can say whether there is anything to remove.
 */
function useBackgroundCleanup(src: string | undefined): Cleanup {
  const [cleanup, setCleanup] = useState<Cleanup>({ status: "idle" });
  useEffect(() => {
    if (!(src && RASTER_LOGO.test(src))) {
      setCleanup({ status: "idle" });
      return;
    }
    let live = true;
    setCleanup({ status: "checking" });
    removeLogoBackground(src)
      .then((cleaned) => {
        if (!live) return;
        setCleanup(cleaned ? { status: "ready", cleaned } : { status: "none" });
      })
      .catch(() => {
        if (live) setCleanup({ status: "none" });
      });
    return () => {
      live = false;
    };
  }, [src]);
  return cleanup;
}

interface LogoCropControlsProps {
  /** The style with defaults filled in */
  style: QRStyle;
  setOptions: (change: Partial<LogoOptions>) => void;
  onChange: (change: Partial<QRStyle>) => void;
}

/** Crop shape, a plate behind the logo, and background removal. */
export function LogoCropControls({
  style,
  setOptions,
  onChange,
}: LogoCropControlsProps) {
  const shape = style.logoOptions?.shape ?? "square";
  const plate = style.logoOptions?.plate;
  const cleanup = useBackgroundCleanup(style.customLogo);
  const [removed, setRemoved] = useState<string | null>(null);
  const uploaded = Boolean(
    style.customLogo && RASTER_LOGO.test(style.customLogo),
  );

  return (
    <>
      <div className="space-y-2.5">
        <span className="text-muted-foreground text-sm">Shape</span>
        <fieldset aria-label="Logo shape" className="flex flex-wrap gap-1.5">
          {LOGO_SHAPES.map((id) => (
            <Button
              aria-pressed={shape === id}
              key={id}
              onClick={() =>
                setOptions({ shape: id === "square" ? undefined : id })
              }
              size="sm"
              type="button"
              variant={shape === id ? "secondary" : "outline"}
            >
              {LOGO_SHAPE_NAMES[id]}
            </Button>
          ))}
        </fieldset>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label className="cursor-pointer text-sm" htmlFor="logo-plate">
              Plate behind the logo
            </Label>
            <p className="text-muted-foreground text-xs">
              A solid {PLATE_NOUNS[shape]} the logo sits on.
            </p>
          </div>
          <Switch
            checked={Boolean(plate)}
            id="logo-plate"
            onCheckedChange={(on) =>
              setOptions({ plate: on ? PLATE_DEFAULT : undefined })
            }
          />
        </div>
        {plate && (
          <FrameColorField
            id="logo-plate-color"
            label="Plate color"
            onChange={(color) => setOptions({ plate: color })}
            value={plate}
          />
        )}
      </div>

      {uploaded && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs text-pretty">
            {removed === style.customLogo
              ? "Background removed. Undo brings it back."
              : cleanup.status === "none"
                ? "Your logo has no solid background to remove."
                : "Remove the solid background around your logo."}
          </p>
          {removed !== style.customLogo && cleanup.status !== "none" && (
            <Button
              disabled={cleanup.status !== "ready"}
              onClick={() => {
                if (cleanup.status !== "ready") return;
                setRemoved(cleanup.cleaned);
                onChange({ customLogo: cleanup.cleaned });
                toast.success("Background removed");
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Magicpen />
              Remove background
            </Button>
          )}
        </div>
      )}
    </>
  );
}
