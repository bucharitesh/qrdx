"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import { AlertTriangle, Check, Wand2 } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import type { LandingTheme } from "@/types/landing";
import {
  contrastRatio,
  isHexColor,
  LANDING_FONTS,
  paletteFrom,
  readableOn,
  THEME_PRESETS,
} from "../theme";
import {
  ChoiceField,
  ImageField,
  SelectField,
  SliderField,
  UrlField,
} from "./fields";

export interface SavedThemePalette {
  id: string;
  name: string;
  colors: LandingTheme["colors"];
}

type Colors = LandingTheme["colors"];

const COLOR_FIELDS: Array<{ key: keyof Colors; label: string }> = [
  { key: "background", label: "Background" },
  { key: "foreground", label: "Text" },
  { key: "primary", label: "Accent" },
  { key: "primaryForeground", label: "Text on accent" },
  { key: "muted", label: "Cards" },
  { key: "mutedForeground", label: "Secondary text" },
];

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const six = isHexColor(value) && value.length === 7 ? value : "#000000";
  return (
    <div className="space-y-1">
      <label className="text-muted-foreground text-xs" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          aria-label={`${label} color picker`}
          className="size-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={six}
        />
        <Input
          aria-invalid={!isHexColor(value)}
          className="h-8 font-mono text-xs uppercase"
          id={id}
          maxLength={9}
          onChange={(event) => {
            const next = event.target.value.trim();
            onChange(next.startsWith("#") ? next : `#${next}`);
          }}
          spellCheck={false}
          value={value}
        />
      </div>
    </div>
  );
}

function Swatch({
  name,
  colors,
  active,
  onClick,
}: {
  name: string;
  colors: Colors;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "group flex min-w-0 flex-col items-center gap-1.5 rounded-md p-1.5 text-xs hover:bg-muted",
        active && "bg-muted",
      )}
      onClick={onClick}
      title={name}
      type="button"
    >
      <span
        className="relative flex h-10 w-full items-end justify-center overflow-hidden rounded-md border"
        style={{ backgroundColor: colors.background }}
      >
        <span
          className="mb-1.5 h-3 w-3/5 rounded-sm"
          style={{ backgroundColor: colors.primary }}
        />
        {active && (
          <Check
            className="absolute top-1 right-1 size-3.5"
            style={{ color: colors.foreground }}
          />
        )}
      </span>
      <span className="w-full truncate">{name}</span>
    </button>
  );
}

const sameColors = (a: Colors, b: Colors) =>
  (Object.keys(a) as (keyof Colors)[]).every(
    (key) => a[key].toLowerCase() === b[key].toLowerCase(),
  );

export function ThemeControls({
  theme,
  onChange,
  savedThemes,
}: {
  theme: LandingTheme;
  onChange: (theme: LandingTheme) => void;
  savedThemes: SavedThemePalette[];
}) {
  const set = (patch: Partial<LandingTheme>) =>
    onChange({ ...theme, ...patch });
  const setColors = (patch: Partial<Colors>) =>
    set({ colors: { ...theme.colors, ...patch } });

  const textContrast = contrastRatio(
    isHexColor(theme.colors.background) ? theme.colors.background : "#ffffff",
    isHexColor(theme.colors.foreground) ? theme.colors.foreground : "#000000",
  );
  const accentContrast = contrastRatio(
    isHexColor(theme.colors.primary) ? theme.colors.primary : "#000000",
    isHexColor(theme.colors.primaryForeground)
      ? theme.colors.primaryForeground
      : "#ffffff",
  );
  const lowContrast = textContrast < 4.5 || accentContrast < 3;
  const background = theme.background;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Saved themes</h3>
        {savedThemes.length > 0 ? (
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
            {savedThemes.map((saved) => (
              <Swatch
                active={sameColors(saved.colors, theme.colors)}
                colors={saved.colors}
                key={saved.id}
                name={saved.name}
                onClick={() => setColors(saved.colors)}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Use the colors of your QR themes here.{" "}
            <Link className="underline" href="/dashboard/themes">
              Save a theme
            </Link>{" "}
            in the editor first.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Presets</h3>
        <div className="grid grid-cols-4 gap-1">
          {THEME_PRESETS.map((preset) => (
            <Swatch
              active={sameColors(preset.colors, theme.colors)}
              colors={preset.colors}
              key={preset.id}
              name={preset.name}
              onClick={() => setColors(structuredClone(preset.colors))}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Colors</h3>
          <Button
            onClick={() => {
              if (
                isHexColor(theme.colors.background) &&
                isHexColor(theme.colors.primary)
              ) {
                setColors(
                  paletteFrom(theme.colors.background, theme.colors.primary),
                );
              }
            }}
            size="sm"
            title="Derive text and card colors from the background and accent"
            type="button"
            variant="ghost"
          >
            <Wand2 />
            Match colors
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {COLOR_FIELDS.map(({ key, label }) => (
            <ColorInput
              key={key}
              label={label}
              onChange={(value) => {
                const patch: Partial<Colors> = { [key]: value };
                // Keep text on the accent readable while picking the accent.
                if (key === "primary" && isHexColor(value)) {
                  patch.primaryForeground = readableOn(value);
                }
                setColors(patch);
              }}
              value={theme.colors[key]}
            />
          ))}
        </div>
        {lowContrast && (
          <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Some text may be hard to read (contrast{" "}
            {Math.min(textContrast, accentContrast).toFixed(1)}:1). Try "Match
            colors".
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium">Style</h3>
        <SelectField
          label="Font"
          onChange={(font) => set({ font })}
          options={LANDING_FONTS.map((font) => ({
            value: font.id,
            label: font.label,
          }))}
          value={theme.font}
        />
        <SliderField
          label="Corner radius"
          max={32}
          min={0}
          onChange={(radius) => set({ radius })}
          unit="px"
          value={theme.radius}
        />
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium">Background</h3>
        <ChoiceField
          label="Type"
          onChange={(type) => {
            if (type === background.type) return;
            if (type === "gradient") {
              set({
                background: {
                  type,
                  from: theme.colors.background,
                  to: theme.colors.muted,
                  angle: 180,
                },
              });
            } else if (type === "image") {
              set({ background: { type, url: "", overlay: 0.3 } });
            } else {
              set({ background: { type: "solid" } });
            }
          }}
          options={[
            { value: "solid", label: "Solid" },
            { value: "gradient", label: "Gradient" },
            { value: "image", label: "Image" },
          ]}
          value={background.type}
        />
        {background.type === "gradient" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ColorInput
                label="From"
                onChange={(from) =>
                  set({ background: { ...background, from } })
                }
                value={background.from}
              />
              <ColorInput
                label="To"
                onChange={(to) => set({ background: { ...background, to } })}
                value={background.to}
              />
            </div>
            <SliderField
              label="Angle"
              max={360}
              min={0}
              onChange={(angle) =>
                set({ background: { ...background, angle } })
              }
              step={15}
              unit="°"
              value={background.angle}
            />
          </>
        )}
        {background.type === "image" && (
          <>
            <UrlField
              hint="A large photo works best; it covers the whole page."
              label="Image link"
              onChange={(url) => set({ background: { ...background, url } })}
              placeholder="https://example.com/background.jpg"
              value={background.url}
            />
            <SliderField
              label="Darken"
              max={90}
              min={0}
              onChange={(value) =>
                set({ background: { ...background, overlay: value / 100 } })
              }
              step={5}
              unit="%"
              value={Math.round(background.overlay * 100)}
            />
          </>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Logo</h3>
        <ImageField
          hint="Shown small at the top of the page."
          label="Logo image"
          onChange={(logo) =>
            set({
              logo: logo
                ? { url: logo.url, alt: logo.alt || undefined }
                : undefined,
            })
          }
          value={
            theme.logo
              ? { url: theme.logo.url, alt: theme.logo.alt ?? "" }
              : undefined
          }
        />
      </section>
    </div>
  );
}
