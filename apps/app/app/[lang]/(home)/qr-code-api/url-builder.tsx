"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Slider } from "@repo/design-system/components/ui/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { ExportSquare } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { CodeSnippet } from "@/components/sections/integrations/code-snippet";
import {
  type ApiQuery,
  apiSnippets,
  type ImageFormat,
  LEVELS,
  queryString,
} from "./snippets";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** Wait for typing to settle before asking the API for a new preview. */
const PREVIEW_DELAY_MS = 350;

export interface UrlBuilderProps {
  /** The public API base the snippets use (https://api.qrdx.dev/v1). */
  apiBase: string;
  /** Where the preview loads from: this deployment's own /api/v1. */
  previewBase: string;
  formats: readonly ImageFormat[];
  bodies: readonly string[];
  logoIcons: readonly string[];
  sizeMin: number;
  sizeMax: number;
  dataMax: number;
  perMinute: number;
  initial: ApiQuery;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("qrCodeApi.builder");
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span
          className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border shadow-xs"
          style={{ background: value }}
        >
          <input
            aria-label={t("pickColor", { label: label.toLowerCase() })}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            type="color"
            value={value}
          />
        </span>
        <Input
          aria-invalid={!HEX_COLOR.test(text)}
          autoComplete="off"
          className="font-mono uppercase"
          id={id}
          maxLength={7}
          onChange={(event) => {
            const next = event.target.value.trim();
            const withHash = next.startsWith("#") ? next : `#${next}`;
            setText(withHash);
            if (HEX_COLOR.test(withHash)) onChange(withHash.toLowerCase());
          }}
          spellCheck={false}
          value={text}
        />
      </div>
    </div>
  );
}

/** Image API URL builder: a form, the live image and copy-ready snippets. */
export function UrlBuilder({
  apiBase,
  previewBase,
  formats,
  bodies,
  logoIcons,
  sizeMin,
  sizeMax,
  dataMax,
  perMinute,
  initial,
}: UrlBuilderProps) {
  const t = useTranslations("qrCodeApi.builder");
  const id = useId();
  const [query, setQuery] = useState<ApiQuery>(initial);
  const set = <K extends keyof ApiQuery>(key: K, value: ApiQuery[K]) =>
    setQuery((current) => ({ ...current, [key]: value }));

  const valid = query.data.length > 0 && query.data.length <= dataMax;
  // EPS can't be shown in an <img>: preview the same code as SVG.
  const previewQuery: ApiQuery = {
    ...query,
    format: query.format === "eps" ? "svg" : query.format,
  };
  const nextPreview = valid
    ? `${previewBase}/qr?${queryString(previewQuery)}`
    : null;
  const [preview, setPreview] = useState(nextPreview);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFailed(false);
      setPreview(nextPreview);
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [nextPreview]);

  const snippets = apiSnippets(apiBase, query);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-5 self-start rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-data`}>{t("data")}</Label>
          <Input
            aria-invalid={!valid}
            autoComplete="off"
            id={`${id}-data`}
            onChange={(event) => set("data", event.target.value)}
            spellCheck={false}
            value={query.data}
          />
          {query.data.length > dataMax && (
            <p className="text-xs text-destructive">
              {t("tooLong", { max: dataMax })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Label id={`${id}-format`}>{t("format")}</Label>
          <ToggleGroup
            aria-labelledby={`${id}-format`}
            onValueChange={(next) => {
              if (next) set("format", next as ImageFormat);
            }}
            size="sm"
            type="single"
            value={query.format}
            variant="outline"
          >
            {formats.map((format) => (
              <ToggleGroupItem
                className="px-2.5 font-mono text-xs uppercase"
                key={format}
                value={format}
              >
                {format}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label id={`${id}-size`}>{t("size")}</Label>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {query.format === "eps"
                ? t("sizePoints", { size: query.size })
                : t("sizePixels", { size: query.size })}
            </span>
          </div>
          <Slider
            aria-labelledby={`${id}-size`}
            max={sizeMax}
            min={sizeMin}
            onValueChange={([next]) => {
              if (next !== undefined) set("size", next);
            }}
            step={64}
            value={[query.size]}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label={t("fg")}
            onChange={(value) => set("fg", value)}
            value={query.fg}
          />
          <ColorField
            label={t("bg")}
            onChange={(value) => set("bg", value)}
            value={query.bg}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${id}-body`}>{t("body")}</Label>
            <Select
              onValueChange={(next) => set("body", next)}
              value={query.body}
            >
              <SelectTrigger className="w-full font-mono" id={`${id}-body`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bodies.map((body) => (
                  <SelectItem className="font-mono" key={body} value={body}>
                    {body}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${id}-logo`}>{t("logo")}</Label>
            <Select
              onValueChange={(next) => set("logoIcon", next)}
              value={query.logoIcon || "none"}
            >
              <SelectTrigger className="w-full font-mono" id={`${id}-logo`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("logoNone")}</SelectItem>
                {logoIcons.map((icon) => (
                  <SelectItem className="font-mono" key={icon} value={icon}>
                    {icon}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {query.logoIcon !== "none" && (
          <p className="-mt-2 text-xs text-muted-foreground">{t("logoNote")}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Label id={`${id}-level`}>{t("level")}</Label>
          <ToggleGroup
            aria-labelledby={`${id}-level`}
            onValueChange={(next) => {
              if (next) set("level", next as ApiQuery["level"]);
            }}
            size="sm"
            type="single"
            value={query.level}
            variant="outline"
          >
            {LEVELS.map((level) => (
              <ToggleGroupItem
                className="px-2.5 font-mono text-xs"
                key={level}
                value={level}
              >
                {level}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div
          aria-live="polite"
          className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 p-4"
        >
          {preview && !failed ? (
            // The live API response; never page markup.
            <img
              alt={t("previewAlt", { value: query.data })}
              className="size-56 object-contain"
              height={224}
              onError={() => setFailed(true)}
              src={preview}
              width={224}
            />
          ) : (
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              {failed ? t("loadFailed", { perMinute }) : t("empty")}
            </p>
          )}
        </div>
        {query.format === "eps" && (
          <p className="text-xs text-muted-foreground">{t("epsPreview")}</p>
        )}
        <CodeSnippet code={snippets.url} label={t("url")} wrap />
        <CodeSnippet code={snippets.html} label={t("html")} wrap />
        <CodeSnippet code={snippets.markdown} label={t("markdown")} wrap />
        <CodeSnippet code={snippets.curl} label={t("curl")} wrap />
        <Button asChild className="self-start" variant="outline">
          <a
            href={valid ? snippets.url : undefined}
            rel="noopener"
            target="_blank"
          >
            <ExportSquare aria-hidden className="size-4" />
            {t("open")}
          </a>
        </Button>
      </div>
    </div>
  );
}
