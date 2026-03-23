---
name: generate-qr
description: Generate a QR code from a URL, text, Wi-Fi credentials, or vCard and save it as SVG or PNG. Use when the user says "create a QR code", "generate a QR for this URL", "make a Wi-Fi QR", "build a branded QR with our logo", or needs to automate QR code creation in a workflow.
---

# Generate QR Code

Generate a styled, scannable QR code as SVG or PNG using the `qrdx` CLI.

## Usage

```bash
npx qrdx generate "<data>" -o <output> [flags]
```

**Arguments:**
- `<data>` — URL or text to encode (required). Wrap in quotes.
- `-o <path>` — Output file path. Extension sets format: `.svg` or `.png`

**Flags (all optional):**

| Flag | Default | Description |
|------|---------|-------------|
| `--size <px>` | `512` | Output pixel size |
| `--level <L\|M\|Q\|H>` | `Q` | Error correction level |
| `--body <pattern>` | `square` | Body dot pattern |
| `--eye <pattern>` | `square` | Corner eye pattern |
| `--dot <pattern>` | `square` | Corner dot pattern |
| `--fg <hex>` | `#000000` | Foreground color |
| `--bg <hex>` | `#ffffff` | Background color |
| `--eye-color <hex>` | matches `--fg` | Corner eye color override |
| `--dot-color <hex>` | matches `--fg` | Corner dot color override |
| `--logo <url>` | — | Center logo image URL (use with `--level H`) |
| `--margin <n>` | `0` | Quiet zone margin in modules |

## Patterns

**Body** (`--body`): `square` `circle` `circle-large` `diamond` `circle-mixed` `pacman` `rounded` `small-square` `vertical-line`

**Eye** (`--eye`): `square` `rounded` `gear` `circle` `diya` `extra-rounded` `message` `pointy` `curly`

**Dot** (`--dot`): `square` `rounded` `circle` `diamond` `message` `message-reverse` `diya` `diya-reverse` `rounded-triangle` `star` `banner`

## Examples

```bash
# Basic URL → SVG
npx qrdx generate "https://qrdx.dev" -o qr.svg

# High-res PNG for print
npx qrdx generate "https://qrdx.dev" -o qr.png --size 2048 --level H

# Branded style
npx qrdx generate "https://qrdx.dev" -o branded.svg \
  --fg "#1a1a2e" --bg "#f5f5f5" --body circle --eye rounded --dot star

# With center logo
npx qrdx generate "https://qrdx.dev" -o logo-qr.svg \
  --logo "https://qrdx.dev/logo.png" --level H

# Wi-Fi QR
npx qrdx generate "WIFI:T:WPA;S:MyNetwork;P:MyPassword;;" -o wifi.svg

# vCard
npx qrdx generate "BEGIN:VCARD
VERSION:3.0
FN:Jane Smith
TEL:+15551234567
EMAIL:jane@qrdx.dev
END:VCARD" -o contact.svg
```

## Present Results to User

After generating, tell the user:

```
QR code saved to **{outputPath}** ({format}, {size}×{size}px).
```

If SVG: mention it can be embedded in HTML or scaled to any size without quality loss.
If PNG: mention the pixel dimensions.

## Troubleshooting

**`Error: No data provided`** — The data string is missing. Wrap multi-line values (vCard, Wi-Fi) in quotes.

**Network errors with `--logo`** — The logo URL must be publicly accessible. Use a direct image URL (`.png`, `.svg`, `.jpg`).
