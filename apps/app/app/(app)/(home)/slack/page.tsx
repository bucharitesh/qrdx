import {
  Brush2,
  Chart,
  CommandSquare,
  Link21,
  Messages2,
  MessageText,
  Mouse,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  type BotCommand,
  BotLandingPage,
  type BotStep,
} from "@/components/sections/chat-bots/bot-page";
import { SlackChatMock } from "@/components/sections/chat-bots/chat-mockups";
import { textLinkClass } from "@/components/sections/tools/cards";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { createMetadata } from "@/lib/metadata";

// The QRdx bot for Slack (lib/slack-bot), described as apps/docs/content/docs/
// slack-bot.mdx does. Only where the bot is set up (`slackBot`).

export const metadata: Metadata = createMetadata({
  title: "QR Code Bot for Slack: Make QR Codes with /qr",
  description:
    "Make QR codes in Slack with /qr, a mention, a direct message or a message's menu, with PNG and SVG downloads. Link QRdx for tracked codes.",
  path: "/slack",
  ownOgImage: true,
});

const steps: BotStep[] = [
  {
    title: "Add the bot from QRdx",
    body: "In QRdx, open Settings → Integrations → Slack and click Add the bot to Slack. Any QRdx account can do this, on any plan.",
  },
  {
    title: "Approve it in Slack",
    body: "Pick the Slack workspace and approve. The bot asks to see its slash command, mentions of it and its direct messages, and to post messages.",
  },
  {
    title: "Type /qr in any channel",
    body: "Follow it with a link or any text. Everyone in the Slack workspace can make codes, with or without a QRdx account.",
  },
];

const commands: BotCommand[] = [
  {
    icon: CommandSquare,
    title: "Slash command",
    usage: "/qr <link or text>",
    description:
      "Posts the QR code image in the channel with Download PNG (1024 pixels), Download SVG and Open in editor. /qr on its own, or /qr help, lists the commands.",
  },
  {
    icon: Messages2,
    title: "Mention",
    usage: "@QRdx <link or text>",
    description:
      "Mention the bot in a channel it's in, and the code arrives in the thread.",
  },
  {
    icon: MessageText,
    title: "Direct message",
    description:
      "Send the bot a link or text in its direct messages and it answers there.",
  },
  {
    icon: Mouse,
    title: "Message shortcut",
    usage: "More actions → Make a QR code",
    description:
      "Makes a code of the message's first web address, or of its whole text when it has none. The code goes in the message's thread.",
  },
  {
    icon: Brush2,
    title: "Style a code",
    usage: "/qr <link> --look modern --frame banner-bottom",
    description:
      "Menus under every code change its look, color, frame and logo in place, for the person who made it. Options after the content do the same as you make it. Each styled code passes the editor's scan check first.",
  },
  {
    icon: Link21,
    title: "Link your QRdx account",
    usage: "/qr link",
    description:
      "Sends you a button only you can see. It opens QRdx, where you sign in with Slack to show it's you, pick the QRdx workspace for your tracked codes and confirm. /qr unlink removes the link.",
  },
  {
    icon: Chart,
    title: "Tracked codes",
    usage: "/qr track <link>",
    description:
      "A dynamic code in the workspace you picked, with scan analytics and a destination you can change later. Your role and plan apply, as in the dashboard.",
  },
];

const privacyParagraphs = [
  "The bot reads a message only when someone runs /qr, mentions the bot, messages it directly or uses the shortcut on that message. It never stores message text.",
  "QRdx doesn't save the codes the bot makes, apart from tracked ones. The content travels in the image link, and Slack loads the picture from the QRdx image API, so nothing is uploaded. Like any link, it can end up in logs and caches, so don't make codes of passwords or other secrets.",
  "For each Slack workspace, QRdx keeps the workspace's id and name, the bot's Slack user id, the bot's token (encrypted) and which QRdx account added it. For each linked Slack account, it keeps the Slack user id, your QRdx account and the workspace you picked. A tracked code is saved in that workspace, like a code made in the dashboard.",
];

const faqs = [
  {
    question: "Is the Slack bot free?",
    answer:
      "Yes. Adding it takes a QRdx account, and the free plan is enough. People in your Slack workspace make codes without a QRdx account. Tracked codes count toward the plan of the QRdx workspace they go to, like any dynamic code.",
  },
  {
    question: "What's the difference between /qr and /qr track?",
    answer:
      "/qr puts your link or text straight into the code, so it never expires but can't be changed or counted. /qr track makes a code that holds a short QRdx link which redirects to yours, so QRdx counts its scans and you can change where it goes. It needs a link that starts with https:// or http://, and a linked QRdx account: run /qr link first.",
  },
  {
    question: "Can I change how the code looks?",
    answer:
      "Yes. Pick a look, color, frame or logo from the menus under the code, or add options after your link: /qr qrdx.dev --look modern --fg 0051ff. /qr help lists them. QRdx checks every styled code with the editor's scan score, adjusts it when phones would struggle to read it, and says so under the code.",
  },
  {
    question: "What does Open in editor do?",
    answer:
      "It opens the QRdx editor in your browser with the code's design, where you can change it further and download the code again. A link opens with that link filled in. Text never goes into a link, so paste it there yourself. A logo icon doesn't travel either; pick it again in the editor.",
  },
  {
    question: "Why did only I see the code from the shortcut?",
    answer:
      "When the bot isn't in that channel, only you see the code, with a note to add the app to the channel.",
  },
  {
    question: "Can the same app post scan alerts?",
    answer:
      "Yes. The QRdx Slack app also posts alerts to a channel: scan milestones, form responses and code changes. Alerts are part of the Business plan. Adding the bot doesn't turn alerts on, and adding alerts doesn't add the bot.",
  },
  {
    question: "What if my text is too long for a QR code?",
    answer:
      "You get a short explanation instead of an image, and only you see it. Shorten the text, or put it on a page and make a code of the page's link.",
  },
  {
    question: "How do I remove the bot?",
    answer:
      "In Slack, open the app's page and choose Remove App, or ask a Slack admin to. QRdx then deletes that Slack workspace's bot token and every account link made there. Codes already made stay in QRdx, and tracked codes keep working.",
  },
];

export default function SlackBotPage() {
  if (!isFeatureAvailable("slackBot")) notFound();

  return (
    <BotLandingPage
      bot="slack"
      title="Make QR codes in Slack"
      intro={[
        "Type /qr and a link or any text, and the QRdx bot posts the QR code in the channel with buttons to download it as a PNG or SVG, and menus to change its look, color, frame and logo. You can also mention the bot, message it directly or turn any message into a code.",
        "Link your QRdx account and /qr track makes a tracked code, with scan analytics and a destination you can change after it's printed.",
      ]}
      action={{
        label: "Add to Slack",
        href: "/settings/integrations/slack",
        leavesSite: false,
      }}
      note="Adding the bot takes a free QRdx account. Making codes in Slack doesn't."
      mock={<SlackChatMock />}
      steps={{ title: "Add it once, then type /qr", items: steps }}
      commands={{
        title: "Commands and shortcuts",
        description: (
          <>
            The same Slack app can also post{" "}
            <Link href="/integrations/slack" className={textLinkClass}>
              QRdx alerts
            </Link>{" "}
            to a channel on the Business plan. Each is added on its own.
          </>
        ),
        items: commands,
      }}
      privacy={{
        title: "What the bot reads and keeps",
        paragraphs: privacyParagraphs,
      }}
      faqs={faqs}
    />
  );
}
