import "server-only";

import {
  type ChatQrLinks,
  chatQrCaption,
  chatQrLinks,
} from "@/lib/chat-bots/qr-reply";
import { baseUrl } from "@/lib/metadata";
import { escapeSlack } from "./text";

// The bot's replies, as Slack Block Kit messages. A QR code is an image
// block (the keyless image API's PNG, which Slack fetches itself), a context
// line with the content, and plain link buttons; `text` is the fallback
// notifications show. Everything someone typed is escaped (escapeSlack), so
// it can never ping @channel or turn into a link.
// https://api.slack.com/reference/block-kit/blocks

/** Slack refuses image and button URLs longer than this. */
export const SLACK_URL_MAX = 3000;

type TextObject = { type: "plain_text" | "mrkdwn"; text: string };

export interface SlackMessage {
  text: string;
  blocks?: Record<string, unknown>[];
  /** Slash commands and response URLs: who sees it. */
  response_type?: "in_channel" | "ephemeral";
  replace_original?: boolean;
}

const plain = (text: string): TextObject => ({ type: "plain_text", text });
const mrkdwn = (text: string): TextObject => ({ type: "mrkdwn", text });

const section = (text: string) => ({ type: "section", text: mrkdwn(text) });

const linkButton = (text: string, url: string, actionId: string) => ({
  type: "button",
  text: plain(text),
  url,
  action_id: actionId,
});

/** The help text, also shown for an empty /qr. */
export function helpMessage(): SlackMessage {
  const lines = [
    "*Make a QR code*",
    "`/qr` and a link or any text: a QR code image in this channel.",
    "Mention the bot with a link or text for a code in the thread, or send it a direct message.",
    "On any message, pick *Make a QR code* from its More actions menu for a code of its first link, or of its text.",
    "",
    "*Tracked codes*",
    "`/qr link`: link your QRdx account and pick the workspace your tracked codes go to.",
    "`/qr track` and a link: a dynamic code with scan analytics, in that workspace.",
    "`/qr unlink`: remove the link.",
  ];
  return {
    response_type: "ephemeral",
    text: "Make a QR code with /qr and a link or any text.",
    blocks: [section(lines.join("\n"))],
  };
}

/** A short ephemeral note: errors, confirmations, "working on it". */
export function noteMessage(text: string): SlackMessage {
  return {
    response_type: "ephemeral",
    text,
    blocks: [section(text)],
  };
}

/** A note with one button (link your account, upgrade, open settings). */
export function noteWithButton(
  text: string,
  button: { label: string; url: string; actionId: string },
): SlackMessage {
  return {
    response_type: "ephemeral",
    text,
    blocks: [
      section(text),
      {
        type: "actions",
        elements: [
          {
            ...linkButton(button.label, button.url, button.actionId),
            style: "primary",
          },
        ],
      },
    ],
  };
}

/** True when Slack accepts every URL the message carries. */
function fitsSlack(links: ChatQrLinks): boolean {
  return [links.png, links.svg, links.editor].every(
    (url) => url.length <= SLACK_URL_MAX,
  );
}

/**
 * The QR code for `data`: image, caption and buttons. Null when its links
 * are longer than Slack allows (long text full of characters that need
 * percent-encoding); say so with tooLongForSlack().
 */
export function qrMessage(
  data: string,
  origin: string | URL = baseUrl,
): SlackMessage | null {
  const links = chatQrLinks(data, origin);
  if (!fitsSlack(links)) return null;
  const caption = chatQrCaption(data);
  return {
    response_type: "in_channel",
    text: escapeSlack(`QR code for ${caption}`),
    blocks: [
      {
        type: "image",
        image_url: links.png,
        alt_text: `QR code for ${caption}`,
      },
      {
        type: "context",
        elements: [{ ...mrkdwn(escapeSlack(caption)), verbatim: true }],
      },
      {
        type: "actions",
        elements: [
          linkButton("Download PNG", links.png, "qrdx_png"),
          linkButton("Download SVG", links.svg, "qrdx_svg"),
          linkButton("Open in editor", links.editor, "qrdx_editor"),
        ],
      },
    ],
  };
}

/**
 * A tracked (dynamic) code, for the channel: the image encodes its short
 * link, and the context line shows the short link, the QRdx workspace it
 * was made in and where it goes. The link to the code in the dashboard
 * isn't here (it names the workspace's address and the code's id); only the
 * person who made it gets that, in trackedFollowUp().
 */
export function trackedMessage(
  code: { shortLink: string; destinationUrl: string; workspaceName: string },
  origin: string | URL = baseUrl,
): SlackMessage | null {
  const links = chatQrLinks(code.shortLink, origin);
  if (!fitsSlack(links)) return null;
  const destination = chatQrCaption(code.destinationUrl);
  return {
    response_type: "in_channel",
    text: escapeSlack(`Tracked QR code for ${destination}`),
    blocks: [
      {
        type: "image",
        image_url: links.png,
        alt_text: `Tracked QR code for ${destination}`,
      },
      {
        type: "context",
        elements: [
          {
            ...mrkdwn(
              escapeSlack(
                `Tracked code ${code.shortLink} in the QRdx workspace ${code.workspaceName}, which opens ${destination}`,
              ),
            ),
            verbatim: true,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          linkButton("Download PNG", links.png, "qrdx_png"),
          linkButton("Download SVG", links.svg, "qrdx_svg"),
          linkButton("Open in editor", links.editor, "qrdx_editor"),
        ],
      },
    ],
  };
}

/** After a tracked code: only for the person who made it, its dashboard link. */
export function trackedFollowUp(code: {
  dashboardUrl: string;
  workspaceName: string;
}): SlackMessage {
  const text = escapeSlack(
    `Your tracked code is in ${code.workspaceName}. Only you can see this.`,
  );
  if (code.dashboardUrl.length > SLACK_URL_MAX) return noteMessage(text);
  return noteWithButton(text, {
    label: "Open in QRdx",
    url: code.dashboardUrl,
    actionId: "qrdx_open",
  });
}

/**
 * The direct message after /qr link, so a link the Slack person didn't
 * make can't go unnoticed.
 */
export function linkedNotice(link: {
  email: string;
  workspaceName: string;
}): SlackMessage {
  const text = escapeSlack(
    `Linked to ${link.email} in ${link.workspaceName}. Not you? /qr unlink`,
  );
  return { text, blocks: [section(text)] };
}

export const TOO_LONG_TEXT =
  "That's too long for a QR code. Shorten it, or put the text on a page and make a code of its link.";

/** Content within QR limits whose links are still too long for Slack. */
export function tooLongForSlack(): SlackMessage {
  return noteMessage(
    "That's too long to show as a QR code in Slack. Shorten it, or make the code in the QRdx editor.",
  );
}
