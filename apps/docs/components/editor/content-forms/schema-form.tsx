"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { cn } from "@repo/design-system/lib/utils";
import * as React from "react";
import type { z } from "zod";
import { useQREditorStore } from "@/store/editor-store";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import { encodeQRContent } from "@/utils/qr-content-encoder";
import { useExternalConfigSync } from "./use-external-config-sync";

type Values = Record<string, string | boolean>;

export interface FormOption {
  value: string;
  label: string;
}

/** One field of a content form. */
export interface FormField {
  /** The content field it edits */
  name: string;
  label: string;
  kind?: "text" | "textarea" | "select" | "switch" | "date";
  placeholder?: string;
  /** A line under the field while it has no error */
  hint?: React.ReactNode;
  required?: boolean;
  options?: readonly FormOption[];
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  /** Monospace input, for IBANs, keys and addresses */
  mono?: boolean;
  /** Shown only while this holds for the current values */
  when?: (values: Values) => boolean;
  /** Value for a field the stored config doesn't have yet */
  initial?: string | boolean;
  /** Fields emptied when this one changes (a number typed for another mode) */
  resets?: readonly string[];
}

/**
 * A choice between ways to fill the form (a username or a phone number):
 * it shows only the chosen fields and clears the others when it changes.
 * It isn't content, so it's never stored.
 */
export interface FormModes {
  label: string;
  options: readonly (FormOption & { fields: readonly string[] })[];
}

interface SchemaFormProps {
  type: ContentType;
  /** The type's form schema (lib/validations/qr-content.ts) */
  schema: z.ZodType;
  fields: readonly FormField[];
  modes?: FormModes;
  /** A closing line about what scanning does */
  note?: React.ReactNode;
  /** Extra content under the fields (a notice tied to the design, say) */
  children?: React.ReactNode;
}

function initialValues(
  fields: readonly FormField[],
  stored: QRContentConfig | undefined,
): Values {
  const source = (stored ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    fields.map((field) => {
      const value = source[field.name];
      if (field.kind === "switch") {
        return [
          field.name,
          typeof value === "boolean" ? value : (field.initial ?? false),
        ];
      }
      return [
        field.name,
        typeof value === "string" ? value : (field.initial ?? ""),
      ];
    }),
  ) as Values;
}

/**
 * A content form driven by the type's schema: it shows each field's own
 * error once the field has been touched or holds something, and writes the
 * encoded payload to the editor only while the content is valid. While it
 * isn't, the preview goes back to its sample, so a half-typed payment or
 * address is never drawn or downloaded.
 */
export function SchemaForm({
  type,
  schema,
  fields,
  modes,
  note,
  children,
}: SchemaFormProps) {
  const id = React.useId();
  const stored = useQREditorStore((state) => state.contentConfigs[type]);
  const setValue = useQREditorStore((state) => state.setValue);
  const setContentConfig = useQREditorStore((state) => state.setContentConfig);

  const [values, setValues] = React.useState<Values>(() =>
    initialValues(fields, stored),
  );
  const [touched, setTouched] = React.useState<Set<string>>(() => new Set());
  const [mode, setMode] = React.useState(() => {
    if (!modes) return "";
    const filled = modes.options.find((option) =>
      option.fields.some((name) => {
        const value = (stored as Record<string, unknown> | undefined)?.[name];
        return typeof value === "string" && value.trim() !== "";
      }),
    );
    return (filled ?? modes.options[0])?.value ?? "";
  });

  const markWritten = useExternalConfigSync(stored, (config) =>
    setValues(initialValues(fields, config)),
  );

  const parsed = React.useMemo(
    () => schema.safeParse(values),
    [schema, values],
  );

  React.useEffect(() => {
    if (parsed.success) {
      const config = {
        type,
        ...(parsed.data as object),
      } as QRContentConfig;
      setValue(encodeQRContent(config));
      markWritten(config);
      setContentConfig(type, config);
    } else {
      setValue("");
    }
  }, [parsed, type, setValue, setContentConfig, markWritten]);

  const errors = new Map<string, string>();
  let general: string | undefined;
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") {
        if (!errors.has(field)) errors.set(field, issue.message);
      } else {
        general ??= issue.message;
      }
    }
  }

  const activeFields = modes
    ? new Set(
        modes.options.find((option) => option.value === mode)?.fields ?? [],
      )
    : null;
  const modeFields = new Set(modes?.options.flatMap((option) => option.fields));
  const visible = fields.filter(
    (field) =>
      (!modeFields.has(field.name) || activeFields?.has(field.name)) &&
      (!field.when || field.when(values)),
  );

  const update = (field: FormField, value: string | boolean) => {
    setValues((current) => ({
      ...current,
      ...Object.fromEntries((field.resets ?? []).map((name) => [name, ""])),
      [field.name]: value,
    }));
    setTouched((current) => {
      const next = new Set(current).add(field.name);
      for (const name of field.resets ?? []) next.delete(name);
      return next;
    });
  };

  const changeMode = (next: string) => {
    setMode(next);
    const keep = new Set(
      modes?.options.find((option) => option.value === next)?.fields ?? [],
    );
    setValues((current) =>
      Object.fromEntries(
        Object.entries(current).map(([name, value]) => [
          name,
          modeFields.has(name) && !keep.has(name) ? "" : value,
        ]),
      ),
    );
  };

  const shownError = (field: FormField) => {
    const value = values[field.name];
    const filled = typeof value === "string" && value.trim() !== "";
    return touched.has(field.name) || filled
      ? errors.get(field.name)
      : undefined;
  };

  return (
    <div className="space-y-3">
      {modes && (
        <div className="space-y-2">
          <Label className="text-xs" htmlFor={`${id}-mode`}>
            {modes.label}
          </Label>
          <Select onValueChange={changeMode} value={mode}>
            <SelectTrigger className="w-full" id={`${id}-mode`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modes.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {visible.map((field) => {
        const fieldId = `${id}-${field.name}`;
        const error = shownError(field);
        const describedBy = error || field.hint ? `${fieldId}-help` : undefined;
        const value = values[field.name];

        if (field.kind === "switch") {
          return (
            <div className="space-y-1.5" key={field.name}>
              <div className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors">
                <Label className="cursor-pointer text-xs" htmlFor={fieldId}>
                  {field.label}
                </Label>
                <Switch
                  aria-describedby={describedBy}
                  checked={value === true}
                  id={fieldId}
                  onCheckedChange={(checked) => update(field, checked)}
                />
              </div>
              {field.hint && (
                <p
                  className="text-muted-foreground text-[11px]"
                  id={`${fieldId}-help`}
                >
                  {field.hint}
                </p>
              )}
            </div>
          );
        }

        return (
          <div className="space-y-2" key={field.name}>
            <Label className="text-xs" htmlFor={fieldId}>
              {field.label}
              {field.required ? " *" : ""}
            </Label>
            {field.kind === "select" ? (
              <Select
                onValueChange={(next) => update(field, next)}
                value={typeof value === "string" ? value : ""}
              >
                <SelectTrigger
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(error)}
                  className="w-full"
                  id={fieldId}
                >
                  <SelectValue placeholder={field.placeholder} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {field.options?.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.kind === "textarea" ? (
              <Textarea
                aria-describedby={describedBy}
                aria-invalid={Boolean(error)}
                className="resize-none"
                id={fieldId}
                onChange={(event) => update(field, event.target.value)}
                placeholder={field.placeholder}
                rows={3}
                value={typeof value === "string" ? value : ""}
              />
            ) : (
              <Input
                aria-describedby={describedBy}
                aria-invalid={Boolean(error)}
                autoComplete={field.autoComplete ?? "off"}
                className={cn(field.mono && "font-mono text-[13px]")}
                id={fieldId}
                inputMode={field.inputMode}
                onChange={(event) => update(field, event.target.value)}
                placeholder={field.placeholder}
                spellCheck={false}
                type={field.kind === "date" ? "date" : "text"}
                value={typeof value === "string" ? value : ""}
              />
            )}
            {error ? (
              <p
                className="text-destructive text-[11px]"
                id={`${fieldId}-help`}
              >
                {error}
              </p>
            ) : field.hint ? (
              <p
                className="text-muted-foreground text-[11px] text-pretty"
                id={`${fieldId}-help`}
              >
                {field.hint}
              </p>
            ) : null}
          </div>
        );
      })}

      {general && touched.size > 0 && (
        <p className="text-destructive text-[11px]">{general}</p>
      )}

      {children}

      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  );
}
