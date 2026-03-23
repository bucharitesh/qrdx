---
name: generate-qr
version: 2.0.0
description: Generate a QR code from a URL, text, Wi-Fi credentials, or vCard and save it as SVG or PNG. Supports solid colors, linear/radial gradients, decorative templates, logos, and all dot/eye/corner patterns. Use when the user says "create a QR code", "generate a QR for this URL", "make a Wi-Fi QR", "build a branded QR with our logo", "add a gradient to the QR", "use the Arrow template", or needs to automate QR code creation in a workflow.
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
| `--fg <color>` | `#000000` | Foreground color (hex or JSON gradient) |
| `--bg <color>` | `#ffffff` | Background color (hex or JSON gradient) |
| `--eye-color <color>` | matches `--fg` | Corner eye color (hex or JSON gradient) |
| `--dot-color <color>` | matches `--fg` | Corner dot color (hex or JSON gradient) |
| `--logo <url>` | — | Center logo image URL (use with `--level H`) |
| `--margin <n>` | `0` | Quiet zone margin in modules |
| `--template <id>` | — | Decorative template wrapper |

## Patterns

**Body** (`--body`): `square` `circle` `circle-large` `diamond` `circle-mixed` `pacman` `rounded` `small-square` `vertical-line`

**Eye** (`--eye`): `square` `rounded` `gear` `circle` `diya` `extra-rounded` `message` `pointy` `curly`

**Dot** (`--dot`): `square` `rounded` `circle` `diamond` `message` `message-reverse` `diya` `diya-reverse` `rounded-triangle` `star` `banner`

## Gradients

Pass a JSON object to `--fg`, `--bg`, `--eye-color`, or `--dot-color` to use a gradient instead of a solid color.

**Linear gradient** — flows at a given angle (0° = left→right, 90° = top→bottom):
```bash
--fg '{"type":"linear","stops":[{"color":"#6366f1","offset":0},{"color":"#ec4899","offset":100}],"angle":135}'
```

**Radial gradient** — radiates from the center outward:
```bash
--fg '{"type":"radial","stops":[{"color":"#facc15","offset":0},{"color":"#ef4444","offset":100}]}'
```

**Stops:** minimum 2 required; each stop has `color` (hex) and `offset` (0–100 as a percentage).
**Tip:** use `--level H` when combining gradients with a logo for maximum error recovery.

## Templates

Templates add a decorative SVG wrapper around the QR code. Pass the template ID to `--template`.

| ID | Description |
|----|-------------|
| `Arrow` | Adds a curved arrow pointing to the QR code |
| `StandardBox` | Framed box with a clean border |
| `SquareBorder` | Bold square border around the QR |
| `StrikedBox` | Box with diagonal strike decoration |
| `Halloween` | Spooky Halloween-themed frame |

Templates can be combined with any other flags (patterns, colors, gradients, logo).

## Examples

```bash
# Basic URL → SVG
npx qrdx generate "https://qrdx.dev" -o qr.svg

# High-res PNG for print
npx qrdx generate "https://qrdx.dev" -o qr.png --size 2048 --level H

# Branded style with custom patterns
npx qrdx generate "https://qrdx.dev" -o branded.svg \
  --fg "#1a1a2e" --bg "#f5f5f5" --body circle --eye rounded --dot star

# With center logo (use --level H for best scanability)
npx qrdx generate "https://qrdx.dev" -o logo-qr.svg \
  --logo "https://qrdx.dev/logo.png" --level H

# Linear gradient foreground
npx qrdx generate "https://qrdx.dev" -o gradient.svg \
  --fg '{"type":"linear","stops":[{"color":"#6366f1","offset":0},{"color":"#ec4899","offset":100}],"angle":135}'

# Radial gradient background
npx qrdx generate "https://qrdx.dev" -o radial-bg.svg \
  --bg '{"type":"radial","stops":[{"color":"#fef9c3","offset":0},{"color":"#fde047","offset":100}]}'

# Gradient fg + gradient eye color
npx qrdx generate "https://qrdx.dev" -o multi-gradient.svg \
  --fg '{"type":"linear","stops":[{"color":"#0ea5e9","offset":0},{"color":"#6366f1","offset":100}],"angle":90}' \
  --eye-color '{"type":"radial","stops":[{"color":"#f97316","offset":0},{"color":"#ef4444","offset":100}]}'

# Arrow template
npx qrdx generate "https://qrdx.dev" -o arrow.svg --template Arrow

# Halloween template with spooky styling
npx qrdx generate "https://qrdx.dev" -o halloween.svg \
  --template Halloween --body circle --eye gear --dot star \
  --fg "#1a0a00" --bg "#ff6600"

# Combined: template + gradient + logo
npx qrdx generate "https://qrdx.dev" -o full.svg \
  --template StandardBox --level H \
  --fg '{"type":"linear","stops":[{"color":"#1e3a5f","offset":0},{"color":"#3b82f6","offset":100}],"angle":45}' \
  --logo "https://qrdx.dev/logo.png"

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
If a template was used: name the template.
If gradients were used: briefly describe the effect (e.g. "indigo-to-pink diagonal gradient").

## Troubleshooting

**`Error: No data provided`** — The data string is missing. Wrap multi-line values (vCard, Wi-Fi) in quotes.

**Network errors with `--logo`** — The logo URL must be publicly accessible. Use a direct image URL (`.png`, `.svg`, `.jpg`).

**Gradient JSON parse error** — Ensure the JSON is single-quoted in the shell and uses double quotes internally. Validate with `echo '<json>' | python3 -m json.tool`.

**Template not applied** — Template IDs are case-sensitive: `Arrow`, not `arrow`.
