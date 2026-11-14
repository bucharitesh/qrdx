"use client";

// "More types" in the builder: every content type a dynamic short link can
// stand in front of (lib/dynamic-content.ts), each with a small form on the
// pure encoders, since the playground's forms write the playground's own
// store. The types that can't be dynamic link to the playground instead.

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { ArrowSwapHorizontal } from "iconsax-reactjs";
import { TypeIconTile } from "@/components/editor/content-type-icons";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import {
  type ContentIssue,
  OTHER_DYNAMIC_TYPES,
  type OtherDynamicType,
  STATIC_ONLY_TYPES,
} from "@/lib/dynamic-content";
import { playgroundHref } from "@/lib/playground-links";
import { CONTENT_TYPES_METADATA, type ContentType } from "@/types/qr-content";

/** One field of a type's form. */
export interface ContentFieldSpec {
  /** The content field (lib/qr-design/content.ts CONTENT_FIELDS) */
  name: string;
  label: string;
  placeholder?: string;
  /** A line under the field */
  hint?: string;
  /** A link at the end of the hint */
  hintLink?: { label: string; href: string };
  optional?: boolean;
  multiline?: boolean;
  inputMode?: "tel" | "url" | "text" | "decimal";
}

const username = (placeholder = "@yourname"): ContentFieldSpec => ({
  name: "username",
  label: "Username",
  placeholder,
});
const link = (
  name: string,
  label: string,
  placeholder: string,
): ContentFieldSpec => ({ name, label, placeholder, inputMode: "url" });

/** The fields each type's form shows, in order. Tests check them against the schemas. */
export const DYNAMIC_TYPE_FIELDS: Record<OtherDynamicType, ContentFieldSpec[]> =
  {
    whatsapp: [
      {
        name: "phoneNumber",
        label: "Phone number",
        placeholder: "+1 202 555 0142",
        hint: "With the country code.",
        inputMode: "tel",
      },
      {
        name: "message",
        label: "Message",
        placeholder: "Hi! Are you open this Sunday?",
        optional: true,
        multiline: true,
      },
    ],
    maps: [
      {
        name: "location",
        label: "Address or coordinates",
        placeholder: "Pike Place Market, Seattle",
      },
    ],
    "google-review": [
      {
        name: "placeId",
        label: "Place ID or review link",
        placeholder: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        hint: "Find yours with the",
        hintLink: {
          label: "Google Place ID Finder",
          href: "https://developers.google.com/maps/documentation/places/web-service/place-id",
        },
      },
    ],
    instagram: [username()],
    facebook: [
      link("profileUrl", "Page or profile link", "https://facebook.com/…"),
    ],
    tiktok: [username()],
    youtube: [
      link("channelUrl", "Channel link", "https://youtube.com/@…"),
      {
        ...link("videoUrl", "Or a video link", "https://youtube.com/watch?v=…"),
        optional: true,
      },
    ],
    linkedin: [
      link(
        "profileUrl",
        "Profile or company link",
        "https://linkedin.com/in/…",
      ),
    ],
    twitter: [username()],
    threads: [username()],
    pinterest: [username("yourname")],
    snapchat: [username("yourname")],
    reddit: [
      { name: "subreddit", label: "Subreddit", placeholder: "r/yoursubreddit" },
      {
        name: "username",
        label: "Or a username",
        placeholder: "u/yourname",
        optional: true,
      },
    ],
    spotify: [link("uri", "Spotify link", "https://open.spotify.com/…")],
    calcom: [link("bookingUrl", "Booking link", "https://cal.com/…")],
    attendance: [link("formUrl", "Google Form link", "https://forms.gle/…")],
    "google-drive": [
      link("url", "Drive file or folder link", "https://drive.google.com/…"),
    ],
    paypal: [link("paypalUrl", "PayPal.me link", "https://paypal.me/…")],
    venmo: [
      username("@your-name"),
      {
        name: "amount",
        label: "Amount",
        placeholder: "12.50",
        optional: true,
        inputMode: "decimal",
      },
      { name: "note", label: "Note", placeholder: "Lunch", optional: true },
    ],
    etsy: [link("shopUrl", "Shop link", "https://etsy.com/shop/…")],
    amazon: [link("productUrl", "Product link", "https://amazon.com/dp/…")],
    flipkart: [link("productUrl", "Product link", "https://flipkart.com/…")],
    // Added 2026-11-11
    telegram: [
      {
        name: "username",
        label: "Username, channel or group",
        placeholder: "@username or t.me link",
      },
      {
        name: "phoneNumber",
        label: "Or a phone number",
        placeholder: "+1 202 555 0142",
        hint: "With the country code.",
        optional: true,
        inputMode: "tel",
      },
    ],
    signal: [
      {
        name: "phoneNumber",
        label: "Phone number",
        placeholder: "+1 202 555 0142",
        hint: "With the country code.",
        inputMode: "tel",
      },
      {
        ...link(
          "link",
          "Or a username or group link",
          "https://signal.me/#eu/…",
        ),
        optional: true,
      },
    ],
    line: [
      {
        name: "username",
        label: "LINE ID",
        placeholder: "your-line-id or @official",
      },
    ],
    discord: [
      {
        name: "invite",
        label: "Invite link or code",
        placeholder: "discord.gg/…",
        hint: "Use an invite set to never expire.",
      },
    ],
    bluesky: [
      { name: "handle", label: "Handle", placeholder: "yourname.bsky.social" },
    ],
    mastodon: [
      { name: "handle", label: "Handle", placeholder: "@you@mastodon.social" },
    ],
    twitch: [username("yourchannel")],
    soundcloud: [
      {
        name: "username",
        label: "Profile name or link",
        placeholder: "yourname",
      },
    ],
    zoom: [
      {
        name: "meeting",
        label: "Meeting ID or invite link",
        placeholder: "123 4567 8901",
      },
    ],
    "google-meet": [
      {
        name: "meeting",
        label: "Meeting code or link",
        placeholder: "abc-defg-hij",
      },
    ],
    waze: [
      {
        name: "location",
        label: "Address or coordinates",
        placeholder: "Pike Place Market, Seattle",
      },
    ],
    cashapp: [
      { name: "username", label: "$Cashtag", placeholder: "$yourcashtag" },
    ],
    revolut: [username("@yourname")],
  };

const META = new Map(CONTENT_TYPES_METADATA.map((meta) => [meta.type, meta]));

export function contentTypeMeta(type: ContentType) {
  return META.get(type);
}

/** Starting values for a type's form: every field, empty. */
export function emptyContentValues(
  type: OtherDynamicType,
): Record<string, string> {
  return Object.fromEntries(
    DYNAMIC_TYPE_FIELDS[type].map((field) => [field.name, ""]),
  );
}

/** The grid of types, then the static-only ones as playground links. */
export function DynamicTypePicker({
  onPick,
}: {
  onPick: (type: OtherDynamicType) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {OTHER_DYNAMIC_TYPES.map((type) => {
          const meta = contentTypeMeta(type);
          return (
            <button
              className="hover:bg-muted/60 focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors outline-none focus-visible:ring-[3px]"
              key={type}
              onClick={() => onPick(type)}
              type="button"
            >
              <TypeIconTile icon={meta?.icon} type={type} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {meta?.label ?? type}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {meta?.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="bg-muted/40 space-y-2 rounded-lg p-3">
        <p className="text-muted-foreground text-xs leading-relaxed">
          These are written into the code itself, so they can't change after
          printing. Make them as static codes in the playground.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STATIC_ONLY_TYPES.map((type) => (
            <Button
              asChild
              className="h-7 rounded-full px-2.5 text-xs"
              key={type}
              size="sm"
              variant="outline"
            >
              <Link href={playgroundHref({ type })}>
                {contentTypeMeta(type)?.label ?? type}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A type's form, its "Change" button and what the code will open. */
export function DynamicTypeFields({
  type,
  values,
  onChange,
  onChangeType,
  issues,
  showIssues,
  destination,
  error,
  disabled,
  autoFocus,
}: {
  type: OtherDynamicType;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onChangeType: () => void;
  /** What's wrong with the content as typed */
  issues: ContentIssue[];
  /** Typed or submitted: say what's wrong */
  showIssues: boolean;
  /** The web address the code opens, once the content is complete */
  destination: string | null;
  /** The server refused the destination (e.g. an unsafe site) */
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const meta = contentTypeMeta(type);
  const fields = DYNAMIC_TYPE_FIELDS[type];
  const fieldNames = new Set(fields.map((field) => field.name));
  const issueFor = (name: string) =>
    showIssues
      ? issues.find((issue) => issue.field === name)?.message
      : undefined;
  // An either-or rule (YouTube, Reddit) or the http(s) check has no field.
  const general =
    error ??
    (showIssues
      ? issues.find((issue) => !(issue.field && fieldNames.has(issue.field)))
          ?.message
      : undefined);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <TypeIconTile icon={meta?.icon} type={type} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{meta?.label ?? type}</p>
          <p className="text-muted-foreground truncate text-xs">
            {meta?.description}
          </p>
        </div>
        <Button
          disabled={disabled}
          onClick={onChangeType}
          size="sm"
          type="button"
          variant="outline"
        >
          <ArrowSwapHorizontal aria-hidden />
          Change
        </Button>
      </div>

      {fields.map((field, index) => {
        const id = `code-builder-content-${field.name}`;
        const message = issueFor(field.name);
        const describedBy = message
          ? `${id}-error`
          : field.hint
            ? `${id}-hint`
            : undefined;
        const common = {
          "aria-describedby": describedBy,
          "aria-invalid": message ? true : undefined,
          autoFocus: autoFocus && index === 0,
          disabled,
          id,
          maxLength: field.multiline ? 1000 : 2048,
          onChange: (
            event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => onChange(field.name, event.target.value),
          placeholder: field.placeholder,
          value: values[field.name] ?? "",
        };
        return (
          <div className="space-y-1.5" key={field.name}>
            <Label htmlFor={id}>
              {field.label}
              {field.optional && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (optional)
                </span>
              )}
            </Label>
            {field.multiline ? (
              <Textarea {...common} rows={3} />
            ) : (
              <Input {...common} inputMode={field.inputMode} />
            )}
            {message ? (
              <p className="text-destructive text-xs" id={`${id}-error`}>
                {message}
              </p>
            ) : field.hint ? (
              <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
                {field.hint}
                {field.hintLink && (
                  <>
                    {" "}
                    <a
                      className="underline underline-offset-2"
                      href={field.hintLink.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {field.hintLink.label}
                    </a>
                    .
                  </>
                )}
              </p>
            ) : null}
          </div>
        );
      })}

      {general ? (
        <p className="text-destructive text-xs" role="alert">
          {general}
        </p>
      ) : destination ? (
        <p className="text-muted-foreground text-xs break-all">
          Opens {destination}
        </p>
      ) : null}
    </div>
  );
}
