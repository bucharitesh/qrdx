"use client";

import { track } from "@repo/analytics";
import { CANONICAL_ORIGIN } from "@repo/config";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, Element3 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrdx";
import type * as React from "react";
import { useMemo, useState } from "react";
import {
  AmazonForm,
  AttendanceForm,
  BitcoinCashForm,
  BitcoinForm,
  BlueskyForm,
  CalcomForm,
  CashAppForm,
  DiscordForm,
  DogecoinForm,
  DubshForm,
  EmailForm,
  EthereumForm,
  EtsyForm,
  FacebookForm,
  FlipkartForm,
  GoogleDriveForm,
  GoogleMeetForm,
  GoogleReviewForm,
  InstagramForm,
  LineForm,
  LinkedInForm,
  LitecoinForm,
  MapsForm,
  MastodonForm,
  MoneroForm,
  PayNowForm,
  PayPalForm,
  PhoneForm,
  PinterestForm,
  PixForm,
  PromptPayForm,
  RedditForm,
  RevolutForm,
  SepaForm,
  SignalForm,
  SmsForm,
  SnapchatForm,
  SolanaForm,
  SoundCloudForm,
  SpotifyForm,
  TelegramForm,
  TextForm,
  ThreadsForm,
  TikTokForm,
  TwitchForm,
  TwitterForm,
  UPIForm,
  UrlForm,
  VCardForm,
  VenmoForm,
  VietQrForm,
  WazeForm,
  WhatsAppForm,
  WifiForm,
  YouTubeForm,
  ZoomForm,
} from "@/components/editor/content-forms";
import { ExampleForm } from "@/components/editor/content-forms/example-form";
import { ContentTypeSelector } from "@/components/editor/content-type-selector";
import { ThemeGallery } from "@/components/editor/theme-gallery";
import { seasonalPresetsFirst } from "@/components/seasonal/preset-order";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import type { ContentType } from "@/types/qr-content";
import { getPresetThemeStyles } from "@/utils/qr-presets-helper";

/** Each content type's form (also the Generate tab's content dialog). */
export const FORMS: Record<ContentType, React.ComponentType> = {
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
  // Added 2026-11-11
  pix: PixForm,
  sepa: SepaForm,
  paynow: PayNowForm,
  promptpay: PromptPayForm,
  vietqr: VietQrForm,
  cashapp: CashAppForm,
  revolut: RevolutForm,
  telegram: TelegramForm,
  signal: SignalForm,
  discord: DiscordForm,
  line: LineForm,
  bluesky: BlueskyForm,
  mastodon: MastodonForm,
  twitch: TwitchForm,
  soundcloud: SoundCloudForm,
  zoom: ZoomForm,
  "google-meet": GoogleMeetForm,
  waze: WazeForm,
  litecoin: LitecoinForm,
  dogecoin: DogecoinForm,
  bitcoincash: BitcoinCashForm,
  solana: SolanaForm,
  monero: MoneroForm,
};

const QUICK_STYLE_COUNT = 8;

/** A row of built-in presets, so a first-time user gets a look in one click. */
function QuickStyles() {
  const t = useTranslations("editor.controlSections.contentControls");
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
        <h3 className="text-sm font-medium">{t("startFromAStyle")}</h3>
        <Button
          className="text-muted-foreground hover:text-foreground -mr-2 h-7 gap-1 px-2 text-xs"
          onClick={() => setGalleryOpen(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Element3 className="size-3.5" />
          {t("browseAllLength", { length: builtIn.length })}
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
              aria-label={t("applyTheLabelStyle", { label })}
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
                  value={CANONICAL_ORIGIN}
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
 * The Content tab: what the code opens (type, form and, for a website, the
 * Static/Dynamic choice), then a quick look to start from and a hand-off to
 * the Design tab.
 */
export function ContentControls({ onNext }: { onNext?: () => void }) {
  const t = useTranslations("editor.controlSections.contentControls");
  const contentType = useQREditorStore((state) => state.contentType);
  const Form = FORMS[contentType];

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
            {t("fineTuneColorsDotsAnd")}
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}
