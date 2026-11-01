"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, Element3 } from "iconsax-reactjs";
import { QRCodeSVG } from "qrdx";
import type * as React from "react";
import { useMemo, useState } from "react";
import {
  AmazonForm,
  AttendanceForm,
  BitcoinForm,
  CalcomForm,
  DubshForm,
  EmailForm,
  EthereumForm,
  EtsyForm,
  FacebookForm,
  FlipkartForm,
  GoogleDriveForm,
  GoogleReviewForm,
  InstagramForm,
  LinkedInForm,
  MapsForm,
  PayPalForm,
  PhoneForm,
  PinterestForm,
  RedditForm,
  SmsForm,
  SnapchatForm,
  SpotifyForm,
  TextForm,
  ThreadsForm,
  TikTokForm,
  TwitterForm,
  UPIForm,
  UrlForm,
  VCardForm,
  VenmoForm,
  WhatsAppForm,
  WifiForm,
  YouTubeForm,
} from "@/components/editor/content-forms";
import { ExampleForm } from "@/components/editor/content-forms/example-form";
import { ContentTypeSelector } from "@/components/editor/content-type-selector";
import {
  DynamicLinkToggle,
  useDynamicCardAtEnd,
} from "@/components/editor/dynamic-link-toggle";
import { ThemeGallery } from "@/components/editor/theme-gallery";
import { seasonalPresetsFirst } from "@/components/seasonal/preset-order";
import { track } from "@/lib/analytics";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import type { ContentType } from "@/types/qr-content";
import { getPresetThemeStyles } from "@/utils/qr-presets-helper";

const FORMS: Record<ContentType, React.ComponentType> = {
  url: UrlForm,
  text: TextForm,
  email: EmailForm,
  phone: PhoneForm,
  sms: SmsForm,
  whatsapp: WhatsAppForm,
  wifi: WifiForm,
  vcard: VCardForm,
  maps: MapsForm,
  facebook: FacebookForm,
  instagram: InstagramForm,
  reddit: RedditForm,
  tiktok: TikTokForm,
  twitter: TwitterForm,
  linkedin: LinkedInForm,
  youtube: YouTubeForm,
  pinterest: PinterestForm,
  snapchat: SnapchatForm,
  threads: ThreadsForm,
  upi: UPIForm,
  paypal: PayPalForm,
  "google-review": GoogleReviewForm,
  venmo: VenmoForm,
  spotify: SpotifyForm,
  bitcoin: BitcoinForm,
  ethereum: EthereumForm,
  etsy: EtsyForm,
  dubsh: DubshForm,
  "google-drive": GoogleDriveForm,
  attendance: AttendanceForm,
  amazon: AmazonForm,
  flipkart: FlipkartForm,
  calcom: CalcomForm,
};

const QUICK_STYLE_COUNT = 8;

/** A row of built-in presets, so a first-time user gets a look in one click. */
function QuickStyles() {
  const presets = useThemePresetStore((store) => store.presets);
  const activePreset = useQREditorStore((state) => state.themeState.preset);
  const applyThemePreset = useQREditorStore((state) => state.applyThemePreset);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const builtIn = useMemo(
    () =>
      Object.entries(presets)
        .filter(([, preset]) => preset.source !== "SAVED")
        .map(([id]) => id),
    [presets],
  );
  const ids = useMemo(
    () =>
      ["default", ...seasonalPresetsFirst(builtIn)].slice(0, QUICK_STYLE_COUNT),
    [builtIn],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Start from a style</h3>
        <Button
          className="text-muted-foreground hover:text-foreground -mr-2 h-7 gap-1 px-2 text-xs"
          onClick={() => setGalleryOpen(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Element3 className="size-3.5" />
          Browse all {builtIn.length}
        </Button>
        <ThemeGallery onOpenChange={setGalleryOpen} open={galleryOpen} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {ids.map((id) => {
          const style = getPresetThemeStyles(id);
          const label =
            id === "default" ? "Default" : (presets[id]?.label ?? id);
          const selected = (activePreset ?? "default") === id;
          return (
            <button
              aria-label={`Apply the ${label} style`}
              aria-pressed={selected}
              className={cn(
                "group bg-card flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-1.5 pb-2 transition-[background-color,border-color,transform] outline-none active:scale-[0.97]",
                "hover:border-foreground/20 hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
                selected && "border-foreground/40 bg-accent/60",
              )}
              key={id}
              onClick={() => {
                applyThemePreset(id);
                track("theme_applied", { method: "preset", preset: id });
                soundEvent("apply");
              }}
              type="button"
            >
              <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-[10px] p-1.5 ring-1 ring-black/5">
                <QRCodeSVG
                  bgColor={style.bgColor}
                  bodyPattern={style.bodyPattern}
                  cornerEyeDotPattern={style.cornerEyeDotPattern}
                  cornerEyePattern={style.cornerEyePattern}
                  dotColor={style.dotColor}
                  eyeColor={style.eyeColor}
                  fgColor={style.fgColor}
                  margin={1}
                  size={56}
                  style={{ maxWidth: "100%", height: "auto" }}
                  value="https://qrdx.dev"
                />
              </span>
              <span
                className={cn(
                  "text-muted-foreground w-full truncate text-center text-[11px] leading-tight font-medium",
                  selected && "text-foreground",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The Content tab: what the code opens (type + form + dynamic link), then a
 * quick look to start from and a hand-off to the Design tab.
 */
export function ContentControls({ onNext }: { onNext?: () => void }) {
  const contentType = useQREditorStore((state) => state.contentType);
  const Form = FORMS[contentType];
  const dynamicCardAtEnd = useDynamicCardAtEnd();

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-5">
        <ContentTypeSelector />
        <ExampleForm Form={Form} key={contentType} type={contentType} />
      </div>

      <div className="space-y-4 border-t pt-5">
        <QuickStyles />
        {onNext && (
          <Button className="w-full" onClick={onNext} variant="outline">
            Fine-tune colors, dots and logo
            <ArrowRight />
          </Button>
        )}
      </div>

      {contentType === "url" && dynamicCardAtEnd && <DynamicLinkToggle />}
    </div>
  );
}
