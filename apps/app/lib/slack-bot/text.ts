// What someone typed, as plain text, from Slack's message format: links
// arrive as <https://x|label> or <https://x>, email addresses as
// <mailto:a@b|a@b>, channels, people and groups as <#C…|name>, <@U…> and
// <!subteam^…|@name>, and the characters &, < and > as &amp;, &lt; and &gt;.
// https://api.slack.com/reference/surfaces/formatting#escaping
//
// The bot's own mention (<@BOTID>) is removed, so "@QRdx https://x" reads as
// "https://x". The result goes through readChatQrInput (lib/chat-bots).

/** One Slack <…> token: the part before an optional | and the label after. */
const TOKEN = /<([^<>|]*)(?:\|([^<>]*))?>/g;

/** Replaces Slack's <…> tokens with the text they stand for, then unescapes. */
export function readSlackText(
  text: string | null | undefined,
  botUserId?: string | null,
): string {
  if (!text) return "";
  const read = text.replace(TOKEN, (_, target: string, label?: string) => {
    // Links and email addresses: the address itself.
    if (/^(https?:\/\/|mailto:)/i.test(target)) return target;
    // People: the bot's own mention goes; others stay as written.
    if (target.startsWith("@")) {
      if (botUserId && target.slice(1) === botUserId) return "";
      return label ? `@${label}` : `<${target}>`;
    }
    // Channels: #name.
    if (target.startsWith("#")) return label ? `#${label}` : `<${target}>`;
    // @here, @channel, @everyone, user groups and dates: their label, or
    // the keyword itself.
    if (target.startsWith("!")) {
      if (label) return label;
      const keyword = target.slice(1).split("^", 1)[0] ?? "";
      return /^(here|channel|everyone)$/.test(keyword) ? `@${keyword}` : "";
    }
    return label ?? target;
  });
  return read
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

/**
 * Text for Slack's mrkdwn and notification fields: &, < and > escaped, so
 * nothing someone typed can become a link, a mention or @channel.
 */
export function escapeSlack(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * A command's first word, lowercased, and the rest as typed: "track
 * <https://x>" → { word: "track", rest: "<https://x>" }.
 */
export function splitCommand(text: string): { word: string; rest: string } {
  const trimmed = text.trim();
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  return {
    word: (match?.[1] ?? "").toLowerCase(),
    rest: (match?.[2] ?? "").trim(),
  };
}
