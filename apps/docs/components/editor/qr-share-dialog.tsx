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
import { Copy, Facebook, Share, Sms, Whatsapp } from "iconsax-reactjs";
import { QRCodeSVG } from "qrdx";
import { type ComponentType, useEffect, useState } from "react";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { emitSound } from "@/components/editor/sound";
import { InfoHint } from "@/components/help/info-hint";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";

interface QRShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}

const SAMPLE_VALUE = "https://qrdx.dev";

function shareTargets(url: string, title: string) {
  const link = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  return [
    {
      label: "Post on X",
      Icon: XLogo,
      href: `https://x.com/intent/post?url=${link}&text=${text}`,
    },
    {
      label: "Share on LinkedIn",
      Icon: LinkedinLogo,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${link}`,
    },
    {
      label: "Share on Facebook",
      Icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${link}`,
    },
    {
      label: "Send on WhatsApp",
      Icon: Whatsapp,
      href: `https://wa.me/?text=${text}%20${link}`,
    },
    {
      label: "Send by email",
      Icon: Sms,
      href: `mailto:?subject=${text}&body=${link}`,
    },
  ] satisfies {
    label: string;
    Icon: ComponentType<{ className?: string }>;
    href: string;
  }[];
}

export function QRShareDialog({ open, onOpenChange, url }: QRShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const value = useQREditorStore((state) => state.value);
  const themeState = useQREditorStore((state) => state.themeState);
  const preset = useThemePresetStore((state) =>
    themeState.preset ? state.getPreset(themeState.preset) : undefined,
  );
  const style = themeState.styles;
  const name = preset?.label ?? "My QR design";
  const title = `${name} · a QR code design on QRdx`;

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
      toast.error("Couldn't copy the link");
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
              <ResponsiveDialogTitle>Share this design</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                The link opens this style in the playground, so anyone can use
                it for their own code. Your content isn&apos;t included.
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
                />
              </div>
              <figcaption className="space-y-0.5">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-muted-foreground text-xs">
                  Style preview · opens in the QRdx playground
                </p>
              </figcaption>
            </figure>

            <div className="min-w-0 space-y-6">
              <div>
                <p className="text-muted-foreground mb-2.5 text-xs font-medium">
                  <span id="share-link-label">Link</span>{" "}
                  <InfoHint align="start" id="share-design" />
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-labelledby="share-link-label"
                    className="bg-muted/40 text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
                    onFocus={(event) => event.currentTarget.select()}
                    readOnly
                    value={url}
                  />
                  <Button onClick={handleCopy}>
                    {copied ? <Tick /> : <Copy />}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground mb-2.5 text-xs font-medium">
                  Share to
                </p>
                <div className="flex flex-wrap gap-2">
                  {canShare && (
                    <Button
                      onClick={handleNativeShare}
                      type="button"
                      variant="outline"
                    >
                      <Share />
                      More…
                    </Button>
                  )}
                  {shareTargets(url, title).map((target) => (
                    <TooltipWrapper
                      asChild
                      key={target.label}
                      label={target.label}
                    >
                      <Button asChild size="icon" variant="outline">
                        <a
                          aria-label={target.label}
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
                <div className="grid size-20 shrink-0 place-items-center rounded-[10px] bg-white p-1.5 ring-1 ring-black/5 [&_svg]:h-auto [&_svg]:max-w-full">
                  <QRCodeSVG level="M" size={72} value={url || SAMPLE_VALUE} />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">Open on your phone</p>
                  <p className="text-muted-foreground text-xs text-pretty">
                    Scan this code to open the share link on another device.
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
