# qrdx-cli

QR code generator CLI for developers. Generate styled, scannable QR codes as SVG or PNG — fully non-interactive, CI-friendly.

## Install

```bash
npm install -g qrdx-cli
```

Or run without installing:

```bash
npx qrdx-cli generate "https://example.com" -o qr.svg
```

## Usage

```bash
qrdx generate <data> [options]
```

**Options**

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output` | `-o` | — | Output path — extension sets format (`.svg` or `.png`) |
| `--size` | | `512` | Output pixel size |
| `--level` | `-l` | `Q` | Error correction: `L` `M` `Q` `H` |
| `--body` | | `square` | Body dot pattern |
| `--eye` | | `square` | Corner eye pattern |
| `--dot` | | `square` | Corner dot pattern |
| `--fg` | | `#000000` | Foreground color |
| `--bg` | | `#ffffff` | Background color |
| `--eye-color` | | — | Corner eye color override |
| `--dot-color` | | — | Corner dot color override |
| `--logo` | | — | Center logo URL |
| `--margin` | | `0` | Quiet zone margin (modules) |

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
  -o logo-qr.svg

# Wi-Fi QR
qrdx generate "WIFI:T:WPA;S:MyNetwork;P:MyPassword;;" -o wifi.svg

# Interactive mode (TTY)
qrdx generate
```

## Patterns

**Body** (`--body`): `square` `circle` `circle-large` `diamond` `circle-mixed` `pacman` `rounded` `small-square` `vertical-line`

**Eye** (`--eye`): `square` `rounded` `gear` `circle` `diya` `cushion` `boxy` `pointed`

**Dot** (`--dot`): `square` `rounded` `circle` `heart` `diamond` `star`

## Interactive mode

When run in a TTY without flags, `qrdx generate` starts a guided prompt flow — output path, then optionally advanced customizations (patterns, colors, logo).

## Requirements

Node.js ≥ 18

## Links

- [qrdx.dev](https://qrdx.dev) — web app
- [github.com/qrdx/qrdx](https://github.com/qrdx/qrdx) — source

## License

MIT
