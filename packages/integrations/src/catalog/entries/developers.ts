import type { IntegrationCatalogEntry } from "../types";

export const developers: IntegrationCatalogEntry[] = [
  {
    slug: "rest-api",
    name: "REST API",
    tagline:
      "Create, update and archive dynamic codes and read their scans from your own code.",
    description: [
      "The codes API under /api/v1/codes lists, creates (one or up to 100 at a time), updates and deletes dynamic codes, and returns scan analytics for any range your plan includes.",
      "Requests use an OAuth access token with the codes:read or codes:write scope and act on your personal workspace. Errors share one JSON shape.",
    ],
    kind: "native",
    categories: ["developers"],
    logo: { type: "feature", icon: "Code1" },
    plan: "free",
    builtBy: "QRdx",
    docs: "/docs/dynamic-qr-codes#rest-api",
    primaryAction: {
      type: "link",
      label: "Read the API docs",
      href: "/docs/dynamic-qr-codes#rest-api",
    },
    secondaryAction: {
      type: "copy",
      label: "Copy example",
      text: `curl https://qrdx.dev/api/v1/codes \\\n  -H "Authorization: Bearer $QRDX_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"destinationUrl": "https://example.com/menu", "title": "Spring menu"}'`,
      toast: "Example copied",
    },
    steps: [
      {
        title: "Get an access token",
        body: "Authorize your app with QRdx OAuth and request the codes:read and codes:write scopes.",
      },
      {
        title: "Create a code",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: `curl https://qrdx.dev/api/v1/codes \\\n  -H "Authorization: Bearer $QRDX_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"destinationUrl": "https://example.com/menu", "title": "Spring menu"}'`,
        },
      },
      {
        title: "Encode the short link",
        body: "Put the response's shortLink in your QR code, for example with the qrdx React library. Change destinationUrl later with PATCH and the printed code follows.",
      },
    ],
    capabilities: [
      {
        title: "Codes",
        description:
          "List, create, update (destination, title, style, domain) and delete.",
      },
      {
        title: "Bulk creation",
        description: "Up to 100 codes per request on Pro and Business.",
      },
      {
        title: "Scan analytics",
        description:
          "Totals and individual scans per code, limited by your plan's history.",
      },
      {
        title: "Daily limits",
        description:
          "1,000 requests a day on Free, 10,000 on Pro and 100,000 on Business.",
      },
    ],
    keywords: ["api", "http", "json", "oauth", "dynamic", "bulk", "rest"],
    related: ["webhooks", "image-api", "custom-domains"],
  },
  {
    slug: "image-api",
    name: "QR image API",
    tagline:
      "Turn any URL into a QR code image for Markdown, HTML or email. No account or key.",
    description: [
      "GET /api/v1/qr returns an SVG, PNG or print-ready EPS. Everything is in the query string, so the URL itself is the image: paste it into a README, an <img> tag or an email template.",
      "Choose size, colors, module and corner shapes, error correction, margin and frame templates.",
    ],
    kind: "native",
    categories: ["developers"],
    logo: { type: "feature", icon: "Gallery" },
    plan: "no-account",
    builtBy: "QRdx",
    docs: "/docs/developers/image-api",
    primaryAction: {
      type: "copy",
      label: "Copy image URL",
      text: "https://qrdx.dev/api/v1/qr?data=https://example.com&size=512",
      toast: "Image URL copied",
    },
    secondaryAction: {
      type: "link",
      label: "Read the docs",
      href: "/docs/developers/image-api",
    },
    steps: [
      {
        title: "Embed it in Markdown",
        snippet: {
          label: "README.md",
          language: "text",
          code: "![QR code](https://qrdx.dev/api/v1/qr?data=https://github.com/you/repo)",
        },
      },
      {
        title: "Or in HTML",
        snippet: {
          label: "index.html",
          language: "html",
          code: `<img\n  src="https://qrdx.dev/api/v1/qr?data=https://qrdx.dev&size=256&fg=155dfc"\n  width="256" height="256" alt="QR code for qrdx.dev"\n/>`,
        },
      },
      {
        title: "Encode the data",
        body: "URL-encode data when it contains &, #, + or spaces, for example with encodeURIComponent.",
      },
    ],
    capabilities: [
      {
        title: "SVG, PNG or EPS",
        description: "Vector EPS sized in points for print and design tools.",
      },
      {
        title: "Styles",
        description:
          "Colors, module and corner shapes, error correction, margin and frames.",
      },
      {
        title: "Cache-friendly",
        description: "The same URL always returns the same image.",
      },
    ],
    keywords: ["image", "png", "svg", "eps", "markdown", "email", "embed"],
    related: ["cli", "react", "claude-code"],
  },
  {
    slug: "cli",
    name: "QRdx CLI",
    tagline:
      "Generate styled SVG or PNG QR codes from the terminal or in CI with @qrdx/cli.",
    description: [
      "Run npx @qrdx/cli to render a QR code with the same patterns, colors, gradients, logos, templates and frames as the playground. Flags make it fully non-interactive for scripts and CI; in a terminal it can guide you with prompts.",
    ],
    kind: "native",
    categories: ["developers"],
    logo: { type: "feature", icon: "CommandSquare" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://www.npmjs.com/package/@qrdx/cli",
    primaryAction: {
      type: "copy",
      label: "Copy command",
      text: 'npx @qrdx/cli generate "https://example.com" -o qr.svg',
      toast: "Command copied — run it in your terminal",
    },
    secondaryAction: {
      type: "link",
      label: "View on npm",
      href: "https://www.npmjs.com/package/@qrdx/cli",
    },
    steps: [
      {
        title: "Run it without installing",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: 'npx @qrdx/cli generate "https://example.com" -o qr.svg',
        },
      },
      {
        title: "Style it",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: 'npx @qrdx/cli generate "https://qrdx.dev" \\\n  --body circle --eye rounded --fg "#1a1a2e" \\\n  --frame banner-bottom --frame-text "Scan me" \\\n  -o qr.png --size 2048 --level H',
        },
      },
      {
        title: "Or install it globally",
        body: "npm install -g @qrdx/cli gives you the qrdx command.",
      },
    ],
    capabilities: [
      {
        title: "SVG and PNG",
        description: "The output file's extension sets the format.",
      },
      {
        title: "Full styling",
        description:
          "Patterns, colors and gradients, logos, templates and call-to-action frames.",
      },
      {
        title: "CI-friendly",
        description:
          "Non-interactive with flags; invalid values exit with code 1 and list the accepted ones.",
      },
    ],
    keywords: ["terminal", "command line", "npm", "npx", "ci", "script"],
    related: ["image-api", "react", "codex"],
  },
  {
    slug: "react",
    name: "React library",
    tagline:
      "Render customizable QR codes in React with qrdx: patterns, gradients, logos and templates.",
    description: [
      "qrdx is the open-source library behind QRdx. Render QR codes as SVG or canvas with custom body patterns, corner eyes, gradients, logos and frame templates, and export them as images.",
    ],
    kind: "native",
    categories: ["developers"],
    logo: { type: "image", src: "/integrations/react.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://www.npmjs.com/package/qrdx",
    docs: "/docs/getting-started",
    primaryAction: {
      type: "copy",
      label: "Copy install command",
      text: "npm install qrdx",
      toast: "Install command copied",
    },
    secondaryAction: {
      type: "link",
      label: "Read the docs",
      href: "/docs/getting-started",
    },
    steps: [
      {
        title: "Install the package",
        body: "react and react-dom 18 or newer are peer dependencies.",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: "npm install qrdx",
        },
      },
      {
        title: "Render a code",
        snippet: {
          label: "app.tsx",
          language: "tsx",
          code: `import { QRCode } from "qrdx";\n\nexport default function App() {\n  return <QRCode value="https://example.com" size={256} />;\n}`,
        },
      },
    ],
    capabilities: [
      {
        title: "SVG and canvas",
        description: "QRCode, QRCodeSVG and QRCodeCanvas components.",
      },
      {
        title: "Design control",
        description:
          "Body patterns, corner eyes and dots, gradients, logos and templates.",
      },
      {
        title: "Open source",
        description: "The same renderer as the QRdx playground.",
      },
    ],
    keywords: [
      "react",
      "npm",
      "component",
      "library",
      "svg",
      "canvas",
      "next.js",
    ],
    related: ["shadcn", "cli", "image-api"],
  },
  {
    slug: "shadcn",
    name: "shadcn/ui registry",
    tagline:
      "Add QR code components (codes, cards, downloads, share dialogs, a generator and a scanner) to a shadcn/ui project.",
    description: [
      "The QRdx registry has eight components built on qrdx. The shadcn CLI copies their source into your project, so you own the code.",
      "They cover a styled QR code with downloads, a framed card, a download menu, a share dialog, a live generator, an in-browser scanner, and Wi-Fi and contact codes. Each has a docs page with a live preview, install steps and examples.",
    ],
    kind: "native",
    categories: ["developers"],
    logo: { type: "image", src: "/integrations/shadcn.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://ui.shadcn.com",
    docs: "/docs/developers/shadcn",
    primaryAction: {
      type: "copy",
      label: "Copy command",
      text: "npx shadcn@latest add https://qrdx.dev/r/qr-code.json",
      toast: "Command copied — run it in your project",
    },
    secondaryAction: {
      type: "link",
      label: "Browse components",
      href: "/docs/components/qr-code",
    },
    steps: [
      {
        title: "Add the QR code component",
        body: "This adds components/qr-code.tsx and installs qrdx.",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: "npx shadcn@latest add https://qrdx.dev/r/qr-code.json",
        },
      },
      {
        title: "Use it",
        snippet: {
          label: "share-card.tsx",
          language: "tsx",
          code: `import { QrCode } from "@/components/qr-code";\n\n<QrCode value="https://qrdx.dev" size={180} caption="Scan to open qrdx.dev" />`,
        },
      },
      {
        title: "Optional: the scanner",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: "npx shadcn@latest add https://qrdx.dev/r/qr-code-scanner.json",
        },
      },
    ],
    capabilities: [
      {
        title: "You own the code",
        description: "Source is copied into your project, ready to change.",
      },
      {
        title: "Downloads built in",
        description: "PNG and SVG download buttons with an accessible SVG.",
      },
      {
        title: "Scanner",
        description: "Decode QR codes from uploaded images in the browser.",
      },
    ],
    keywords: [
      "shadcn",
      "registry",
      "component",
      "tailwind",
      "scanner",
      "react",
    ],
    related: ["react", "cli", "image-api"],
  },
];
