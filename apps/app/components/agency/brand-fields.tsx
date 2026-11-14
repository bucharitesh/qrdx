"use client";

// One brand's name, logo and accent color (agency tools): a client brand
// for shared stats pages, or the workspace's client-portal branding. The
// logo is an upload (cropped and re-encoded here, checked again on the
// server) or an https image URL; the accent is optional.

import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { CloseCircle, GalleryEdit, Link21 } from "iconsax-reactjs";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  accentUse,
  BRAND_NAME_MAX,
  type ClientBrand,
  normalizeAccent,
} from "@/lib/client-brands-shared";
import { soundEvent } from "@/lib/sound/emit";
import { squareImage } from "@/lib/square-image";
import {
  LOGO_INPUT_ACCEPT,
  LOGO_INPUT_MAX_BYTES,
  LOGO_MAX_BYTES,
  LOGO_PIXELS,
  LOGO_URL_MAX_LENGTH,
  logoImageSrc,
  logoUrlProblem,
} from "@/lib/workspace-logo";

export type BrandSaveResult =
  | { ok: true; data: ClientBrand }
  | { ok: false; code: string; error: string };

/** The brand's tile: its logo, else its initial (on its accent when set). */
export function BrandTile({
  name,
  logo,
  accent,
  size = "md",
  className,
}: {
  name: string;
  logo: string | null;
  accent: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = logoImageSrc(logo);
  const sizes = {
    sm: "size-6 rounded-md text-[11px]",
    md: "size-9 rounded-lg text-sm",
    lg: "size-14 rounded-xl text-lg",
  } as const;
  if (src && failed !== src) {
    return (
      <span
        aria-hidden
        className={cn(
          "bg-background ring-border flex shrink-0 overflow-hidden ring-1",
          sizes[size],
          className,
        )}
      >
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          onError={() => setFailed(src)}
          referrerPolicy="no-referrer"
          src={src}
        />
      </span>
    );
  }
  const onAccent = accent ? accentUse(accent).onAccent : undefined;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold uppercase select-none",
        sizes[size],
        accent ? "" : "bg-foreground text-background",
        className,
      )}
      style={accent ? { background: accent, color: onAccent } : undefined}
    >
      {name.trim().charAt(0) || "C"}
    </span>
  );
}

/**
 * The form. `save` gets the fields as FormData (actions/client-brands.ts
 * reads them); `onSaved` gets the saved brand.
 */
export function BrandFields({
  brand,
  save,
  onSaved,
  onCancel,
  submitLabel = "Save",
  namePlaceholder = "Client name",
  nameLabel = "Name",
  disabled = false,
}: {
  brand: ClientBrand | null;
  save: (form: FormData) => Promise<BrandSaveResult>;
  onSaved: (brand: ClientBrand) => void;
  onCancel?: () => void;
  submitLabel?: string;
  namePlaceholder?: string;
  nameLabel?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const canUpload = useAvailability().has("fileStorage");
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(brand?.name ?? "");
  const [accent, setAccent] = useState(brand?.accent ?? "");
  const [accentText, setAccentText] = useState(brand?.accent ?? "");
  // What the logo will be: the saved one, a picked file, a URL, or none.
  const [logo, setLogo] = useState<
    | { kind: "keep" }
    | { kind: "file"; blob: Blob; preview: string }
    | { kind: "url"; url: string }
    | { kind: "remove" }
  >({ kind: "keep" });
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (logo.kind === "file") URL.revokeObjectURL(logo.preview);
    },
    [logo],
  );

  const shownLogo =
    logo.kind === "file"
      ? logo.preview
      : logo.kind === "url"
        ? logo.url
        : logo.kind === "remove"
          ? null
          : (brand?.logo ?? null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > LOGO_INPUT_MAX_BYTES) {
      setError("Choose a picture under 10 MB.");
      return;
    }
    try {
      const blob = await squareImage(file, LOGO_PIXELS);
      if (blob.size > LOGO_MAX_BYTES) {
        setError("That picture is too large. Try a smaller one.");
        return;
      }
      setError(null);
      setLogo({ kind: "file", blob, preview: URL.createObjectURL(blob) });
    } catch {
      setError("We couldn't read that picture. Try a PNG or JPEG.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyUrl = () => {
    const problem = logoUrlProblem(url.trim());
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLogo({ kind: "url", url: url.trim() });
    setUrlOpen(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    if (accentText.trim() && !normalizeAccent(accentText)) {
      setError("Use a hex color, like #1f6feb.");
      return;
    }
    const form = new FormData();
    if (brand) form.set("id", brand.id);
    form.set("name", name.trim());
    form.set("accent", normalizeAccent(accentText) ?? "");
    if (logo.kind === "file") {
      form.set("logo", new File([logo.blob], "logo", { type: logo.blob.type }));
    } else if (logo.kind === "url") {
      form.set("logoUrl", logo.url);
    } else if (logo.kind === "remove") {
      form.set("removeLogo", "1");
    }
    setBusy(true);
    setError(null);
    try {
      const result = await save(form);
      if (!result.ok) {
        setError(result.error);
        soundEvent("error");
        return;
      }
      soundEvent("success");
      onSaved(result.data);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const off = disabled || busy;

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>{nameLabel}</Label>
        <Input
          autoComplete="off"
          disabled={off}
          id={`${id}-name`}
          maxLength={BRAND_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          placeholder={namePlaceholder}
          value={name}
        />
      </div>

      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex flex-wrap items-center gap-3">
          <BrandTile
            accent={normalizeAccent(accent)}
            logo={shownLogo}
            name={name || "?"}
            size="lg"
          />
          <div className="flex flex-wrap gap-1.5">
            {canUpload && (
              <>
                <input
                  accept={LOGO_INPUT_ACCEPT}
                  className="sr-only"
                  id={`${id}-file`}
                  onChange={(event) => onFile(event.target.files?.[0])}
                  ref={fileRef}
                  tabIndex={-1}
                  type="file"
                />
                <Button
                  disabled={off}
                  onClick={() => fileRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <GalleryEdit aria-hidden />
                  {shownLogo ? "Change" : "Upload"}
                </Button>
              </>
            )}
            <Button
              aria-expanded={urlOpen}
              disabled={off}
              onClick={() => setUrlOpen((open) => !open)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Link21 aria-hidden />
              Image URL
            </Button>
            {shownLogo && (
              <Button
                disabled={off}
                onClick={() => setLogo({ kind: "remove" })}
                size="sm"
                type="button"
                variant="ghost"
              >
                <CloseCircle aria-hidden />
                Remove
              </Button>
            )}
          </div>
        </div>
        {urlOpen && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Logo image URL"
              autoComplete="off"
              disabled={off}
              inputMode="url"
              maxLength={LOGO_URL_MAX_LENGTH}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyUrl();
                }
              }}
              placeholder="https://example.com/logo.png"
              type="url"
              value={url}
            />
            <Button
              disabled={off || !url.trim()}
              onClick={applyUrl}
              size="sm"
              type="button"
              variant="outline"
            >
              Use
            </Button>
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Square works best.
          {canUpload ? " Uploads are cropped to a square." : ""}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-accent`}>Accent color</Label>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "relative size-9 shrink-0 overflow-hidden rounded-md border shadow-xs",
              !normalizeAccent(accent) &&
                "bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_4px,transparent_4px,transparent_8px)]",
            )}
            style={
              normalizeAccent(accent)
                ? { background: normalizeAccent(accent) ?? undefined }
                : undefined
            }
          >
            <input
              aria-label="Pick the accent color"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              disabled={off}
              onChange={(event) => {
                setAccent(event.target.value);
                setAccentText(event.target.value);
              }}
              type="color"
              value={normalizeAccent(accent) ?? "#000000"}
            />
          </span>
          <Input
            aria-invalid={
              Boolean(accentText.trim()) && !normalizeAccent(accentText)
            }
            autoComplete="off"
            className="font-mono"
            disabled={off}
            id={`${id}-accent`}
            maxLength={7}
            onChange={(event) => {
              setAccentText(event.target.value);
              const next = normalizeAccent(event.target.value);
              setAccent(next ?? "");
            }}
            placeholder="None"
            spellCheck={false}
            value={accentText}
          />
          {accentText && (
            <Button
              aria-label="No accent color"
              disabled={off}
              onClick={() => {
                setAccent("");
                setAccentText("");
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <CloseCircle aria-hidden />
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Used sparingly: the chart and the logo tile. Leave it empty to stay
          monochrome.
        </p>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            disabled={busy}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        )}
        <Button disabled={off} size="sm" type="submit">
          {busy && <ModuleOrbit aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
