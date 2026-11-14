"use client";

import { toast } from "@repo/design-system";
import { Close } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import { Camera, GalleryAdd, Image as ImageIcon, Scan } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  ART_PHOTO_TYPES,
  ART_PHOTO_UPLOAD_MAX_BYTES,
  type PreparedPhoto,
  preparePhotoImage,
} from "./art-mode-photo";
import { ART_MODES, type ArtMode } from "./config";

const MODE_ICONS = { code: Scan, scene: ImageIcon, photo: Camera } as const;
const MODE_DESCRIPTIONS = {
  code: "codeDescription",
  scene: "sceneDescription",
  photo: "photoDescription",
} as const;

export interface ArtModePickerProps {
  mode: ArtMode;
  onModeChange: (mode: ArtMode) => void;
  /** Photo mode's photo (a JPEG data: URL), or null */
  photo: string | null;
  onPhotoChange: (photo: string | null) => void;
  disabled?: boolean;
  /** Prefix for element ids, unique on the page */
  idPrefix: string;
  className?: string;
}

/**
 * How the code sits in the artwork (config.ts ART_MODES): the code itself,
 * a scene, or the user's photo, which photo mode asks for here. Shared by
 * the playground's AI art panel and the /ai/art studio.
 */
export function ArtModePicker({
  mode,
  onModeChange,
  photo,
  onPhotoChange,
  disabled = false,
  idPrefix,
  className,
}: ArtModePickerProps) {
  const t = useTranslations("aiArt.artModes");
  const labelId = `${idPrefix}-mode`;
  return (
    <div className={cn("space-y-2", className)}>
      <Label id={labelId}>{t("mode")}</Label>
      <ToggleGroup
        aria-labelledby={labelId}
        className="w-full"
        disabled={disabled}
        onValueChange={(value) => value && onModeChange(value as ArtMode)}
        type="single"
        value={mode}
        variant="outline"
      >
        {ART_MODES.map((value) => {
          const Icon = MODE_ICONS[value];
          return (
            <ToggleGroupItem
              className="flex-1 gap-1.5"
              key={value}
              value={value}
            >
              <Icon aria-hidden className="size-4" />
              {t(value)}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <p className="text-muted-foreground text-xs text-pretty">
        {t(MODE_DESCRIPTIONS[mode])}
      </p>
      {mode === "photo" && (
        <ArtPhotoField
          disabled={disabled}
          idPrefix={idPrefix}
          onPhotoChange={onPhotoChange}
          photo={photo}
        />
      )}
    </div>
  );
}

/** The photo drop zone, then the photo with its crop and remove. */
function ArtPhotoField({
  photo,
  onPhotoChange,
  disabled,
  idPrefix,
}: {
  photo: string | null;
  onPhotoChange: (photo: string | null) => void;
  disabled: boolean;
  idPrefix: string;
}) {
  const t = useTranslations("aiArt.artModes");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // The picked file, kept in memory only while this field is open, so the
  // crop can move.
  const [source, setSource] = useState<{
    file: Blob;
    orientation: PreparedPhoto["orientation"];
  } | null>(null);
  const [focus, setFocus] = useState(0.5);

  const prepare = async (file: Blob, nextFocus: number) => {
    setPreparing(true);
    try {
      const prepared = await preparePhotoImage(file, nextFocus);
      setSource({ file, orientation: prepared.orientation });
      onPhotoChange(prepared.dataUrl);
    } catch (error) {
      toast.error(t("couldntUseThisPhoto"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPreparing(false);
    }
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!ART_PHOTO_TYPES.includes(file.type)) {
      toast.error(t("unsupportedFormat"), { description: t("usePngJpgWebp") });
      return;
    }
    if (file.size > ART_PHOTO_UPLOAD_MAX_BYTES) {
      toast.error(t("photoTooLarge"), {
        description: t("photosUpTo", {
          size: String(ART_PHOTO_UPLOAD_MAX_BYTES / 1024 / 1024),
        }),
      });
      return;
    }
    setFocus(0.5);
    void prepare(file, 0.5);
  };

  const remove = () => {
    setSource(null);
    onPhotoChange(null);
  };

  const input = (
    <input
      accept={ART_PHOTO_TYPES.join(",")}
      aria-label={t("choosePhoto")}
      className="sr-only"
      onChange={(event) => {
        pick(event.target.files?.[0]);
        event.target.value = "";
      }}
      ref={inputRef}
      type="file"
    />
  );

  if (!photo) {
    return (
      <>
        {input}
        <button
          className={cn(
            "text-muted-foreground flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center text-xs transition-colors",
            "hover:bg-muted/40 focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
            dragging && "bg-muted/60 border-foreground/40",
          )}
          disabled={disabled || preparing}
          onClick={() => inputRef.current?.click()}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files[0]);
          }}
          type="button"
        >
          {preparing ? (
            <ModuleOrbit className="size-5" />
          ) : (
            <GalleryAdd aria-hidden className="size-5" />
          )}
          <span className="text-foreground text-sm font-medium">
            {t("dropAPhoto")}
          </span>
          <span className="text-pretty">{t("photoHint")}</span>
        </button>
      </>
    );
  }

  const cropId = `${idPrefix}-photo-crop`;
  const canCrop = source && source.orientation !== "square";
  return (
    <div className="flex gap-3">
      {input}
      <img
        alt={t("yourPhoto")}
        className="size-20 shrink-0 rounded-md border object-cover"
        src={photo}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        {canCrop ? (
          <div className="space-y-2">
            <Label className="text-xs" htmlFor={cropId}>
              {t("crop")}
            </Label>
            <Slider
              aria-label={t("crop")}
              disabled={disabled || preparing}
              id={cropId}
              max={100}
              min={0}
              onValueChange={([value]) => setFocus((value ?? 50) / 100)}
              onValueCommit={([value]) =>
                void prepare(source.file, (value ?? 50) / 100)
              }
              step={5}
              value={[Math.round(focus * 100)]}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>
                {source.orientation === "landscape" ? t("left") : t("top")}
              </span>
              <span>
                {source.orientation === "landscape" ? t("right") : t("bottom")}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs text-pretty">
            {t("croppedSquare")}
          </p>
        )}
        <div className="flex gap-1">
          <Button
            disabled={disabled || preparing}
            onClick={() => inputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            {preparing ? <ModuleOrbit /> : <GalleryAdd />}
            {t("replace")}
          </Button>
          <Button
            disabled={disabled || preparing}
            onClick={remove}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Close />
            {t("remove")}
          </Button>
        </div>
      </div>
    </div>
  );
}
