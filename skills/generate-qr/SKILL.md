---
name: generate-qr
description: Generate a QR code from a URL, text, Wi-Fi credentials, or vCard and save it as SVG or PNG. Use when the user says "create a QR code", "generate a QR for this URL", "make a Wi-Fi QR", "build a scannable code", "generate a QR with our logo", or needs to automate QR code creation in a workflow.
---

# Generate QR Code

Generate a styled, scannable QR code as SVG or PNG using `qrdx-cli`.

## How It Works

1. Accepts a data string (URL, text, Wi-Fi, vCard) and an output path
2. Runs `npx qrdx-cli` non-interactively with the provided flags
3. Returns a JSON result with the output path and file size
4. Displays the result to the user

## Usage

```bash
bash /mnt/skills/user/generate-qr/scripts/generate.sh <data> [output] [flags]
```

**Arguments:**
- `data` — URL or text to encode (required)
- `output` — Output file path, defaults to `qr.svg` (extension sets format: `.svg` or `.png`)

**Flags (all optional):**
- `--size <px>` — Output pixel size (default: `512`)
- `--level <L|M|Q|H>` — Error correction level (default: `Q`)
- `--body <pattern>` — Body dot pattern: `square` `circle` `rounded` `diamond` `pacman` etc.
- `--eye <pattern>` — Corner eye pattern: `square` `rounded` `gear` `circle` etc.
- `--dot <pattern>` — Corner dot pattern: `square` `circle` `heart` `star` etc.
- `--fg <hex>` — Foreground color (default: `#000000`)
- `--bg <hex>` — Background color (default: `#ffffff`)
- `--eye-color <hex>` — Corner eye color override
- `--dot-color <hex>` — Corner dot color override
- `--logo <url>` — Center logo image URL (use with `--level H`)
- `--margin <n>` — Quiet zone margin in modules (default: `0`)

**Examples:**

```bash
# Basic URL → SVG
bash /mnt/skills/user/generate-qr/scripts/generate.sh "https://example.com" qr.svg

# High-res PNG for print
bash /mnt/skills/user/generate-qr/scripts/generate.sh "https://example.com" qr.png --size 2048 --level H

# Branded style
bash /mnt/skills/user/generate-qr/scripts/generate.sh "https://example.com" branded.svg \
  --fg "#1a1a2e" --bg "#f0f0f0" --body circle --eye rounded

# With center logo
bash /mnt/skills/user/generate-qr/scripts/generate.sh "https://example.com" logo-qr.svg \
  --logo "https://example.com/logo.png" --level H

# Wi-Fi QR
bash /mnt/skills/user/generate-qr/scripts/generate.sh \
  "WIFI:T:WPA;S:MyNetwork;P:MyPassword;;" wifi.svg

# vCard
bash /mnt/skills/user/generate-qr/scripts/generate.sh \
  "BEGIN:VCARD
VERSION:3.0
FN:Jane Smith
TEL:+15551234567
EMAIL:jane@example.com
END:VCARD" contact.svg
```

## Output

```json
{
  "success": true,
  "outputPath": "qr.svg",
  "format": "svg",
  "size": 512,
  "bytes": 4821
}
```

## Present Results to User

After running the script, tell the user:

```
QR code saved to **{outputPath}** ({format}, {size}×{size}px, {bytes} bytes).
```

If the output is an SVG, mention it can be embedded directly in HTML or scaled to any size without quality loss. If PNG, mention the pixel dimensions.

## Troubleshooting

**`npx: command not found`** — Node.js is not installed. Install from [nodejs.org](https://nodejs.org) (v18+).

**`npm warn … peer dependency`** — Safe to ignore. The QR code will still generate correctly.

**`Error: No data provided`** — The first argument (data string) is missing. Wrap multi-line values (vCard, Wi-Fi) in quotes.

**Network errors with `--logo`** — The logo URL must be publicly accessible. Try a direct image URL (`.png`, `.svg`, `.jpg`).
