import {
  CommandSquare,
  EyeSlash,
  Mouse,
  NotificationBing,
  People,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  type BotCommand,
  BotLandingPage,
} from "@/components/sections/chat-bots/bot-page";
import { DiscordChatMock } from "@/components/sections/chat-bots/chat-mockups";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { createMetadata } from "@/lib/metadata";

// The QRdx bot for Discord (lib/chat-bots/discord), described as content/
// docs/discord-bot.mdx does. Only where the bot is set up (`discordBot`):
// without DISCORD_APPLICATION_ID and DISCORD_PUBLIC_KEY this page is a 404.

export const metadata: Metadata = createMetadata({
  title: "Discord QR Code Generator Bot: Make Codes with /qr",
  description:
    "Add the QRdx bot to a Discord server or your account. /qr turns a link or text into a QR code with PNG and SVG downloads. Free, no QRdx account.",
  path: "/discord",
  ownOgImage: true,
});

const INSTALL_PATH = "/api/integrations/discord/install";

const commands: BotCommand[] = [
  {
    icon: CommandSquare,
    title: "/qr",
    usage: "/qr content:<link or text>",
    description:
      "The bot replies with the code, its content as the title, and Download PNG (1024 px), Download SVG and Open in editor.",
  },
  {
    icon: EyeSlash,
    title: "Private reply",
    usage: "/qr content:<link or text> private:True",
    description:
      "Only you see the reply, and Discord removes it when you dismiss it or reload.",
  },
  {
    icon: Mouse,
    title: "Make QR code",
    usage: "Apps → Make QR code",
    description:
      "Right-click a message (long-press on mobile) for a code of its first web address, or of its text when it has none. Everyone in the chat sees the reply.",
  },
  {
    icon: People,
    title: "Servers and DMs",
    description:
      "Add it to a server so everyone there can use it, or to your own account to use it in DMs, group DMs and the servers you're in.",
  },
  {
    icon: NotificationBing,
    title: "No pings",
    description:
      "Replies never mention or ping anyone, whatever the message says.",
  },
];

const privacyParagraphs = [
  "QRdx doesn't save the codes you make, and the bot can't read your chats. Discord sends QRdx what you type after /qr, or the one message you picked for Make QR code.",
  "The content goes into the image link, and Discord loads the picture from the QRdx image API. Like any link, it can end up in logs and caches, so don't make codes of passwords or other secrets.",
  "To stop one person flooding a channel, QRdx counts the codes each Discord account makes in a minute. The count holds no content and expires after that minute.",
];

const faqs = [
  {
    question: "Do I need a QRdx account?",
    answer:
      "No. The bot is free and works without one. Its codes hold your link or text directly, so they never expire. For a code you can change after printing, with scan analytics, make a dynamic code in QRdx.",
  },
  {
    question: "Should I add it to a server or to my account?",
    answer:
      "On a server, everyone there can use it, and adding it needs the Manage Server permission. On your account, you can use it in DMs, group DMs and the servers you're in. Some servers don't let members' own apps post for everyone, and there, replies from the bot on your account are visible only to you.",
  },
  {
    question: "Why can only I see the reply?",
    answer:
      "Either private was set to True, or the server doesn't let members' own apps post for everyone, so the bot on your account answers only you there.",
  },
  {
    question: "What if my content is too long?",
    answer:
      "Very long content may not fit in one QR code, or may be too long for Discord to show as an image. The bot says so in a message only you can see.",
  },
  {
    question: "What does Open in editor do?",
    answer:
      "It opens the QRdx editor in your browser, where you can change the design and download the code again. A link opens there ready to edit. Text doesn't travel in the editor link, so paste it there yourself.",
  },
  {
    question: "How do I remove the bot?",
    answer:
      "From your account: open User Settings → Authorized Apps and click Deauthorize next to QRdx. From a server: someone with Manage Server opens Server Settings → Integrations, picks QRdx and removes it.",
  },
];

export default function DiscordBotPage() {
  if (!isFeatureAvailable("discordBot")) notFound();

  return (
    <BotLandingPage
      bot="discord"
      title="Make QR codes in Discord"
      intro={[
        "Type /qr with a link or some text and the QRdx bot replies with the QR code and buttons to download it as a PNG or SVG. Any message can become a code too, from its Apps menu.",
        "Add the bot to a server, or to your own account to use it in DMs and group DMs as well.",
      ]}
      action={{
        label: "Add to Discord",
        href: INSTALL_PATH,
        leavesSite: true,
      }}
      note="Free, and you don't need a QRdx account."
      mock={<DiscordChatMock />}
      steps={{
        title: "Add it, then type /qr",
        items: [
          {
            title: "Click Add to Discord",
            body: "Discord asks where to add QRdx: to your own account or to a server.",
          },
          {
            title: "Pick your account or a server",
            body: "On your account, you can use it in DMs, group DMs and the servers you're in. On a server, everyone there can use it; adding it there needs the Manage Server permission.",
          },
          {
            title: "Type /qr",
            body: "Pick /qr from the list, type or paste a link or some text into content, and press Enter.",
          },
        ],
      }}
      commands={{ title: "A command and a message menu", items: commands }}
      privacy={{ title: "What the bot sees", paragraphs: privacyParagraphs }}
      faqs={faqs}
    />
  );
}
