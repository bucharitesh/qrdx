import { cn } from "@repo/design-system/lib/utils";
import {
  type CatalogLogo,
  getCatalogEntry,
} from "@repo/integrations/src/catalog";
import {
  AddCircle,
  ArrowLeft2,
  ExportSquare,
  Profile,
  Send2,
} from "iconsax-reactjs";
import { QRCodeSVG } from "qrdx";
import type { ReactNode } from "react";
import { QrdxLogo } from "@/components/qrdx-logo";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import { CHAT_MOCK_CODE, CHAT_MOCK_VALUE } from "./mock-code";

// HTML/CSS mockups of a conversation with each QRdx bot. What the bot posts
// (the image, the caption or title, the three buttons and their labels) is
// taken from its reply code: lib/slack-bot/messages.ts, lib/chat-bots/
// telegram/replies.ts and lib/chat-bots/discord/interactions.ts. The chat
// apps around it are only suggested, in the site's own monochrome style.
// Decorative: each window is aria-hidden and the figure has a text caption.

const windowClass =
  "relative overflow-hidden rounded-[14px] border bg-background text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-24px_rgba(0,0,0,0.25)] dark:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]";

function Figure({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure className="@container w-full min-w-0">
      <div aria-hidden="true">{children}</div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

const logoOf = (slug: string): CatalogLogo | undefined =>
  getCatalogEntry(slug)?.logo;

function AppLogo({ slug }: { slug: string }) {
  const logo = logoOf(slug);
  return logo ? <IntegrationLogo logo={logo} size="sm" /> : null;
}

/** The bot's avatar: the QRdx mark on the app's dark tile. */
function BotAvatar({ round = false }: { round?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center bg-neutral-950 ring-1 ring-foreground/10",
        round ? "rounded-full" : "rounded-[8px]",
      )}
    >
      <QrdxLogo className="size-4 fill-white text-white" />
    </span>
  );
}

function PersonAvatar({ round = false }: { round?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center bg-muted text-muted-foreground ring-1 ring-foreground/5",
        round ? "rounded-full" : "rounded-[8px]",
      )}
    >
      <Profile variant="Bold" className="size-4" />
    </span>
  );
}

function AppBadge() {
  return (
    <span className="rounded-[4px] bg-muted px-1 py-px text-[9px] font-semibold tracking-wide text-muted-foreground">
      APP
    </span>
  );
}

/** The code the bot sends, on its white image. */
function QrImage({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "block w-36 overflow-hidden rounded-[8px] bg-white ring-1 ring-black/10 @md:w-44 dark:ring-white/10",
        className,
      )}
    >
      <QRCodeSVG
        {...CHAT_MOCK_CODE}
        aria-hidden="true"
        className="block aspect-square h-auto w-full"
      />
    </span>
  );
}

/** The three links every bot puts under a code. */
const BUTTONS = ["Download PNG", "Download SVG", "Open in editor"] as const;

function LinkText({ children }: { children: ReactNode }) {
  return <span className="break-all text-primary">{children}</span>;
}

function Composer({
  placeholder,
  leading,
}: {
  placeholder: string;
  leading?: ReactNode;
}) {
  return (
    <div className="border-t p-3">
      <div className="flex h-9 items-center gap-2 rounded-[10px] border bg-background px-3 text-[11px] text-muted-foreground">
        {leading}
        <span className="min-w-0 flex-1 truncate">{placeholder}</span>
        <Send2 className="size-4 shrink-0 opacity-60" />
      </div>
    </div>
  );
}

/** A Slack channel: /qr, then the bot's image, context line and buttons. */
export function SlackChatMock() {
  return (
    <Figure caption="Mockup of a Slack channel: someone types /qr https://qrdx.dev and the QRdx bot replies in the channel with the QR code, the link under it, and Download PNG, Download SVG and Open in editor buttons.">
      <div className={windowClass}>
        <div className="flex h-12 items-center gap-2.5 border-b px-3">
          <AppLogo slug="slack" />
          <span className="min-w-0 truncate text-sm font-semibold">
            # launch
          </span>
        </div>

        <div className="flex flex-col gap-5 p-4 @md:p-5">
          <div className="flex gap-3">
            <PersonAvatar />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-semibold">You</span>
              <span className="font-mono text-[12px] text-foreground/90">
                /qr <LinkText>{CHAT_MOCK_VALUE}</LinkText>
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <BotAvatar />
            <div className="flex min-w-0 flex-col gap-2">
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">QRdx</span>
                <AppBadge />
              </span>
              <QrImage />
              <span className="text-[11px] text-muted-foreground">
                {CHAT_MOCK_VALUE}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {BUTTONS.map((label) => (
                  <span
                    key={label}
                    className="flex h-7 items-center rounded-[6px] border bg-background px-2.5 text-[11px] font-medium text-foreground/85"
                  >
                    {label}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        <Composer
          placeholder="Message #launch"
          leading={<AddCircle className="size-4 shrink-0 opacity-60" />}
        />
      </div>
    </Figure>
  );
}

/** The bot's private chat: a link, then the photo, caption and keyboard. */
export function TelegramChatMock({ username }: { username: string }) {
  return (
    <Figure
      caption={`Mockup of a Telegram chat with @${username}: someone sends https://qrdx.dev and the bot replies with the QR code, captioned with the link, and Download PNG, Download SVG and Open in editor buttons.`}
    >
      <div className={windowClass}>
        <div className="flex h-12 items-center gap-2.5 border-b px-3">
          <ArrowLeft2 className="size-4 shrink-0 text-muted-foreground" />
          <BotAvatar round />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">@{username}</span>
            <span className="text-[10px] text-muted-foreground">bot</span>
          </span>
          <AppLogo slug="telegram" />
        </div>

        <div className="flex flex-col gap-3 bg-muted/40 p-4 @md:p-5">
          <span className="ml-auto max-w-[80%] rounded-[14px] rounded-br-[4px] bg-foreground px-3 py-2 font-mono text-[12px] text-background">
            {CHAT_MOCK_VALUE}
          </span>

          <div className="flex max-w-[16rem] flex-col gap-1 @md:max-w-[18.5rem]">
            <div className="flex flex-col gap-2 rounded-[14px] rounded-bl-[4px] border bg-background p-1.5">
              <QrImage className="w-full @md:w-full" />
              <span className="px-1.5 pb-1 text-[11px] text-foreground/85">
                {CHAT_MOCK_VALUE}
              </span>
            </div>
            <span className="grid grid-cols-2 gap-1">
              {BUTTONS.map((label) => (
                <span
                  key={label}
                  className={cn(
                    "relative flex h-8 items-center justify-center rounded-[8px] border bg-background/80 px-2 text-[11px] font-medium text-foreground/85",
                    label === "Open in editor" && "col-span-2",
                  )}
                >
                  {label}
                  <ExportSquare className="absolute top-1 right-1 size-2.5 opacity-50" />
                </span>
              ))}
            </span>
          </div>
        </div>

        <Composer placeholder="Message" />
      </div>
    </Figure>
  );
}

/** A Discord channel: "used /qr", then the embed with the code and buttons. */
export function DiscordChatMock() {
  return (
    <Figure caption="Mockup of a Discord channel: someone uses /qr with https://qrdx.dev and the QRdx bot replies with the link as the title, the QR code, and Download PNG, Download SVG and Open in editor buttons.">
      <div className={windowClass}>
        <div className="flex h-12 items-center gap-2.5 border-b px-3">
          <AppLogo slug="discord-bot" />
          <span className="min-w-0 truncate text-sm font-semibold">
            # general
          </span>
        </div>

        <div className="flex flex-col gap-1.5 p-4 @md:p-5">
          <span className="flex min-w-0 items-center gap-1.5 pl-5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-5 shrink-0 rounded-tl-[6px] border-t-2 border-l-2 border-foreground/15" />
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-muted">
              <Profile variant="Bold" className="size-2.5" />
            </span>
            <span className="truncate">
              You used{" "}
              <span className="rounded-[4px] bg-primary/10 px-1 font-mono text-primary">
                /qr
              </span>
            </span>
          </span>

          <div className="flex gap-3">
            <BotAvatar round />
            <div className="flex min-w-0 flex-col gap-2">
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">QRdx</span>
                <AppBadge />
              </span>
              <div className="flex w-fit max-w-full flex-col gap-2.5 rounded-[6px] border border-l-4 border-l-foreground/25 bg-muted/40 p-3">
                <span className="text-[12px] font-semibold">
                  {CHAT_MOCK_VALUE}
                </span>
                <QrImage />
              </div>
              <span className="flex flex-wrap gap-1.5">
                {BUTTONS.map((label) => (
                  <span
                    key={label}
                    className="flex h-7 items-center gap-1.5 rounded-[6px] bg-muted px-2.5 text-[11px] font-medium text-foreground/85"
                  >
                    {label}
                    <ExportSquare className="size-3 opacity-60" />
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        <Composer
          placeholder="Message #general"
          leading={<AddCircle className="size-4 shrink-0 opacity-60" />}
        />
      </div>
    </Figure>
  );
}
