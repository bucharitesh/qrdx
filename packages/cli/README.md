# @qrdx/cli

QR code generator CLI for developers. Generate styled, scannable QR codes as SVG, PNG or vector EPS — fully non-interactive and CI-friendly, with a guided prompt flow when run in a terminal. It renders with the same [`qrdx`](https://www.npmjs.com/package/qrdx) library as the [QRdx](https://qrdx.dev) web app.

## Install

Run without installing:

```bash
npx @qrdx/cli generate "https://example.com" -o qr.svg
```

Or install globally, which gives you the `qrdx` command:

```bash
npm install -g @qrdx/cli
qrdx generate "https://example.com" -o qr.svg
```

PNG output uses [sharp](https://sharp.pixelplumbing.com). It is an optional dependency that npm installs automatically when your platform supports it; if it is missing, SVG and EPS output still work and the CLI tells you how to fix PNG.

> The `qrdx` npm package is the React library. The CLI lives only in `@qrdx/cli`.

## Usage

```bash
qrdx generate <data> [options]
```

`gen` and `g` are aliases for `generate`, and `qrdx <data>` works too.

**Options**

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output` | `-o` | `qr.svg` | Output path — extension sets format (`.svg`, `.png` or `.eps`) |
| `--format` | | from the extension | `svg`, `png` or `eps`, for a file name without an extension |
| `--size` | | `512` | Output size: pixels for SVG and PNG, points (72 per inch) for EPS |
| `--level` | `-l` | `Q` | Error correction: `L` `M` `Q` `H` |
| `--body` | | `square` | Body dot pattern |
| `--eye` | | `square` | Corner eye pattern |
| `--dot` | | `square` | Corner dot pattern |
| `--fg` | | `#000000` | Foreground color (hex or JSON gradient) |
| `--bg` | | `#ffffff` | Background color (hex or JSON gradient) |
| `--eye-color` | | matches `--fg` | Corner eye color (hex or JSON gradient) |
| `--dot-color` | | matches `--fg` | Corner dot color (hex or JSON gradient) |
| `--logo` | | — | Center logo image URL (use with `--level H`) |
| `--no-logo` | | — | Skip the logo prompt in interactive mode |
| `--margin` | | `0` | Quiet zone margin (modules) |
| `--template` | | — | Decorative template: `Arrow` `StandardBox` `SquareBorder` `StrikedBox` `Halloween` |
| `--frame` | | — | Call-to-action frame: `none` `banner-bottom` `banner-top` `border` `rounded-border` `speech-bubble` |
| `--frame-text` | | `Scan me` | Frame label, up to 24 characters (`""` hides it) |
| `--frame-color` | | `#000000` | Frame color (hex) |
| `--frame-text-color` | | white on banners | Frame label color (hex) |
| `--help` | `-h` | | Show all options |
| `--version` | `-v` | | Show the version |

Invalid values (unknown pattern, template, frame, level, size, output extension, malformed gradient JSON, frame text over 24 characters or a non-hex frame color) exit with code `1` and a message listing the accepted values. `--frame-text` or a frame color without `--frame` uses `banner-bottom`. A frame adds space around the code, so the file is larger than `--size`.

## Examples

```bash
# Basic SVG
qrdx generate "https://qrdx.dev" -o qr.svg

# High-res PNG for print
qrdx generate "https://qrdx.dev" -o qr.png --size 2048 --level H

# Vector EPS for a print shop or Illustrator, 2 inches wide
qrdx generate "https://qrdx.dev" -o qr.eps --size 144

# Branded style
qrdx generate "https://qrdx.dev" \
  --body circle --eye rounded \
  --fg "#1a1a2e" --bg "#f5f5f5" \
  -o branded.svg

# With center logo
qrdx generate "https://qrdx.dev" \
  --logo "https://qrdx.dev/logo.png" --level H \
  -o logo-qr.png

# Gradient foreground
qrdx generate "https://qrdx.dev" -o gradient.svg \
  --fg '{"type":"linear","stops":[{"color":"#6366f1","offset":0},{"color":"#ec4899","offset":100}],"angle":135}'

# Template
qrdx generate "https://qrdx.dev" --template Arrow -o arrow.svg

# "Scan me" frame
qrdx generate "https://qrdx.dev/menu" --frame banner-bottom --frame-text "Scan for the menu" -o menu.png

# Wi-Fi QR
qrdx generate "WIFI:T:WPA;S:MyNetwork;P:MyPassword;;" -o wifi.svg

# Interactive mode (TTY)
qrdx generate
```

## Patterns

**Body** (`--body`): `square` `circle` `circle-large` `diamond` `circle-mixed` `pacman` `rounded` `small-square` `vertical-line` `horizontal-line` `liquid` `liquid-horizontal` `liquid-vertical` `classy` `classy-rounded` `leaf` `plus` `hexagon` `star` `heart` `random-dots` `mosaic` `octagon`

**Eye** (`--eye`): `square` `rounded` `gear` `circle` `diya` `extra-rounded` `message` `pointy` `leaf` `drop` `octagon` `bevel` `squircle` `cushion` `shield` `petal` `leaf-reverse`

**Dot** (`--dot`): `square` `rounded` `circle` `message` `message-reverse` `diya` `diya-reverse` `rounded-triangle` `leaf` `drop` `plus` `cross-rounded` `hexagon` `octagon` `flower` `heart` `squircle` `dots` `extra-rounded` `leaf-reverse` `drop-reverse`

See them all at [qrdx.dev/docs/styles](https://qrdx.dev/docs/styles). Every option decodes in our tests; `square` and `rounded` eyes scan most reliably, and `circle` eyes may be missed by strict scanners. Curly eyes and diamond, star and banner dots were retired because they don't scan reliably.

## Gradients

Pass a JSON object to `--fg`, `--bg`, `--eye-color` or `--dot-color`:

```bash
# Linear (angle in degrees: 0 = left→right, 90 = top→bottom)
--fg '{"type":"linear","stops":[{"color":"#6366f1","offset":0},{"color":"#ec4899","offset":100}],"angle":135}'

# Radial
--bg '{"type":"radial","stops":[{"color":"#fef9c3","offset":0},{"color":"#fde047","offset":100}]}'
```

Each gradient needs at least 2 stops; `offset` is a percentage from 0 to 100.

## EPS

`.eps` files are vector PostScript (EPSF-3.0) for print shops and design tools. `--size` is the width in points, so `--size 144` is 2 inches. Gradients print as their first color and there is no transparency. PNG and JPEG logos are embedded; other logo formats are converted with sharp when it is installed, and otherwise left out with a warning.

## Interactive mode

When run in a TTY without an output path or data, `qrdx generate` starts a guided prompt flow — data, output path, then optionally advanced customizations (patterns, colors, template, logo, margin). In CI (`CI=true`) or when stdin/stdout is not a TTY it never prompts.

## Requirements

Node.js ≥ 18

## Links

- [CLI docs](https://qrdx.dev/docs/developers/cli)
- [qrdx.dev](https://qrdx.dev) — web app: static and dynamic QR codes, hosted pages and scan analytics
- [Image API](https://qrdx.dev/docs/developers/image-api) and [MCP server](https://qrdx.dev/docs/developers/mcp) — QR codes over HTTP or from AI assistants, no install
- [github.com/bucharitesh/qrdx](https://github.com/bucharitesh/qrdx) — source

## License

[AGPL-3.0-or-later](https://github.com/bucharitesh/qrdx/blob/main/license.md)
