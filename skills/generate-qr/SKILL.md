---
name: generate-qr
description: Generate a styled, scannable QR code with the QRdx CLI (@qrdx/cli) from a URL, text, Wi-Fi login or vCard and save it as SVG, PNG, WebP or EPS, or make one code per row of a CSV file. Supports solid colors, linear, radial and angular gradients, body, eye and corner dot patterns, call-to-action frames with a label, decorative templates and a center logo. Use when the user says "create a QR code", "generate a QR for this URL", "make a Wi-Fi QR", "build a branded QR with our logo", "add a gradient to the QR", "add a Scan me frame", "use the Arrow template", "make QR codes for every row of this CSV", or needs to automate QR code creation in a workflow.
license: MIT
compatibility: Requires Node.js 22 or later and network access to the npm registry.
metadata:
  version: "2.1.0"
---

# Generate QR Code

Generate a styled, scannable QR code with the QRdx CLI, [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli). Its command is `qrdx`; the `qrdx` npm package itself is the React library. The code is rendered on this machine and nothing is uploaded. The only network requests are npm downloading the CLI and, if you pass `--logo` with a URL, fetching that image.

**The CLI version is pinned on purpose.** Every command here runs `npx @qrdx/cli@0.0.7`, the release this file was checked against, so an agent never runs whatever happens to be newest on npm. Don't drop the version or swap in `@latest`. To update the skill: run `npm view @qrdx/cli version`, read that version's `npx @qrdx/cli@<version> --help`, update the flags and value lists below to match, then change the version in every command and bump `metadata.version`.

**Secrets.** Put a Wi-Fi password or other secret only in the command you run. Never repeat it back in replies, summaries or logs; call it "the password you gave".

## Usage

```bash
npx @qrdx/cli@0.0.7 generate "<data>" -o <output> [flags]
```

- `<data>`: the URL or text to encode (required). Wrap it in quotes.
- `-o, --output <path>`: the output file. The extension sets the format: `.svg`, `.png`, `.webp` (lossless) or `.eps` (vector, for print). The folder must already exist. Without `-o` the CLI writes `qr.svg` in the current folder, so always pass it.

Always pass both the data and `-o`. In an interactive terminal the CLI asks for anything missing; agent shells usually aren't interactive, so it runs straight through. If it ever stops at a prompt, run it again with `CI=true` in front.

**Flags (all optional):**

| Flag | Default | Description |
|------|---------|-------------|
| `--format <svg\|png\|webp\|eps>` | from the extension | Format when the file name has no extension. If both are given they must match. |
| `--size <n>` | `512` | Size of the QR code in pixels (points for EPS). PNG and WebP allow up to 10000. |
| `-l, --level <L\|M\|Q\|H>` | `Q` | Error correction level |
| `--body <pattern>` | `square` | Body dot pattern |
| `--eye <pattern>` | `square` | Corner eye pattern |
| `--dot <pattern>` | `square` | Corner dot pattern |
| `--fg <color>` | `#000000` | Foreground color (hex or JSON gradient) |
| `--bg <color>` | `#ffffff` | Background color (hex or JSON gradient) |
| `--eye-color <color>` | matches `--fg` | Corner eye color (hex or JSON gradient) |
| `--dot-color <color>` | matches `--fg` | Corner dot color (hex or JSON gradient) |
| `--logo <url>` | none | Center logo image URL, 20% of the code's width, with the modules behind it cleared. Use with `--level H`. PNG, WebP and EPS embed the image; SVG links to the URL. |
| `--margin <n>` | `0` | Quiet zone margin in modules |
| `--template <id>` | none | Decorative template wrapper (case-sensitive) |
| `--frame <style>` | none | Call-to-action frame. It adds space around the code, so the file is larger than `--size`. |
| `--frame-text <text>` | `Scan me` | Frame label, up to 24 characters. `""` hides it. |
| `--frame-color <hex>` | `#000000` | Frame color |
| `--frame-text-color <hex>` | white on banners | Frame label color |

Any `--frame-text`, `--frame-color` or `--frame-text-color` without `--frame` uses the `banner-bottom` frame.

## Accepted values

These are the values `@qrdx/cli@0.0.7` accepts. Anything else exits with an error that lists them.

**Body** (`--body`): `square` `rounded` `circle` `circle-large` `circle-mixed` `small-square` `diamond` `pacman` `vertical-line` `horizontal-line` `liquid` `liquid-horizontal` `liquid-vertical` `classy` `classy-rounded` `leaf` `plus` `hexagon` `octagon` `star` `heart` `random-dots` `mosaic`

**Eye** (`--eye`): `square` `rounded` `extra-rounded` `circle` `gear` `diya` `message` `pointy` `leaf` `leaf-reverse` `drop` `octagon` `bevel` `squircle` `cushion` `shield` `petal`

**Dot** (`--dot`): `square` `rounded` `extra-rounded` `circle` `message` `message-reverse` `diya` `diya-reverse` `rounded-triangle` `leaf` `leaf-reverse` `drop` `drop-reverse` `plus` `cross-rounded` `hexagon` `octagon` `flower` `heart` `squircle` `dots`

**Frame** (`--frame`): `none` `banner-bottom` `banner-top` `banner-top-bottom` `border` `rounded-border` `gradient-border` `speech-bubble` `speech-bubble-top` `chat-bubble` `circle` `polaroid` `phone` `ticket` `badge` `envelope` `tag` `menu-card` `sticker` `focus`

**Template** (`--template`):

| ID | Description |
|----|-------------|
| `Arrow` | Adds a curved arrow pointing to the QR code |
| `StandardBox` | Framed box with a clean border |
| `SquareBorder` | Bold square border around the QR |
| `StrikedBox` | Box with diagonal strike decoration |
| `Halloween` | Spooky Halloween-themed frame |

Previews of every pattern and frame: https://qrdx.dev/docs/styles

## Gradients

Pass a JSON object to `--fg`, `--bg`, `--eye-color` or `--dot-color` instead of a hex color.

**Linear**, at an angle (0° = left to right, 90° = top to bottom):
```bash
--fg '{"type":"linear","stops":[{"color":"#6366f1","offset":0},{"color":"#ec4899","offset":100}],"angle":135}'
```

**Radial**, from the center outward:
```bash
--fg '{"type":"radial","stops":[{"color":"#facc15","offset":0},{"color":"#ef4444","offset":100}]}'
```

**Angular**, sweeping around the center from `angle`:
```bash
--fg '{"type":"angular","stops":[{"color":"#0ea5e9","offset":0},{"color":"#6366f1","offset":100}],"angle":0}'
```

**Stops:** at least 2; each has `color` (hex) and `offset` (0–100, a percentage). Single-quote the JSON in the shell.

## Many codes from a CSV

```bash
npx @qrdx/cli@0.0.7 batch <file.csv> -o <folder> [--format svg|png|webp|eps] [style flags]
```

- `-o, --out <folder>`: where the codes go (default `qr-codes`); the CLI creates it.
- `--format`: `svg` (default), `png`, `webp` or `eps`.
- `--value-column <name or number>`: the column to encode. Default: the first column named value, url, link, data, content, text, qr or qr code; otherwise the first column.
- `--name-column <name or number>`: the column for file names. Default: a column named file name, name, label, id, title or sku; otherwise `qr-00001`, `qr-00002` and so on. Repeated names get `-2`, `-3`.
- `--no-header`: the first row is a code, not column names.
- `--jobs <1-64>`: codes rendered at a time (default 4 for SVG, 8 otherwise).

Every style flag from `generate` applies to all the codes. Rows that fail (empty, or too much data) are listed in `errors.csv` in the output folder; the command fails only when no code could be made.

## Examples

```bash
# Basic URL → SVG
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o qr.svg

# High-res PNG
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o qr.png --size 2048 --level H

# Vector EPS for a print shop (--size is the width in points)
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o qr.eps --size 144

# Lossless WebP for the web
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o qr.webp

# Branded style with custom patterns
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o branded.svg \
  --fg "#1a1a2e" --bg "#f5f5f5" --body circle --eye rounded --dot flower

# With center logo (use --level H for best scannability)
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o logo-qr.png \
  --logo "https://qrdx.dev/logo.png" --level H

# Call-to-action frame with a label
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o menu.png \
  --frame banner-bottom --frame-text "Scan for the menu"

# Linear gradient foreground
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o gradient.svg \
  --fg '{"type":"linear","stops":[{"color":"#6366f1","offset":0},{"color":"#ec4899","offset":100}],"angle":135}'

# Radial gradient background
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o radial-bg.svg \
  --bg '{"type":"radial","stops":[{"color":"#fef9c3","offset":0},{"color":"#fde047","offset":100}]}'

# Gradient fg + gradient eye color
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o multi-gradient.svg \
  --fg '{"type":"linear","stops":[{"color":"#0ea5e9","offset":0},{"color":"#6366f1","offset":100}],"angle":90}' \
  --eye-color '{"type":"radial","stops":[{"color":"#f97316","offset":0},{"color":"#ef4444","offset":100}]}'

# Arrow template
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o arrow.svg --template Arrow

# Halloween template with spooky styling (keep a light background so it scans)
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o halloween.svg \
  --template Halloween --body circle --eye gear --dot leaf --fg "#1a0a00"

# Combined: template + gradient + logo
npx @qrdx/cli@0.0.7 generate "https://qrdx.dev" -o full.svg \
  --template StandardBox --level H \
  --fg '{"type":"linear","stops":[{"color":"#1e3a5f","offset":0},{"color":"#3b82f6","offset":100}],"angle":45}' \
  --logo "https://qrdx.dev/logo.png"

# Wi-Fi QR (put the real network name and password in the command only)
npx @qrdx/cli@0.0.7 generate "WIFI:T:WPA;S:<network>;P:<password>;;" -o wifi.png

# vCard
npx @qrdx/cli@0.0.7 generate "BEGIN:VCARD
VERSION:3.0
FN:Jane Smith
TEL:+15551234567
EMAIL:jane@example.com
END:VCARD" -o contact.svg

# One PNG per row of a CSV, named by its "name" column
npx @qrdx/cli@0.0.7 batch links.csv -o codes --format png --size 1024 --body rounded
```

## Present Results to User

The CLI prints `Saved to <path> (<width>×<height>)`. Tell the user:

```
QR code saved to **{outputPath}** ({format}, {width}×{height}).
```

Take the dimensions from that line: a frame makes the file larger than `--size`, and EPS dimensions are in points.

If SVG or EPS: mention it scales to any size without losing quality (EPS is the one print shops ask for).
If PNG or WebP: mention the pixel dimensions.
If a frame or template was used: name it, and the frame label.
If gradients were used: briefly describe the effect (e.g. "indigo-to-pink diagonal gradient").
For a Wi-Fi code: say it holds the network's login, without repeating the password.
For `batch`: say how many codes were saved, where, and point to `errors.csv` if rows were skipped.

## Troubleshooting

Invalid input makes the CLI exit with code `1` and print the reason: `✗ …` for a bad flag, `■ …` when rendering fails. Nothing is written.

**`No data to encode`**: the data string is missing. Wrap multi-line values (vCard, Wi-Fi) in quotes.

**`Invalid --body "…"` / `--eye` / `--dot` / `--level` / `--template` / `--frame`**: the message lists the accepted values. Template IDs are case-sensitive: `Arrow`, not `arrow`.

**`Invalid gradient JSON` / `Invalid gradient`**: single-quote the JSON in the shell, use double quotes inside it, and give at least 2 stops with `offset` 0–100.

**`Unsupported output format`**: use a `.svg`, `.png`, `.webp` or `.eps` file name.

**`--format … does not match the output file`**: change the extension or drop `--format`.

**`Invalid --size …` (PNG or WebP)**: raster output stops at 10000 px. Use `.svg` or `.eps` for larger prints.

**`Invalid --frame-text …`**: the label is limited to 24 characters.

**`ENOENT: no such file or directory`**: the output folder doesn't exist. Write to an existing folder, or create it first if that's where the user asked for the file.

**`Data too long`**: too much data for one QR code. Shorten it (for a long URL, use a short link).

**`Could not download logo`**: the `--logo` URL must be publicly reachable. Use a direct image URL (`.png`, `.svg`, `.jpg`).

**`PNG output needs the sharp package`** (also WebP): sharp's native binary didn't install on this platform. Use `.svg` or `.eps`, or reinstall following https://sharp.pixelplumbing.com/install.

**`Unknown option`**: the flag doesn't exist in 0.0.7. Check the table above.

**npm `EBADENGINE` warning or a syntax error on start**: the CLI needs Node.js 22 or later. Check `node --version`.

**QR code doesn't scan**: use `--level H` with a logo, prefer `square` or `rounded` eyes, keep strong contrast between `--fg` and `--bg`, and add `--margin 4` if the code will sit on a dark or busy background.
