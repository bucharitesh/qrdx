"use client";

import { toast } from "@repo/design-system";
import {
  LinkedinLogo,
  Tick,
  XLogo,
} from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { cn } from "@repo/design-system/lib/utils";
import { Copy, Share, Sms } from "iconsax-reactjs";
import { useFormatter, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrdx";
import { type ComponentType, useEffect, useState } from "react";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { emitSound } from "@/components/editor/sound";
import { InfoHint } from "@/components/help/info-hint";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { brandIcon } from "@/lib/brand-logos/brand-logo";
import type { OmittedPart } from "@/lib/playground-style";
import { styleSvgOptions } from "@/lib/qr-design/engine-options";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";

interface QRShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  /** Parts of the design the link leaves out (a style link never carries a logo or art) */
  omitted?: OmittedPart[];
  /** For a style link: save the design as a theme instead, for a short link */
  onSaveAsTheme?: () => void;
}

/** "Your logo and the art aren't in the link." */
function useOmittedNote(parts: OmittedPart[]): string | null {
  const t = useTranslations("editor.qrShareDialog");
  const format = useFormatter();
  if (parts.length === 0) return null;
  const list = format.list(parts.map((part) => t(`omitted.${part}`)));
  const note = t("omittedNote", { count: parts.length, list });
  return `${note.charAt(0).toUpperCase()}${note.slice(1)}`;
}

const SAMPLE_VALUE = "https://qrdx.dev";

// Real marks, filling the box like the X and LinkedIn logos beside them.
const FacebookMark = brandIcon("facebook", { inset: 0 });
const WhatsappMark = brandIcon("whatsapp", { inset: 0 });

function shareTargets(url: string, title: string) {
  const link = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  return [
    {
      id: "x",
      Icon: XLogo,
      href: `https://x.com/intent/post?url=${link}&text=${text}`,
    },
    {
      id: "linkedin",
      Icon: LinkedinLogo,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${link}`,
    },
    {
      id: "facebook",
      Icon: FacebookMark,
      href: `https://www.facebook.com/sharer/sharer.php?u=${link}`,
    },
    {
      id: "whatsapp",
      Icon: WhatsappMark,
      href: `https://wa.me/?text=${text}%20${link}`,
    },
    {
      id: "email",
      Icon: Sms,
      href: `mailto:?subject=${text}&body=${link}`,
    },
  ] as const satisfies readonly {
    /** Its name: editor.qrShareDialog.targets.<id>. */
    id: string;
    Icon: ComponentType<{ className?: string }>;
    href: string;
  }[];
}

export function QRShareDialog({
  open,
  onOpenChange,
  url,
  omitted = [],
  onSaveAsTheme,
}: QRShareDialogProps) {
  const t = useTranslations("editor.qrShareDialog");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const value = useQREditorStore((state) => state.value);
  const themeState = useQREditorStore((state) => state.themeState);
  const preset = useThemePresetStore((state) =>
    themeState.preset ? state.getPreset(themeState.preset) : undefined,
  );
  const style = themeState.styles;
  const name = preset?.label ?? t("myQrDesign");
  const note = useOmittedNote(omitted);
  const longLink = url.length > 120;
  const title = t("shareTitle", { name });

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      emitSound("copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("couldntCopyTheLink"));
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      // Cancelled by the user, or not allowed here.
    }
  };

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-2xl dark:!border-border">
        <div className="flex max-h-[inherit] min-h-0 flex-col">
          <ResponsiveDialogHeader className="flex-row items-start gap-3 px-6 pt-1 pb-0 text-left sm:pt-6">
            <div className="min-w-0 flex-1 space-y-1">
              <ResponsiveDialogTitle>
                {t("shareThisDesign")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {t("theLinkOpensThisStyle")}
              </ResponsiveDialogDescription>
            </div>
            <DialogCloseButton className="-mt-1 -mr-2 hidden sm:inline-flex" />
          </ResponsiveDialogHeader>

          <div className="grid min-h-0 gap-6 overflow-y-auto px-6 py-6 sm:grid-cols-[12.5rem_1fr]">
            <figure className="m-0 flex flex-col gap-4">
              <div className="mx-auto grid aspect-square w-full max-w-36 place-items-center overflow-hidden rounded-[14px] border bg-white p-3 sm:max-w-none [&_svg]:h-auto [&_svg]:max-w-full">
                <QRCodeSVG
                  bgColor={style.bgColor}
                  bodyPattern={style.bodyPattern}
                  cornerEyeDotPattern={style.cornerEyeDotPattern}
                  cornerEyePattern={style.cornerEyePattern}
                  dotColor={style.dotColor}
                  eyeColor={style.eyeColor}
                  fgColor={style.fgColor}
                  frame={style.frame}
                  level={style.level}
                  margin={style.margin}
                  size={220}
                  templateId={style.templateId}
                  value={value || SAMPLE_VALUE}
                  {...styleSvgOptions(style)}
                />
              </div>
              <figcaption className="space-y-0.5">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-muted-foreground text-xs">
                  {t("stylePreviewOpensInThe")}
                </p>
              </figcaption>
            </figure>

            <div className="min-w-0 space-y-6">
              <div>
                <p className="text-muted-foreground mb-2.5 text-xs font-medium">
                  <span id="share-link-label">{t("link")}</span>{" "}
                  <InfoHint align="start" id="share-design" />
                </p>
                <div className="flex flex-col gap-2">
                  <Input
                    aria-labelledby="share-link-label"
                    className="bg-muted/40 text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
                    onFocus={(event) => event.currentTarget.select()}
                    readOnly
                    value={url}
                  />
                  <Button onClick={handleCopy}>
                    {copied ? <Tick /> : <Copy />}
                    {copied ? t("copied") : t("copyLinkToThisDesign")}
                  </Button>
                </div>
                {(note || onSaveAsTheme) && (
                  <p className="text-muted-foreground mt-2 text-xs text-pretty">
                    {note}
                    {note && onSaveAsTheme && " "}
                    {onSaveAsTheme && (
                      <button
                        className="hover:text-foreground underline underline-offset-2"
                        onClick={onSaveAsTheme}
                        type="button"
                      >
                        {note ? t("saveItAsATheme") : t("saveItAsATheme2")}
                      </button>
                    )}
                  </p>
                )}
              </div>

              <div>
                <p className="text-muted-foreground mb-2.5 text-xs font-medium">
                  {t("shareTo")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {canShare && (
                    <Button
                      onClick={handleNativeShare}
                      type="button"
                      variant="outline"
                    >
                      <Share />
                      {t("more")}
                    </Button>
                  )}
                  {shareTargets(url, title).map((target) => (
                    <TooltipWrapper
                      asChild
                      key={target.id}
                      label={t(`targets.${target.id}`)}
                    >
                      <Button asChild size="icon" variant="outline">
                        <a
                          aria-label={t(`targets.${target.id}`)}
                          href={target.href}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <target.Icon className="size-4" />
                        </a>
                      </Button>
                    </TooltipWrapper>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                {/* A style link is long: a bigger, lower-density code so a
                    phone can still read it off the screen. */}
                <div
                  className={cn(
                    "grid shrink-0 place-items-center rounded-[10px] bg-white p-1.5 ring-1 ring-black/5 [&_svg]:h-auto [&_svg]:max-w-full",
                    longLink ? "size-28" : "size-20",
                  )}
                >
                  <QRCodeSVG
                    level={longLink ? "L" : "M"}
                    size={longLink ? 100 : 72}
                    value={url || SAMPLE_VALUE}
                  />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{t("openOnYourPhone")}</p>
                  <p className="text-muted-foreground text-xs text-pretty">
                    {t("scanThisCodeToOpen")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
