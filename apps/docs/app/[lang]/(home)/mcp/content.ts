// The /mcp page's copy that the Markdown version (/mcp.md,
// lib/agents/markdown-pages.ts) repeats, kept in one place.
import {
  ArchiveAdd,
  Bank,
  Barcode,
  Brush2,
  Category,
  Coffee,
  ColorSwatch,
  DocumentDownload,
  type Icon,
  Location,
  MessageText,
  People,
  Personalcard,
  Save2,
  ScanBarcode,
  SearchNormal1,
  Sms,
  TableDocument,
  TicketStar,
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
    body: "A PNG image in the chat, plus SVG, PNG, WebP and EPS links ready for Markdown, HTML or print. Apps that support MCP Apps also show the code as a card you can save or open in the editor.",
  },
];

export const MCP_TOOLS: {
  name: string;
  title: string;
  description: string;
  icon: CardIcon;
  /**
   * Needs a QRdx API key on the connection. The rest work without one
   * (tests/api/mcp.test.ts checks this against the registered tools).
   */
  needsKey?: true;
}[] = [
  {
    name: "design_qr",
    title: "Design a QR code",
    description:
      "Any content type (link, Wi-Fi, contact, payment, social and more) with the style your assistant picks: colours and gradients, shapes, a frame with its text or a community frame, a border, a logo icon. Can start from a built-in theme or a community item. Validates the content like the editor, checks the scan score and repairs the style until it is Great. Returns the score, what changed, the style JSON, a playground link, a PNG and the SVG.",
    icon: Brush2,
  },
  {
    name: "list_options",
    title: "List design options",
    description:
      "Every value design_qr accepts: content types and their fields, shapes, frames, borders, logo icons, built-in themes, error correction levels and limits.",
    icon: Category,
  },
  {
    name: "generate_qr_code",
    title: "Generate a QR code",
    description:
      "Renders the code and returns a PNG image plus public SVG, PNG, WebP and EPS image URLs ready for Markdown or HTML. Takes the image API options: colors or gradients, body, eye and dot shapes, error correction, margin, a border, a frame and a logo icon, or a whole style from design_qr. Set include_svg for the SVG markup.",
    icon: ScanBarcode,
  },
  {
    name: "search_community",
    title: "Search the community",
    description:
      "Finds community frames and themes, free under CC0, by words, type or tag. Item text is written by members and comes back short, without links.",
    icon: SearchNormal1,
  },
  {
    name: "get_community_item",
    title: "Get a community item",
    description:
      "One frame or theme with the style it applies, ready to pass to design_qr or generate_qr_code.",
    icon: People,
  },
  {
    name: "save_template",
    title: "Save as a theme",
    description:
      "Saves a design as a theme in your workspace, under the plan's saved-theme limit. Needs a QRdx API key on the connection; every other tool works without one.",
    icon: Save2,
    needsKey: true,
  },
  {
    name: "generate_barcode",
    title: "Generate a barcode",
    description:
      "EAN-13, UPC-A, UPC-E, EAN-8, ITF-14, GS1-128, Code 128, Code 39, Data Matrix, PDF417 or Aztec. Checks the value (check digits, lengths, characters) and returns a PNG plus public SVG, PNG, PDF and other image URLs.",
    icon: Barcode,
  },
  {
    name: "save_barcode",
    title: "Save a barcode",
    description:
      "Keeps a barcode in your workspace's Barcodes to edit and download later. Needs a QRdx API key on the connection.",
    icon: ArchiveAdd,
    needsKey: true,
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
  {
    name: "qr_payload_payment",
    title: "Bank payment",
    description:
      "A Pix, SEPA transfer, PayNow, PromptPay or VietQR payment code, checked like the playground's forms.",
    icon: Bank,
  },
];

export const MCP_FAQS: { question: string; answer: string }[] = [
  {
    question: "Can Claude make a QR code?",
    answer:
      "Yes, with the QRdx MCP server connected. A language model can't work out a QR code's pattern in its head, so a code it draws on its own rarely scans. Connected to QRdx, Claude calls a tool that renders a real, standard code and shows it in the chat. Add the server URL as a custom connector in Claude, or run the claude mcp add command in Claude Code; ChatGPT, Cursor and VS Code connect the same way.",
  },
  {
    question: "Is the QRdx MCP server free?",
    answer:
      "Yes. It's free and open source, and designing, rendering and checking codes needs no account. The codes it makes are static, so they never expire and have no scan limits.",
  },
  {
    question: "Does it need an API key?",
    answer:
      "No, for designing and rendering codes and browsing the community: the QRdx MCP server is public and free, and it keeps no session state. Saving a design to your themes (save_template), saving a barcode (save_barcode) and using a logo you uploaded need a QRdx API key, sent as Authorization: Bearer qrdx_… in your app's settings for the server.",
  },
  {
    question: "Which AI tools does it work with?",
    answer:
      "Any MCP app that supports remote servers over Streamable HTTP, such as Claude, ChatGPT (as a custom MCP server, where your plan allows it), Claude Code, Cursor, VS Code, Devin Desktop (formerly Windsurf), Gemini CLI and Codex. Apps that only run local stdio servers can connect through the mcp-remote bridge.",
  },
  {
    question: "Can it add logos or gradients?",
    answer:
      "Yes. Linear and radial gradients, frames and borders work without a key, and so do the quick logo icons (Wi-Fi, link, phone and others). A logo you uploaded to QRdx works by its file id with your API key. QRdx never fetches a logo from a web address. Logo QR and Image QR art are made in the playground.",
  },
  {
    question: "Can it create dynamic QR codes?",
    answer:
      "No. The MCP tools render static QR codes and format payloads. Dynamic codes, whose destination you can change later, are created in the QRdx dashboard or with the REST API.",
  },
  {
    question: "Does the code show up in the chat?",
    answer:
      "design_qr and generate_qr_code return the code as a PNG image, so apps that display images show it in the chat. Apps that support MCP Apps also show a QR card: the code, what it encodes (for Wi-Fi, the network name, never the password), its size or scan score, an Open in editor button, and PNG and SVG buttons where the app can save or open them. Apps without MCP Apps get the same text and image as before.",
  },
  {
    question: "Does QRdx store the codes I generate?",
    answer:
      "No. The tools render images, format text and read the public community. Only save_template and save_barcode write anything: the theme or barcode you ask them to save, in the API key's workspace. The server doesn't save the codes. The image URLs it returns contain the encoded data, so don't share them if the data is private, such as a Wi-Fi password.",
  },
  {
    question: "Are there limits?",
    answer:
      "Requests are limited to 120 per minute per IP address, and design_qr to 20. Calls with an API key also count toward the workspace's daily API quota. Very long data may not fit in a QR code; the tool then returns an error suggesting a lower error correction level.",
  },
  {
    question: "Is it in the MCP Registry?",
    answer:
      "Yes. The hosted server is listed in the official MCP Registry as io.github.bucharitesh/qrdx, so apps and directories that read the registry can find it there.",
  },
  {
    question: "Can I run it myself?",
    answer:
      "Yes. The MCP server is part of the QRdx web app, so a self-hosted instance serves it at /api/mcp on your own domain.",
  },
];

export interface McpPrompt {
  title: string;
  prompt: string;
  icon: Icon;
}

/** Only things the QRdx MCP tools really do: render codes and build payloads. */
export const MCP_PROMPTS: McpPrompt[] = [
  {
    title: "Café menu",
    prompt:
      "Make a QR code for https://example.com/menu in black and gold, #c9a227 on #111111, with rounded modules, for our café tables.",
    icon: Coffee,
  },
  {
    title: "Guest Wi-Fi card",
    prompt:
      "Create a Wi-Fi QR code for the network Guest with the WPA password welcome-2026, ready to print on a card for our front desk.",
    icon: Wifi,
  },
  {
    title: "Business card",
    prompt:
      "Make a contact QR code for Ada Lovelace, CTO at Example Inc, +1 555 0100, ada@example.com, in our brand blue #155dfc.",
    icon: Personalcard,
  },
  {
    title: "Event check-in",
    prompt:
      "Create a QR code for https://example.com/checkin/conf-2026 with high error correction, so it still scans from a printed badge.",
    icon: TicketStar,
  },
  {
    title: "Codes from a list",
    prompt:
      "Make a QR code for each of these links and give me a Markdown table with the image for each: https://example.com/a, https://example.com/b, https://example.com/c.",
    icon: TableDocument,
  },
  {
    title: "Print-ready file",
    prompt:
      "Generate a 1024 px QR code for https://example.com with a 4-module margin and give me the vector EPS link for our printer.",
    icon: DocumentDownload,
  },
  {
    title: "Shop location",
    prompt:
      "Make a QR code that opens our shop at 51.5007, -0.1246 in a maps app, with circle-shaped modules.",
    icon: Location,
  },
  {
    title: "Feedback by email",
    prompt:
      "Create a QR code that opens an email to feedback@example.com with the subject Store feedback.",
    icon: Sms,
  },
  {
    title: "Text to join",
    prompt:
      "Make a QR code that opens a text message to +1 555 0199 with the message JOIN, for our loyalty club poster.",
    icon: MessageText,
  },
];
