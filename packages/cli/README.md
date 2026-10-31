# @qrdx/cli

QR code generator CLI for developers. Generate styled, scannable QR codes as SVG or PNG — fully non-interactive and CI-friendly, with a guided prompt flow when run in a terminal.

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

PNG output uses [sharp](https://sharp.pixelplumbing.com). It is an optional dependency that npm installs automatically when your platform supports it; if it is missing, SVG output still works and the CLI tells you how to fix PNG.

> The `qrdx` npm package is the React library. The CLI lives only in `@qrdx/cli`.

## Usage

```bash
qrdx generate <data> [options]
```

`gen` and `g` are aliases for `generate`, and `qrdx <data>` works too.

**Options**

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output` | `-o` | `qr.svg` | Output path — extension sets format (`.svg` or `.png`) |
| `--size` | | `512` | Output pixel size |
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

**Body** (`--body`): `square` `circle` `circle-large` `diamond` `circle-mixed` `pacman` `rounded` `small-square` `vertical-line`

**Eye** (`--eye`): `square` `rounded` `gear` `circle` `diya` `extra-rounded` `message` `pointy` `curly`

**Dot** (`--dot`): `square` `rounded` `circle` `diamond` `message` `message-reverse` `diya` `diya-reverse` `rounded-triangle` `star` `banner`

Decorative patterns trade some scan tolerance for style. `square` and `rounded` eyes scan most reliably; test `circle` and `curly` eyes with the scanners your audience uses.

## Gradients

Pass a JSON object to `--fg`, `--bg`, `--eye-color` or `--dot-color`:

```bash
# Linear (angle in degrees: 0 = left→right, 90 = top→bottom)
--fg '{"type":"linear","stops":[{"color":"#6366f1","offset":0},{"color":"#ec4899","offset":100}],"angle":135}'

# Radial
--bg '{"type":"radial","stops":[{"color":"#fef9c3","offset":0},{"color":"#fde047","offset":100}]}'
```

Each gradient needs at least 2 stops; `offset` is a percentage from 0 to 100.

## Interactive mode

When run in a TTY without an output path or data, `qrdx generate` starts a guided prompt flow — data, output path, then optionally advanced customizations (patterns, colors, template, logo, margin). In CI (`CI=true`) or when stdin/stdout is not a TTY it never prompts.

## Requirements

Node.js ≥ 18

## Links

- [qrdx.dev](https://qrdx.dev) — web app and docs
- [github.com/bucharitesh/qrdx](https://github.com/bucharitesh/qrdx) — source

## License

[AGPL-3.0-or-later](https://github.com/bucharitesh/qrdx/blob/main/license.md)
