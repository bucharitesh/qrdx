// The /mcp page's copy that the Markdown version (/mcp.md,
// lib/agents/markdown-pages.ts) repeats, kept in one place.
import {
  Brush2,
  Category,
  ColorSwatch,
  Location,
  MessageText,
  Personalcard,
  ScanBarcode,
  Sms,
  Wifi,
} from "iconsax-reactjs";
import type { CardIcon } from "@/components/sections/tools/cards";

export const MCP_INTRO =
  "MCP (Model Context Protocol) is the open standard that lets AI assistants use outside tools. Connect QRdx once, ask for a QR code in plain words, and get the image back in the chat.";

export const MCP_STEPS: { title: string; body: string }[] = [
  {
    title: "Add the server",
    body: "One command or a few lines of config in Claude, Cursor, VS Code or any other MCP app. No account or API key.",
  },
  {
    title: "Ask your assistant",
    body: "In plain words: the link or details to encode, colors and shape. It picks the right QRdx tool.",
  },
  {
    title: "Get a QR code back",
    body: "A PNG image in the chat, plus SVG, PNG and EPS links ready for Markdown, HTML or print.",
  },
];

export const MCP_TOOLS: {
  name: string;
  title: string;
  description: string;
  icon: CardIcon;
}[] = [
  {
    name: "design_qr",
    title: "Design a QR code",
    description:
      "Any content type (link, Wi-Fi, contact, payment, social and more) with the style your assistant picks: colours and gradients, shapes, a frame with its text, a border. Validates the content like the editor, checks the scan score and repairs the style until it is Great. Returns the score, what changed, the style JSON, a PNG and the SVG.",
    icon: Brush2,
  },
  {
    name: "list_options",
    title: "List design options",
    description:
      "Every value design_qr accepts: content types and their fields, shapes, frames, borders, error correction levels and limits.",
    icon: Category,
  },
  {
    name: "generate_qr_code",
    title: "Generate a QR code",
    description:
      "Renders the code and returns a PNG image plus public SVG, PNG and EPS image URLs ready for Markdown or HTML. Takes the image API options: colors, body, eye and dot shapes, error correction, margin and frame. Set include_svg for the SVG markup.",
    icon: ScanBarcode,
  },
  {
    name: "list_qr_styles",
    title: "List styles",
    description:
      "Body patterns, corner eye and eye dot shapes, frame templates, error correction levels, defaults and limits.",
    icon: ColorSwatch,
  },
  {
    name: "qr_payload_wifi",
    title: "Wi-Fi network",
    description:
      "A WIFI: payload (WPA, WEP or open, optionally hidden) with special characters escaped.",
    icon: Wifi,
  },
  {
    name: "qr_payload_vcard",
    title: "Contact card",
    description:
      "A vCard 3.0 contact: name, organization, title, phones, email, website, address and note.",
    icon: Personalcard,
  },
  {
    name: "qr_payload_email",
    title: "Email",
    description: "A mailto: link with optional cc, bcc, subject and body.",
    icon: Sms,
  },
  {
    name: "qr_payload_sms",
    title: "Text message",
    description:
      "An sms: link with an optional message, or the older SMSTO: form.",
    icon: MessageText,
  },
  {
    name: "qr_payload_geo",
    title: "Map location",
    description: "A geo: location from latitude and longitude.",
    icon: Location,
  },
];

export const MCP_FAQS: { question: string; answer: string }[] = [
  {
    question: "Do I need an account or an API key?",
    answer:
      "No. The QRdx MCP server is public and free. It needs no account or API key and keeps no session state.",
  },
  {
    question: "Which AI tools does it work with?",
    answer:
      "Any MCP app that supports remote servers over Streamable HTTP, such as Claude, ChatGPT (as a custom MCP server, where your plan allows it), Claude Code, Cursor, VS Code, Devin Desktop (formerly Windsurf), Gemini CLI and Codex. Apps that only run local stdio servers can connect through the mcp-remote bridge.",
  },
  {
    question: "Can it add logos or gradients?",
    answer:
      "No. Like the image API, the MCP server renders solid colors only. For logos and gradients, design the code in the QRdx playground or render it with the qrdx React library.",
  },
  {
    question: "Can it create dynamic QR codes?",
    answer:
      "No. The MCP tools render static QR codes and format payloads. Dynamic codes, whose destination you can change later, are created in the QRdx dashboard or with the REST API.",
  },
  {
    question: "Does QRdx store the codes I generate?",
    answer:
      "No. The tools only render images and format text. They don't read or change any QRdx account data, and the server doesn't save the codes. The image URLs it returns contain the encoded data, so don't share them if the data is private, such as a Wi-Fi password.",
  },
  {
    question: "Are there limits?",
    answer:
      "Requests are limited to 120 per minute per IP address. Very long data may not fit in a QR code; the tool then returns an error suggesting a lower error correction level.",
  },
  {
    question: "Can I run it myself?",
    answer:
      "Yes. The MCP server is part of the QRdx web app, so a self-hosted instance serves it at /api/mcp on your own domain.",
  },
];
