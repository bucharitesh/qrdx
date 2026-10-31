"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { cn } from "@repo/design-system/lib/utils";
import { Wand2, X } from "lucide-react";
import { getAllTemplates, QRCodeSVG } from "qrdx";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
} from "qrdx/types";
import {
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createBrandKit, updateBrandKit } from "@/actions/brand-kits";
import { GradientPicker } from "@/components/editor/gradient-picker";
import { BodyPatterns } from "@/components/icons/body-patterns";
import { EyePatterns } from "@/components/icons/eye-patterns";
import { EyeDotPatterns } from "@/components/icons/internal-eye-patterns";
import { patterns as eyeDotPatterns } from "@/components/playground/corner-eye-dot-pattern-selector";
import { patterns as eyePatterns } from "@/components/playground/corner-eye-pattern-selector";
import { patterns as bodyPatterns } from "@/components/playground/pattern-selector";
import { defaultThemeState } from "@/config/qr";
import { MAX_LOGO_FILE_SIZE } from "@/lib/constants";
import { useQREditorStore } from "@/store/editor-store";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import {
  BRAND_KIT_LOGO_TYPES,
  BRAND_KIT_NAME_MAX,
  type BrandKit,
  type BrandKitColors,
  type BrandKitStyle,
  brandKitColorsSchema,
  brandKitStyleSchema,
  isValidLogoDataUrl,
} from "../_lib/brand-kit";
import { BrandKitPreview } from "./brand-kit-preview";

interface FormState {
  name: string;
  logo: string | null;
  colors: BrandKitColors;
  style: BrandKitStyle;
  isDefault: boolean;
}

const defaults = defaultThemeState.styles;
const EMPTY_FORM: FormState = {
  name: "",
  logo: null,
  colors: {
    bgColor: defaults.bgColor,
    fgColor: defaults.fgColor,
    eyeColor: defaults.eyeColor,
    dotColor: defaults.dotColor,
  },
  style: {
    bodyPattern: defaults.bodyPattern,
    cornerEyePattern: defaults.cornerEyePattern,
    cornerEyeDotPattern: defaults.cornerEyeDotPattern,
  },
  isDefault: false,
};

function toForm(kit: BrandKit | null | undefined): FormState {
  if (!kit) return EMPTY_FORM;
  return {
    name: kit.name,
    logo: kit.logo,
    colors: { ...EMPTY_FORM.colors, ...kit.colors },
    style: { ...EMPTY_FORM.style, ...kit.style },
    isDefault: kit.isDefault,
  };
}

/** The design last used in the playground (persisted in this browser). */
function readPlaygroundDesign(): Partial<FormState> {
  const styles = useQREditorStore.getState().themeState.styles;
  const colors = brandKitColorsSchema.safeParse({
    bgColor: styles.bgColor,
    fgColor: styles.fgColor,
    eyeColor: styles.eyeColor,
    dotColor: styles.dotColor,
  });
  const style = brandKitStyleSchema.safeParse({
    bodyPattern: styles.bodyPattern,
    cornerEyePattern: styles.cornerEyePattern,
    cornerEyeDotPattern: styles.cornerEyeDotPattern,
    templateId: styles.templateId,
  });
  const logo =
    styles.showLogo &&
    styles.customLogo &&
    isValidLogoDataUrl(styles.customLogo)
      ? styles.customLogo
      : undefined;
  return {
    ...(colors.success && { colors: { ...EMPTY_FORM.colors, ...colors.data } }),
    ...(style.success && { style: style.data }),
    ...(logo && { logo }),
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      {children}
    </div>
  );
}

function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  renderPreview,
  columns = "grid-cols-4",
}: {
  options: Array<{ id: T; name: string }>;
  value: T | undefined;
  onChange: (value: T) => void;
  renderPreview: (id: T) => ReactNode;
  columns?: string;
}) {
  return (
    <div className={cn("grid gap-2", columns)}>
      {options.map((option) => (
        <button
          aria-label={option.name}
          aria-pressed={value === option.id}
          className={cn(
            "flex flex-col items-center gap-1 rounded-md bg-white p-2 text-black ring-2 transition-all hover:shadow-sm",
            value === option.id
              ? "ring-blue-400"
              : "ring-gray-200 hover:ring-gray-300",
          )}
          key={option.id}
          onClick={() => onChange(option.id)}
          title={option.name}
          type="button"
        >
          <span className="flex size-10 items-center justify-center">
            {renderPreview(option.id)}
          </span>
          <span className="w-full truncate text-center text-[10px]">
            {option.name}
          </span>
        </button>
      ))}
    </div>
  );
}

const NO_TEMPLATE = "__none";

export function BrandKitFormDialog({
  open,
  onOpenChange,
  kit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kit to edit; null/undefined creates a new one */
  kit?: BrandKit | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(kit));
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  const templates = getAllTemplates();

  useEffect(() => {
    if (open) setForm(toForm(kit));
  }, [open, kit]);

  const setColor = (
    key: keyof BrandKitColors,
    value: BrandKitColors[keyof BrandKitColors],
  ) =>
    setForm((prev) => ({ ...prev, colors: { ...prev.colors, [key]: value } }));
  const setStyle = <K extends keyof BrandKitStyle>(
    key: K,
    value: BrandKitStyle[K],
  ) => setForm((prev) => ({ ...prev, style: { ...prev.style, [key]: value } }));

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(BRAND_KIT_LOGO_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Unsupported logo format", {
        description: "Use a PNG, JPG, WebP or SVG image.",
      });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_LOGO_FILE_SIZE) {
      toast.error("Logo is too large", {
        description: `Logos must be ${MAX_LOGO_FILE_SIZE / 1024 / 1024}MB or smaller.`,
      });
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const logo = reader.result;
        setForm((prev) => ({ ...prev, logo }));
      }
    };
    reader.onerror = () => toast.error("Failed to read logo file");
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setForm((prev) => ({ ...prev, logo: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyFromPlayground = () => {
    setForm((prev) => ({ ...prev, ...readPlaygroundDesign() }));
    toast.success("Copied your current playground design");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          name: form.name,
          logo: form.logo,
          colors: form.colors,
          style: form.style,
          isDefault: form.isDefault,
        };
        const result = kit
          ? await updateBrandKit({ ...payload, id: kit.id })
          : await createBrandKit(payload);
        if (!result.ok) {
          toast.error(result.error);
          if (result.upgrade) {
            onOpenChange(false);
            openGetProDialog();
          }
          return;
        }
        toast.success(kit ? "Brand kit updated" : "Brand kit created");
        onOpenChange(false);
        onSaved();
      } catch {
        toast.error("Could not save the brand kit", {
          description: form.logo
            ? "If the logo is large, try a smaller file."
            : "Please try again.",
        });
      }
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form className="space-y-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {kit ? "Edit brand kit" : "New brand kit"}
            </DialogTitle>
            <DialogDescription>
              Save your logo, colors and patterns. Apply the kit to any QR code
              from the playground's Customisations tab.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-[1fr_220px]">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1 space-y-1.5">
                  <Label htmlFor="brand-kit-name">Name</Label>
                  <Input
                    id="brand-kit-name"
                    maxLength={BRAND_KIT_NAME_MAX}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="Acme primary"
                    required
                    value={form.name}
                  />
                </div>
                <Button
                  onClick={copyFromPlayground}
                  type="button"
                  variant="outline"
                >
                  <Wand2 className="size-4" />
                  Copy from playground
                </Button>
              </div>

              <Field label="Logo">
                <div className="flex items-center gap-3">
                  {form.logo && (
                    <div className="relative flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted/30 p-1">
                      <img
                        alt="Brand kit logo"
                        className="max-h-full max-w-full object-contain"
                        src={form.logo}
                      />
                      <button
                        aria-label="Remove logo"
                        className="bg-background absolute -top-2 -right-2 rounded-full border p-0.5"
                        onClick={clearLogo}
                        type="button"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      accept={BRAND_KIT_LOGO_TYPES.join(",")}
                      className="text-xs"
                      onChange={handleLogoUpload}
                      ref={fileInputRef}
                      type="file"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      PNG, JPG, WebP or SVG, up to{" "}
                      {MAX_LOGO_FILE_SIZE / 1024 / 1024}MB. Optional.
                    </p>
                  </div>
                </div>
              </Field>

              <Field label="Colors">
                {/* GradientPicker reads URL state (nuqs) */}
                <Suspense fallback={null}>
                  <div className="space-y-1">
                    <GradientPicker
                      label="Background"
                      name="bgColor"
                      onChange={(value) => setColor("bgColor", value)}
                      value={form.colors.bgColor}
                    />
                    <GradientPicker
                      label="Foreground"
                      name="fgColor"
                      onChange={(value) => setColor("fgColor", value)}
                      value={form.colors.fgColor}
                    />
                    <GradientPicker
                      label="Eyes"
                      name="eyeColor"
                      onChange={(value) => setColor("eyeColor", value)}
                      value={form.colors.eyeColor}
                    />
                    <GradientPicker
                      label="Eye dots"
                      name="dotColor"
                      onChange={(value) => setColor("dotColor", value)}
                      value={form.colors.dotColor}
                    />
                  </div>
                </Suspense>
              </Field>

              <Field label="Dot pattern">
                <OptionGrid<BodyPattern>
                  onChange={(value) => setStyle("bodyPattern", value)}
                  options={bodyPatterns}
                  renderPreview={(id) => <BodyPatterns pattern={id} />}
                  value={form.style.bodyPattern}
                />
              </Field>

              <Field label="Corner eyes">
                <OptionGrid<CornerEyePattern>
                  onChange={(value) => setStyle("cornerEyePattern", value)}
                  options={eyePatterns}
                  renderPreview={(id) => <EyePatterns pattern={id} />}
                  value={form.style.cornerEyePattern}
                />
              </Field>

              <Field label="Eye dots">
                <OptionGrid<CornerEyeDotPattern>
                  onChange={(value) => setStyle("cornerEyeDotPattern", value)}
                  options={eyeDotPatterns}
                  renderPreview={(id) => <EyeDotPatterns pattern={id} />}
                  value={form.style.cornerEyeDotPattern}
                />
              </Field>

              <Field label="Template">
                <OptionGrid<string>
                  columns="grid-cols-3 sm:grid-cols-4"
                  onChange={(value) =>
                    setStyle(
                      "templateId",
                      value === NO_TEMPLATE ? undefined : value,
                    )
                  }
                  options={[
                    { id: NO_TEMPLATE, name: "None" },
                    ...templates.map((t) => ({ id: t.id, name: t.name })),
                  ]}
                  renderPreview={(id) =>
                    id === NO_TEMPLATE ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <QRCodeSVG
                        bgColor="transparent"
                        fgColor="#000000"
                        size={36}
                        templateId={id}
                        value="https://qrdx.dev"
                      />
                    )
                  }
                  value={form.style.templateId ?? NO_TEMPLATE}
                />
              </Field>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm" htmlFor="brand-kit-default">
                    Default kit
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Listed first in the playground's brand kit menu.
                  </p>
                </div>
                <Switch
                  checked={form.isDefault}
                  id="brand-kit-default"
                  onCheckedChange={(value) =>
                    setForm((prev) => ({ ...prev, isDefault: value }))
                  }
                />
              </div>
            </div>

            <div className="md:sticky md:top-0 md:self-start">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Preview</h3>
                <BrandKitPreview
                  className="rounded-lg border bg-white p-3"
                  kit={form}
                  size={196}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending || !form.name.trim()} type="submit">
              {isPending
                ? "Saving..."
                : kit
                  ? "Save changes"
                  : "Create brand kit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
