"use client";

import { track } from "@repo/analytics";
import { toast } from "@repo/design-system";
import { HairlineFigure } from "@repo/design-system/components/hairline/hairline";
import { Spinner as Loader2 } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { Switch } from "@repo/design-system/components/ui/switch";
import { ArrowRight, Import as Download } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { downloadQRCode, QRCode } from "qrdx";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { AmazonForm } from "@/components/editor/content-forms/amazon-form";
import { AttendanceForm } from "@/components/editor/content-forms/attendance-form";
import { BitcoinForm } from "@/components/editor/content-forms/bitcoin-form";
import { CalcomForm } from "@/components/editor/content-forms/calcom-form";
import {
  BitcoinCashForm,
  DogecoinForm,
  LitecoinForm,
  MoneroForm,
  SolanaForm,
} from "@/components/editor/content-forms/crypto-forms";
import { EmailForm } from "@/components/editor/content-forms/email-form";
import { EthereumForm } from "@/components/editor/content-forms/ethereum-form";
import { EtsyForm } from "@/components/editor/content-forms/etsy-form";
import { FacebookForm } from "@/components/editor/content-forms/facebook-form";
import { FlipkartForm } from "@/components/editor/content-forms/flipkart-form";
import { GoogleReviewForm } from "@/components/editor/content-forms/google-review-form";
import { InstagramForm } from "@/components/editor/content-forms/instagram-form";
import {
  BlueskyForm,
  CashAppForm,
  DiscordForm,
  GoogleMeetForm,
  LineForm,
  MastodonForm,
  RevolutForm,
  SignalForm,
  SoundCloudForm,
  TelegramForm,
  TwitchForm,
  WazeForm,
  ZoomForm,
} from "@/components/editor/content-forms/link-forms";
import { LinkedInForm } from "@/components/editor/content-forms/linkedin-form";
import { MapsForm } from "@/components/editor/content-forms/maps-form";
import {
  PayNowForm,
  PixForm,
  PromptPayForm,
  SepaForm,
  VietQrForm,
} from "@/components/editor/content-forms/payment-forms";
import { PayPalForm } from "@/components/editor/content-forms/paypal-form";
import { PhoneForm } from "@/components/editor/content-forms/phone-form";
import { PinterestForm } from "@/components/editor/content-forms/pinterest-form";
import { RedditForm } from "@/components/editor/content-forms/reddit-form";
import { SmsForm } from "@/components/editor/content-forms/sms-form";
import { SnapchatForm } from "@/components/editor/content-forms/snapchat-form";
import { SpotifyForm } from "@/components/editor/content-forms/spotify-form";
import { TextForm } from "@/components/editor/content-forms/text-form";
import { ThreadsForm } from "@/components/editor/content-forms/threads-form";
import { TikTokForm } from "@/components/editor/content-forms/tiktok-form";
import { TwitterForm } from "@/components/editor/content-forms/twitter-form";
import { UPIForm } from "@/components/editor/content-forms/upi-form";
import { UrlForm } from "@/components/editor/content-forms/url-form";
import { VCardForm } from "@/components/editor/content-forms/vcard-form";
import { VenmoForm } from "@/components/editor/content-forms/venmo-form";
import { WhatsAppForm } from "@/components/editor/content-forms/whatsapp-form";
import { WifiForm } from "@/components/editor/content-forms/wifi-form";
import { YouTubeForm } from "@/components/editor/content-forms/youtube-form";
import { InfoHint } from "@/components/help/info-hint";
import { LocaleLink } from "@/components/i18n/locale-link";
import { ServerSnapshot } from "@/components/server-snapshot";
import {
  useTrackEditorOpened,
  useTrackQrGenerated,
} from "@/lib/analytics/react";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { playgroundHref } from "@/lib/playground-links";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { soundEvent } from "@/lib/sound/emit";
import { dubshSchema, googleDriveSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/editor";
import {
  CONTENT_TYPES_METADATA,
  type ContentType,
  type DubshContent,
  type GoogleDriveContent,
  type QRContentConfig,
} from "@/types/qr-content";
import { encodeQRContent } from "@/utils/qr-content-encoder";
import { toPayload } from "./payload";
import { buildQrProps, QUIET_ZONE_MODULES } from "./qr-props";

// Dub and Google Drive editor forms call account APIs on mount, which sign
// anonymous visitors out on 401, so these public pages use a paste-a-link form.
const FORMS: Partial<Record<ContentType, ComponentType>> = {
  amazon: AmazonForm,
  attendance: AttendanceForm,
  bitcoin: BitcoinForm,
  calcom: CalcomForm,
  email: EmailForm,
  ethereum: EthereumForm,
  etsy: EtsyForm,
  facebook: FacebookForm,
  flipkart: FlipkartForm,
  "google-review": GoogleReviewForm,
  instagram: InstagramForm,
  linkedin: LinkedInForm,
  maps: MapsForm,
  paypal: PayPalForm,
  phone: PhoneForm,
  pinterest: PinterestForm,
  reddit: RedditForm,
  sms: SmsForm,
  snapchat: SnapchatForm,
  spotify: SpotifyForm,
  text: TextForm,
  threads: ThreadsForm,
  tiktok: TikTokForm,
  twitter: TwitterForm,
  upi: UPIForm,
  url: UrlForm,
  vcard: VCardForm,
  venmo: VenmoForm,
  whatsapp: WhatsAppForm,
  wifi: WifiForm,
  youtube: YouTubeForm,
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

function LinkOnlyForm({ type }: { type: "dubsh" | "google-drive" }) {
  const t = useTranslations("typeGenerator");
  const stored = useQREditorStore((state) => state.contentConfigs[type]);
  const initial =
    type === "dubsh"
      ? (stored as DubshContent | undefined)?.shortUrl
      : (stored as GoogleDriveContent | undefined)?.url;
  const [link, setLink] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { setContentConfig, setValue } = useQREditorStore.getState();
    const trimmed = link.trim();

    const config: QRContentConfig =
      type === "dubsh"
        ? { type, shortUrl: trimmed, source: "manual" }
        : { type, url: trimmed, source: "manual" };
    const result =
      type === "dubsh"
        ? dubshSchema.safeParse(config)
        : googleDriveSchema.safeParse(config);

    if (trimmed && !result.success) {
      setError(result.error.issues[0]?.message ?? t("invalidLink"));
      return;
    }

    setError(null);
    setContentConfig(type, config);
    setValue(encodeQRContent(config));
  }, [link, type, t]);

  const isDub = type === "dubsh";

  return (
    <div className="space-y-2">
      <Label className="text-xs" htmlFor={`${type}-link`}>
        {t(isDub ? "dubLabel" : "driveLabel")}
      </Label>
      <Input
        id={`${type}-link`}
        type="url"
        placeholder={
          isDub
            ? "https://dub.sh/abc123"
            : "https://drive.google.com/file/d/..."
        }
        value={link}
        onChange={(event) => setLink(event.target.value)}
        className={error ? "border-destructive" : ""}
      />
      {error ? (
        <p className="text-destructive text-[11px]">{error}</p>
      ) : (
        <p className="text-muted-foreground text-[11px]">
          {t(isDub ? "dubHelp" : "driveHelp")}
        </p>
      )}
    </div>
  );
}

function GeneratorSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,20rem)]">
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="aspect-square w-full rounded-xl" />
    </div>
  );
}

// Never left selected in the persisted editor store: in /playground their
// forms call account APIs, and a 401 there signs out and reloads the page.
const LINK_ONLY = new Set<ContentType>(["dubsh", "google-drive"]);

/** WebP is lossless: the PNG's pixels in a smaller file. */
type ImageFormat = "png" | "webp" | "svg";
const IMAGE_FORMATS: ImageFormat[] = ["png", "webp", "svg"];
const IMAGE_FORMAT_LABELS: Record<ImageFormat, string> = {
  png: "PNG",
  webp: "WebP",
  svg: "SVG",
};

const labelFor = (type: ContentType) =>
  CONTENT_TYPES_METADATA.find((meta) => meta.type === type)?.label ?? type;

const ignore = () => undefined;

interface GeneratorPanelProps {
  /** The page's type. */
  type: ContentType;
  /** The form shown: smart paste in the URL and text forms can switch it. */
  activeType: ContentType;
  payload: string;
  styles: QRStyle;
  quietZone: boolean;
  onQuietZoneChange: (quietZone: boolean) => void;
  downloading: ImageFormat | null;
  onDownload: (format: ImageFormat) => void;
  /** Back to the page's own type after smart paste switched it. */
  onBack: () => void;
}

/** The form, the preview and the downloads: live, or the server snapshot. */
function GeneratorPanel({
  type,
  activeType,
  payload,
  styles,
  quietZone,
  onQuietZoneChange,
  downloading,
  onDownload,
  onBack,
}: GeneratorPanelProps) {
  const t = useTranslations("typeGenerator");
  const Form = FORMS[activeType];
  const switched = activeType !== type;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,20rem)]">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        {switched && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs">
            <span>
              {t("detected", { type: labelFor(activeType) })}{" "}
              <LocaleLink
                href={`/qr-code-generator/${activeType}`}
                className="underline underline-offset-2"
              >
                {t("about", { type: labelFor(activeType) })}
              </LocaleLink>
            </span>
            <Button size="sm" variant="outline" onClick={onBack}>
              {t("back", { type: labelFor(type) })}
            </Button>
          </div>
        )}
        {activeType === "dubsh" || activeType === "google-drive" ? (
          <LinkOnlyForm key={activeType} type={activeType} />
        ) : Form ? (
          <Form key={activeType} />
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-5">
        <div
          aria-live="polite"
          className="flex aspect-square w-full max-w-72 items-center justify-center rounded-lg [&_svg]:size-full"
        >
          {payload ? (
            <QRCode
              bgColor={styles.bgColor}
              bodyPattern={styles.bodyPattern}
              cornerEyeDotPattern={styles.cornerEyeDotPattern}
              cornerEyePattern={styles.cornerEyePattern}
              dotColor={styles.dotColor}
              eyeColor={styles.eyeColor}
              fgColor={styles.fgColor}
              hideLogo={!styles.showLogo}
              level={styles.level}
              logo={styles.customLogo ?? DEFAULT_QR_LOGO}
              margin={quietZone ? QUIET_ZONE_MODULES : (styles.margin ?? 0)}
              size={288}
              templateId={styles.templateId}
              value={payload}
              {...styleEngineOptions(styles)}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <HairlineFigure figure="Loupe" className="aspect-square w-28" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          )}
        </div>

        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <Label htmlFor="quiet-zone" className="text-xs">
              {t("quietZone")}
            </Label>
            <InfoHint align="start" id="quiet-zone" />
          </span>
          <Switch
            id="quiet-zone"
            checked={quietZone}
            onCheckedChange={onQuietZoneChange}
          />
        </div>

        <div className="grid w-full grid-cols-3 gap-2">
          {IMAGE_FORMATS.map((format) => (
            <Button
              key={format}
              disabled={!payload || downloading !== null}
              onClick={() => onDownload(format)}
              variant={format === "png" ? "default" : "outline"}
            >
              {downloading === format ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {IMAGE_FORMAT_LABELS[format]}
            </Button>
          ))}
        </div>

        <Button asChild variant="ghost" className="w-full">
          {/* The link names the type; what was typed stays in this browser's
              editor store, never in the address. */}
          <LocaleLink
            href={playgroundHref({
              type: LINK_ONLY.has(activeType) ? "url" : activeType,
            })}
            onClick={() => {
              const store = useQREditorStore.getState();
              // Dub and Drive links are plain URLs, so they open as a URL code.
              if (LINK_ONLY.has(activeType) && payload) {
                store.setContentType("url");
                store.setContentConfig("url", { type: "url", url: payload });
              }
              if (payload && activeType !== "url") store.setValue(payload);
            }}
          >
            {t("customize")}
            <ArrowRight className="size-4" />
          </LocaleLink>
        </Button>

        {payload && (
          <details className="w-full text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {t("showEncoded")}
            </summary>
            <div className="mt-2 flex items-start gap-1 rounded-md bg-muted p-2">
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono">
                {payload}
              </pre>
              <CopyButton textToCopy={payload} />
            </div>
          </details>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          {t("footnote")}
        </p>
      </div>
    </div>
  );
}

/**
 * The generator as the server renders it: the type's empty form and preview
 * in the default style. The browser keeps that markup without hydrating it
 * (ServerSnapshot) until the live generator mounts with this browser's
 * saved content: hydrating the forms from the server's defaults would write
 * those over the saved content.
 */
function GeneratorSnapshot({ type }: { type: ContentType }) {
  const styles = useQREditorStore((state) => state.themeState.styles);
  return (
    <GeneratorPanel
      activeType={type}
      downloading={null}
      onBack={ignore}
      onDownload={ignore}
      onQuietZoneChange={ignore}
      payload=""
      quietZone
      styles={styles}
      type={type}
    />
  );
}

export function TypeGenerator({ type }: { type: ContentType }) {
  const t = useTranslations("typeGenerator");
  const [ready, setReady] = useState(false);
  const [quietZone, setQuietZone] = useState(true);
  const [downloading, setDownloading] = useState<ImageFormat | null>(null);

  const [activeType, setActiveType] = useState<ContentType>(type);

  const config = useQREditorStore((state) => state.contentConfigs[activeType]);
  const value = useQREditorStore((state) => state.value);
  const styles = useQREditorStore((state) => state.themeState.styles);

  // Memoized: the browser must not give the kept markup new props.
  const snapshot = useMemo(
    () => (
      <ServerSnapshot fallback={<GeneratorSkeleton />}>
        <GeneratorSnapshot type={type} />
      </ServerSnapshot>
    ),
    [type],
  );

  // The editor store is persisted in this browser, so starting here hands the
  // same content to /playground when the visitor opens the full editor.
  useEffect(() => {
    if (!LINK_ONLY.has(type)) {
      useQREditorStore.getState().setContentType(type);
    }
    setActiveType(type);
    setReady(true);

    // Smart paste in the URL and text forms can switch the content type.
    let reverting = false;
    return useQREditorStore.subscribe((state, prev) => {
      if (reverting || state.contentType === prev.contentType) return;
      setActiveType(state.contentType);
      if (LINK_ONLY.has(state.contentType)) {
        reverting = true;
        useQREditorStore.setState({ contentType: prev.contentType });
        reverting = false;
      }
    });
  }, [type]);

  useTrackEditorOpened("type_tool");
  useTrackQrGenerated(
    "type_tool",
    activeType,
    activeType === "url" ? value : toPayload(activeType, config),
  );

  if (!ready) return snapshot;

  // URL codes can be bound to a dynamic short link, which lives in `value`.
  const payload =
    activeType === "url" ? value.trim() : toPayload(activeType, config);

  const handleDownload = async (format: ImageFormat) => {
    if (!payload) return;
    setDownloading(format);
    try {
      await downloadQRCode(buildQrProps(payload, styles, { quietZone }), {
        format,
        size: { width: 1024, height: 1024 },
        filename: `${activeType}-qr-code.${format}`,
      });
      soundEvent("download");
      track("qr_downloaded", {
        format,
        source: "type_tool",
        content_type: activeType,
      });
    } catch (error) {
      toast.error(t("downloadFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <GeneratorPanel
      activeType={activeType}
      downloading={downloading}
      onBack={() => {
        setActiveType(type);
        if (!LINK_ONLY.has(type)) {
          useQREditorStore.getState().setContentType(type);
        }
      }}
      onDownload={handleDownload}
      onQuietZoneChange={setQuietZone}
      payload={payload}
      quietZone={quietZone}
      styles={styles}
      type={type}
    />
  );
}
