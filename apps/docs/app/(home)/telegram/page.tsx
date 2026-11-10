import {
  InfoCircle,
  MessageText,
  People,
  Send2,
  UserOctagon,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  type BotCommand,
  BotLandingPage,
} from "@/components/sections/chat-bots/bot-page";
import { TelegramChatMock } from "@/components/sections/chat-bots/chat-mockups";
import { telegramBotConfig } from "@/lib/chat-bots/telegram/bot";
import { createMetadata } from "@/lib/metadata";

// The QRdx bot in Telegram (lib/chat-bots/telegram), described as content/
// docs/telegram-bot.mdx does. Only where the bot is set up (`telegramBot`);
// its username comes from TELEGRAM_BOT_USERNAME, never from this file.

export const metadata: Metadata = createMetadata({
  title: "Telegram QR Code Bot: Make QR Codes in Any Chat",
  description:
    "Send the QRdx bot on Telegram a link or text and get a QR code back, with PNG and SVG downloads. Inline in any chat, /qr in groups. Free, no account.",
  path: "/telegram",
  ownOgImage: true,
});

const OPEN_PATH = "/api/integrations/telegram/open";

function commands(username: string): BotCommand[] {
  return [
    {
      icon: MessageText,
      title: "Private chat",
      description:
        "Send it in the bot's chat and the code comes back with Download PNG, Download SVG and Open in editor. It holds exactly what you sent, line breaks included.",
    },
    {
      icon: Send2,
      title: "Inline in any chat",
      usage: `@${username} <link or text>`,
      description:
        "Type it in any chat's message field. The code appears above the field after a moment; tap it to send it. The people you're writing to don't need the bot.",
    },
    {
      icon: People,
      title: "Groups",
      usage: "/qr <link or text>",
      description:
        "Add the bot to the group, and it replies to your message with the code. It answers /qr, /start and /help and ignores everything else.",
    },
    {
      icon: UserOctagon,
      title: "Groups with other bots",
      usage: `/qr@${username} <link or text>`,
      description:
        "When a group has more than one bot, or a plain /qr gets no answer, add the bot's username to the command.",
    },
    {
      icon: InfoCircle,
      title: "Help",
      usage: "/help",
      description: "Shows how to use the bot. /start does the same.",
    },
  ];
}

const privacyParagraphs = [
  "QRdx doesn't save what you send the bot or the codes it makes. The bot reads each message only to answer it.",
  "The images are drawn on request. Each one comes from a QRdx link that contains your text, which Telegram fetches to show the code. QRdx doesn't save the text, but like any link, that one can end up in logs and caches, so don't make codes of passwords or other secrets.",
  "Telegram keeps the messages in the chat, as it does for any message. If you make a lot of codes in a short time, the bot asks you to wait a minute before the next one.",
];

function faqs(username: string) {
  return [
    {
      question: "Do I need a QRdx account?",
      answer:
        "No. The bot is free and works without one. Its codes hold your link or text directly, so they never expire. For a code you can change after printing, with scan analytics, make a dynamic code in QRdx.",
    },
    {
      question: "Do the people I'm chatting with need the bot?",
      answer:
        "No. In inline mode you send the code yourself, and the people you're writing to don't need the bot. The buttons under the code work for them too, since they link straight to QRdx.",
    },
    {
      question: "Why doesn't the bot answer in my group?",
      answer: `Bots in groups have privacy mode on by default, and this one keeps it on, so Telegram passes it only commands meant for it and replies to its own messages. Send /qr followed by a link or text. If the group has more than one bot, use /qr@${username} instead.`,
    },
    {
      question: "What if my text is too long?",
      answer:
        "The bot says so. A link to a page with the full text makes a smaller code that's easier to scan.",
    },
    {
      question: "What does Open in editor do?",
      answer:
        "It opens the QRdx editor in your browser, where you can change the design and download the code again. A web address goes along with it. Other text doesn't, so paste it into the editor yourself.",
    },
    {
      question: "How do I remove the bot?",
      answer:
        "In a private chat, open the bot's profile and block it, or delete the chat. In a group, an admin removes the bot from the member list. Codes the bot already sent stay in the chat, and their buttons keep working.",
    },
  ];
}

export default function TelegramBotPage() {
  const config = telegramBotConfig();
  if (!config) notFound();
  const { username } = config;

  return (
    <BotLandingPage
      bot="telegram"
      title="Make QR codes in any Telegram chat"
      intro={[
        `Send the QRdx bot a link or some text and it replies with the QR code, ready to download as a PNG or SVG. In any other chat, type @${username} and a link to send a code there, or add the bot to a group and use /qr.`,
      ]}
      action={{ label: "Open in Telegram", href: OPEN_PATH, leavesSite: true }}
      note="Free, and you don't need a QRdx account."
      mock={<TelegramChatMock username={username} />}
      steps={{
        title: "Open the chat and send a link",
        items: [
          {
            title: "Open the bot",
            body: "Click Open in Telegram, then tap Start. The bot's chat opens in the Telegram app or on the web.",
          },
          {
            title: "Send a link or text",
            body: "The bot replies with the QR code and three buttons: Download PNG, Download SVG and Open in editor.",
          },
          {
            title: "Use it in other chats",
            body: `In any chat, type @${username}, a space and a link, then tap the code to send it. In a group, add the bot and send /qr with a link or text.`,
          },
        ],
      }}
      commands={{
        title: "In private, inline and in groups",
        items: commands(username),
      }}
      privacy={{
        title: "What happens to what you send",
        paragraphs: privacyParagraphs,
      }}
      faqs={faqs(username)}
    />
  );
}
