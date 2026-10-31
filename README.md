<a href="https://qrdx.dev">
  <img alt="QRdx: free, open-source QR code generator and React library" src="https://github.com/user-attachments/assets/3a1ed345-e594-4c19-9c45-3bc5222cffee">
</a>

<h3 align="center">QRdx</h3>

<p align="center">
  Free, open-source QR code generator: beautiful static QR codes with no signup or watermark, dynamic QR codes with hosted pages and scan analytics, and a React library, CLI, APIs and MCP server for developers. Self-hostable.
  <br />
  <a href="https://qrdx.dev/playground"><strong>Open the generator »</strong></a>
  <br />
  <br />
  <a href="https://qrdx.dev/docs">Docs</a> ·
  <a href="#quickstart-react-library">React library</a> ·
  <a href="#quickstart-cli">CLI</a> ·
  <a href="#self-hosting">Self-hosting</a> ·
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/bucharitesh/qrdx/blob/main/license.md"><img src="https://img.shields.io/github/license/bucharitesh/qrdx?color=blue" alt="License" /></a>
  <a href="https://www.npmjs.com/package/qrdx"><img src="https://img.shields.io/npm/v/qrdx?color=f80" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/qrdx"><img src="https://img.shields.io/npm/dm/qrdx" alt="npm downloads" /></a>
  <a href="https://github.com/bucharitesh/qrdx/stargazers"><img src="https://img.shields.io/github/stars/bucharitesh/qrdx" alt="GitHub stars" /></a>
</p>

<p align="center">If QRdx saves you time, <a href="https://github.com/bucharitesh/qrdx">star the repo</a>. It helps others find it.</p>

## What is QRdx?

QRdx is three things in one repository:

- **[qrdx.dev](https://qrdx.dev)**: a web app for designing QR codes in the browser. Static codes are free, unlimited and need no account. With an account you also get dynamic QR codes, hosted pages and scan analytics.
- **[`qrdx`](https://www.npmjs.com/package/qrdx)** and **[`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli)**: the React library and command-line tool that power it, so you can render the same QR codes in your own app or scripts.
- **Developer APIs**: a keyless QR image API, a REST API with OAuth, webhooks and a remote MCP server for AI assistants.

Static QR codes store the content in the code itself, so they never expire and have no scan limits. Dynamic codes encode a short link you can repoint after printing, and they keep redirecting on every plan, even after a downgrade or cancellation ([Never-Hostage Guarantee](https://qrdx.dev/guarantee)).

## Features

**Design and export (free, no account)**

- **Design:** 9 body patterns, 9 corner-eye shapes and 11 eye-dot shapes, solid colors or linear and radial gradients, center logos, call-to-action frames and decorative templates
- **Art QR:** Logo QR and Image QR blend a logo or photo into the modules as vector art. Instances with a [fal.ai](https://fal.ai) key also offer AI QR art that paints a scene around the code (with an account)
- **Content types:** URLs, text, Wi-Fi, vCard, email, phone, SMS, WhatsApp, maps, UPI, PayPal and many social and payment profiles
- **Export:** PNG, JPG, SVG, PDF and vector EPS with no watermark, plus print-ready PDFs at an exact size with bleed and crop marks
- **Scan checks:** contrast warnings and a "Will it scan?" score
- **AI themes:** describe a style and generate a matching QR theme (5 free generations with an account)
- **Saved and community themes:** save your designs, or browse and reuse themes shared by others
- **Free tools:** [bulk generator](https://qrdx.dev/tools/bulk) from CSV, [scan checker](https://qrdx.dev/tools/scan-checker), [print size calculator](https://qrdx.dev/tools/print-size) and an installable [QR code scanner](https://qrdx.dev/scan)

**Dynamic QR codes (account)**

- **Editable short links** with scan analytics (countries, cities, devices, browsers), folders, tags, notes, version history, trash and CSV import
- **Hosted mobile pages** at `/p/<slug>`: link lists, business pages, vCard Plus, menus, coupons, events, app links, forms with a response inbox, PDFs, galleries, audio and video
- **Smart routing** by device, country, language, time or scan count, A/B tests and UTM tags
- **Link controls:** passwords, start and expiry dates, scan limits and fallback URLs
- **Custom domains** for short links, **file storage** for pages, **retargeting pixels** and **conversion tracking**
- **Teams** with owner, admin and member roles
- **Notifications:** email alerts, a weekly digest, Slack and Discord messages, and signed webhooks for Zapier, Make and n8n

Free accounts get 10 dynamic codes and 3 hosted pages. Pro ($5/month or $48/year) and Business ($15/month or $144/year) raise the limits; see [pricing](https://qrdx.dev/pricing).

**Developers and self-hosting**

- **Libraries and tools:** a typed React library, a CLI with SVG, PNG and EPS output, a shadcn/ui registry and an agent skill for AI coding assistants
- **APIs:** QR image API, REST API with OAuth 2.0 scopes, REST Hooks and an MCP server
- **Self-hostable:** run the whole web app on your own infrastructure (AGPL-3.0)

## Quickstart: React library

```bash
npm install qrdx
```

```tsx
import { QRCode } from "qrdx";

export function Example() {
  return (
    <QRCode
      value="https://qrdx.dev"
      size={256}
      bodyPattern="circle"
      cornerEyePattern="gear"
      fgColor="#155DFC"
    />
  );
}
```

`QRCode` renders an SVG. The package also exports `QRCodeCanvas`, `getQRAsSVG` for server-side rendering, download helpers for PNG, JPG, SVG, PDF and EPS, print-ready PDF and EPS at exact physical sizes, Logo QR and Image QR art, a scan score and QR decoding. See the [library docs](https://qrdx.dev/docs) for every prop.

## Quickstart: CLI

```bash
# Interactive
npx @qrdx/cli generate

# Non-interactive
npx @qrdx/cli generate "https://qrdx.dev" -o qr.svg
npx @qrdx/cli generate "https://qrdx.dev" -o qr.png --body circle --eye gear --dot star --size 1024
npx @qrdx/cli generate "https://qrdx.dev" --logo "https://qrdx.dev/logo.png" --level H -o branded.svg
npx @qrdx/cli generate "https://qrdx.dev" -o print.eps --size 144   # vector EPS, 2 inches wide
```

Run `npx @qrdx/cli --help` for all options, including gradients (`--fg`, `--bg`), templates (`--template`), call-to-action frames (`--frame`) and margins. See the [CLI docs](https://qrdx.dev/docs/developers/cli).

## Agent skill

[`skills/generate-qr`](skills/generate-qr) teaches AI coding agents to generate styled QR codes with the CLI. For Claude Code:

```bash
cp -r skills/generate-qr ~/.claude/skills/
```

See [`skills/README.md`](skills/README.md) for other agents.

## Developer APIs, MCP & shadcn

**Image API.** Any URL becomes a QR code image, with no API key. Use it in a README, an `<img>` tag or an email:

```md
![QR](https://api.qrdx.dev/v1/qr?data=https://github.com/you/repo&format=svg)
```

Add `format=png` or `format=eps`, `size`, colors (`fg`, `bg`), patterns (`body`, `eye`, `dot`), `level`, `margin` or a frame `template`. See the [image API docs](https://qrdx.dev/docs/developers/image-api).

**REST API.** Create, edit and delete dynamic codes, read their scan analytics, report conversions and subscribe to webhooks under `/api/v1`, authenticated with OAuth 2.0 access tokens (`codes:read`, `codes:write`, `themes:read`, `profile:read`). See the [REST API docs](https://qrdx.dev/docs/developers/rest-api) and [webhooks](https://qrdx.dev/docs/webhooks).

**MCP server.** Let AI assistants generate QR codes and build Wi-Fi, vCard, email, SMS and location payloads. For Claude Code:

```bash
claude mcp add --transport http qrdx https://mcp.qrdx.dev/mcp
```

Cursor, VS Code and other clients: see the [MCP docs](https://qrdx.dev/docs/developers/mcp).

**shadcn/ui.** Add a QR code component with PNG and SVG download buttons, or an image QR scanner:

```bash
npx shadcn@latest add https://qrdx.dev/r/qr-code.json
npx shadcn@latest add https://qrdx.dev/r/qr-code-scanner.json
```

## Integrations

- **[Dub](https://dub.co):** create or pick Dub short links for your QR codes. Click analytics for those links come from Dub.
- **Google Drive:** select Drive files or folders and turn their share links into QR codes.
- **Slack, Discord, Zapier, Make and n8n:** alerts and signed webhooks for scans, code changes and form submissions (Business). See [notifications](https://qrdx.dev/docs/notifications).
- **Raycast:** a Raycast extension for generating QR codes ([`plugins/raycast`](plugins/raycast)).
- **Canva:** a Canva app ([`plugins/canva`](plugins/canva)).
- **Chrome and Figma:** a Chrome extension ([`plugins/chrome`](plugins/chrome)) and a Figma plugin ([`plugins/figma`](plugins/figma)) that make styled QR codes with the `qrdx` library. Build them from source.

## Self-hosting

You can run the full web app yourself, dynamic codes and hosted pages included, with Docker Compose (Postgres included) or with Node.js. It boots with just three environment variables: `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `BETTER_AUTH_SECRET`, plus one GitHub or Google OAuth app for sign-in. Everything else (AI, payments, file storage, email, custom domains, integrations, analytics) is optional.

```bash
git clone https://github.com/bucharitesh/qrdx.git && cd qrdx
cp .env.example .env   # set BETTER_AUTH_SECRET and an OAuth provider
docker compose up -d --build
```

Read the full [self-hosting guide](https://qrdx.dev/docs/self-hosting) before running it in production.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) and [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) and [Radix UI](https://www.radix-ui.com/)
- [Drizzle ORM](https://orm.drizzle.team/) on Postgres ([Neon](https://neon.tech/))
- [Better Auth](https://www.better-auth.com/) for authentication
- [Vercel AI SDK](https://ai-sdk.dev/) with Google Gemini for AI themes, [fal.ai](https://fal.ai/) for AI QR art
- [Polar](https://polar.sh/) for payments, [PostHog](https://posthog.com/) for analytics, [Upstash](https://upstash.com/) for rate limiting
- [Cloudflare R2](https://developers.cloudflare.com/r2/) for file storage and [Resend](https://resend.com/) for email
- [Fumadocs](https://fumadocs.dev/) for documentation
- [Turborepo](https://turborepo.com/) and [pnpm](https://pnpm.io/) for the monorepo, [Biome](https://biomejs.dev/) for linting

## Contributing

Contributions are welcome:

- [Open an issue](https://github.com/bucharitesh/qrdx/issues) if you find a bug or want to suggest a feature.
- [Open a pull request](https://github.com/bucharitesh/qrdx/pulls) for fixes and improvements. Issues labeled `good first issue` are a good place to start.

[CONTRIBUTING.md](CONTRIBUTING.md) covers local setup, the project layout and how to run tests. To report a security issue privately, see [SECURITY.md](SECURITY.md).

## Repo activity

![QRdx repo activity, generated by Axiom](https://repobeats.axiom.co/api/embed/0694ff5c2725e0d236774058f6fc68c2e1a712d7.svg "Repobeats analytics image")

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=bucharitesh/qrdx&type=date&legend=bottom-right)](https://www.star-history.com/#bucharitesh/qrdx&type=date&legend=bottom-right)

## License

QRdx is licensed under the [GNU Affero General Public License v3.0 or later](license.md) (AGPL-3.0-or-later). You can use, modify and self-host it freely. If you run a modified version as a network service, you must also make your modified source code available to its users under the same license.

## Acknowledgments

- QR code generation is based on [qrcode.react](https://github.com/zpao/qrcode.react)
- Playground design inspired by [tweakcn](https://github.com/jnsahaj/tweakcn)
- UI components built with Radix UI and Tailwind CSS
