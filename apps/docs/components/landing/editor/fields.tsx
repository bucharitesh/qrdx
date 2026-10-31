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
import { Switch } from "@repo/design-system/components/ui/switch";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useId } from "react";

// Controlled form fields for landing block editors (any block executor may
// use them). Values are always plain strings/booleans/numbers; schemas
// validate on save and the editor shows the issues.

export function FieldRow({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  multiline,
  rows = 3,
  type = "text",
  inputMode,
  autoComplete = "off",
  hint,
  className,
}: {
  label: ReactNode;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
  type?: "text" | "email" | "tel" | "time";
  inputMode?: "text" | "email" | "tel" | "url" | "numeric";
  autoComplete?: string;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <FieldRow className={className} hint={hint} htmlFor={id} label={label}>
      {multiline ? (
        <Textarea
          className="min-h-0 resize-y"
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          value={value ?? ""}
        />
      ) : (
        <Input
          autoComplete={autoComplete}
          id={id}
          inputMode={inputMode}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value ?? ""}
        />
      )}
    </FieldRow>
  );
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Adds https:// (or mailto:/tel:) to what people usually type. */
export function normalizeLink(input: string, allowActions = false): string {
  const value = input.trim();
  if (!value || SCHEME.test(value)) return value;
  if (allowActions && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) {
    return `mailto:${value}`;
  }
  if (allowActions && /^\+?[0-9 ()./-]{6,}$/.test(value)) {
    return `tel:${value.replace(/[^0-9+]/g, "")}`;
  }
  return `https://${value.replace(/^\/+/, "")}`;
}

export function UrlField({
  label,
  value,
  onChange,
  placeholder = "https://",
  allowActions = false,
  hint,
  className,
}: {
  label: ReactNode;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Also accept email addresses and phone numbers (mailto:/tel:) */
  allowActions?: boolean;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <FieldRow className={className} hint={hint} htmlFor={id} label={label}>
      <Input
        autoCapitalize="off"
        autoComplete="off"
        id={id}
        inputMode="url"
        maxLength={2048}
        onBlur={(event) => {
          const next = normalizeLink(event.target.value, allowActions);
          if (next !== event.target.value) onChange(next);
        }}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        value={value ?? ""}
      />
    </FieldRow>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: {
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <FieldRow className={className} hint={hint} htmlFor={id} label={label}>
      <Select onValueChange={(next) => onChange(next as T)} value={value}>
        <SelectTrigger className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

/** Small set of mutually exclusive options as a segmented control. */
export function ChoiceField<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-xs font-medium" id={id}>
        {label}
      </p>
      <ToggleGroup
        aria-labelledby={id}
        className="flex-wrap"
        onValueChange={(next) => next && onChange(next as T)}
        size="sm"
        type="single"
        value={value}
        variant="outline"
      >
        {options.map((option) => (
          <ToggleGroupItem
            aria-label={option.title}
            className="px-3"
            key={option.value}
            title={option.title}
            value={option.value}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function SwitchField({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <Label className="text-xs font-medium" htmlFor={id}>
          {label}
        </Label>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium" id={id}>
          {label}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        max={max}
        min={min}
        onValueChange={([next]) => next !== undefined && onChange(next)}
        step={step}
        value={[value]}
      />
    </div>
  );
}

export interface ImageValue {
  url: string;
  alt: string;
}

/** Image link + alt text; `value` undefined = no image. */
export function ImageField({
  label,
  value,
  onChange,
  hint,
}: {
  label: ReactNode;
  value: ImageValue | undefined;
  onChange: (value: ImageValue | undefined) => void;
  hint?: ReactNode;
}) {
  const urlId = useId();
  const altId = useId();
  const url = value?.url ?? "";
  const update = (patch: Partial<ImageValue>) => {
    const next = { url, alt: value?.alt ?? "", ...patch };
    onChange(next.url.trim() ? next : undefined);
  };
  return (
    <div className="space-y-2">
      <FieldRow
        hint={hint ?? "Paste a link to a JPG, PNG, WebP or SVG image."}
        htmlFor={urlId}
        label={label}
      >
        <div className="flex items-center gap-2">
          {/^https?:\/\//i.test(url) && (
            <img
              alt=""
              className="bg-muted size-9 shrink-0 rounded-md border object-cover"
              src={url}
            />
          )}
          <Input
            autoCapitalize="off"
            id={urlId}
            inputMode="url"
            maxLength={2048}
            onBlur={(event) => {
              const next = normalizeLink(event.target.value);
              if (next !== event.target.value) update({ url: next });
            }}
            onChange={(event) => update({ url: event.target.value })}
            placeholder="https://example.com/photo.jpg"
            spellCheck={false}
            value={url}
          />
          {value && (
            <Button
              aria-label="Remove image"
              onClick={() => onChange(undefined)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </FieldRow>
      {value && (
        <FieldRow
          hint="Describe the image for people using screen readers."
          htmlFor={altId}
          label="Alt text"
        >
          <Input
            id={altId}
            maxLength={200}
            onChange={(event) => update({ alt: event.target.value })}
            value={value.alt}
          />
        </FieldRow>
      )}
    </div>
  );
}

/** Reorderable list of items (links, phone numbers, ...). */
export function ListEditor<T extends { id: string }>({
  label,
  items,
  onChange,
  create,
  renderItem,
  itemLabel,
  addLabel = "Add",
  max = 50,
}: {
  label?: ReactNode;
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  renderItem: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  itemLabel: (item: T, index: number) => string;
  addLabel?: string;
  max?: number;
}) {
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium">{label}</p>}
      {items.map((item, index) => (
        <div
          className="bg-muted/30 space-y-3 rounded-md border p-3"
          key={item.id}
        >
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs font-medium">
              {itemLabel(item, index)}
            </span>
            <Button
              aria-label="Move up"
              className="size-7"
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ArrowUp />
            </Button>
            <Button
              aria-label="Move down"
              className="size-7"
              disabled={index === items.length - 1}
              onClick={() => move(index, index + 1)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ArrowDown />
            </Button>
            <Button
              aria-label="Remove"
              className="size-7"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
          {renderItem(item, (patch) =>
            onChange(
              items.map((current, i) =>
                i === index ? { ...current, ...patch } : current,
              ),
            ),
          )}
        </div>
      ))}
      <Button
        className="w-full"
        disabled={items.length >= max}
        onClick={() => onChange([...items, create()])}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}
