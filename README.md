# qrdx

A powerful, flexible QR code generation library and demo application, now open source.

**[Live Demo](https://qr.flamapp.tech)** • Built with Next.js and React

<div>
  <img src="https://img.shields.io/badge/license-ISC-blue" alt="License" />
  <img src="https://img.shields.io/badge/react-19.2.0-blue" alt="React Version" />
  <img src="https://img.shields.io/badge/next.js-16.0.0-black" alt="Next.js Version" />
</div>

## Overview

qrdx is a production-ready QR code generation library with extensive customization options. Originally built for Flam's internal use, it now powers beautiful, customizable QR codes for anyone.

### Key Features

- 🎨 **Highly Customizable** — Colors, logos, templates, and more
- 🎭 **Multiple Templates** — Pre-designed templates for various use cases
- 📱 **Multiple Formats** — SVG, PNG, JPG support with Canvas and SVG rendering
- ♿ **Accessibility** — Automatic contrast checking for scannable QR codes
- 🖼️ **Logo Support** — Embed custom logos or images in QR codes
- ⚡ **Fast & Lightweight** — Optimized for performance
- 🎯 **TypeScript First** — Full type safety out of the box
- 🌐 **Server & Client** — Works in both browser and Node.js environments

## Demo

Try it out at **[qr.flamapp.tech](https://qr.flamapp.tech)**

The demo showcases:
- Real-time QR code generation
- Color customization with live preview
- Template selection
- Logo embedding
- Contrast ratio validation
- Multiple download formats
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm/yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/bucharitesh/qrdx.git
cd qrdx

# Install dependencies
pnpm install

# Run the development server
pnpm dev
```

The web app will be available at `http://localhost:3000`

### Building for Production

```bash
# Build all packages and apps
pnpm build

# Start production server
cd apps/web
pnpm start
```

## Packages

### [@repo/qr](./packages/qr) — QR Code Generation Library

The core QR code generation library with extensive customization options.

**Features:**
- Canvas and SVG rendering
- Custom colors for QR code, background, eyes, and dots
- Logo/image embedding with excavation
- Multiple templates
- Error correction levels (L, M, Q, H)
- TypeScript support

**Basic Usage:**

```tsx
import { QRCode } from '@repo/qr';

export default function MyComponent() {
  return (
    <QRCode
      url="https://example.com"
      fgColor="#000000"
      bgColor="#ffffff"
      size={512}
    />
  );
}
```

[Read full documentation →](./packages/qr/README.md)

Shared TypeScript configurations for consistent type checking across the monorepo.


## Development

### Available Scripts

```bash
# Development
pnpm dev          # Start all apps in development mode
pnpm dev --filter web  # Start only the web app

# Building
pnpm build        # Build all packages and apps
pnpm build --filter @repo/qr  # Build only the QR package

# Testing & Quality
pnpm typecheck    # Run TypeScript type checking
pnpm check        # Run linting and formatting checks
pnpm fix          # Auto-fix linting and formatting issues

# Maintenance
pnpm clean        # Clean all node_modules
pnpm bump-deps    # Update all dependencies
```

### Project Tools

- **Build System:** [Turborepo](https://turborepo.com)
- **Package Manager:** [pnpm](https://pnpm.io)
- **Linting & Formatting:** [Biome](https://biomejs.dev)
- **Styling:** [Tailwind CSS](https://tailwindcss.com)
- **UI Components:** [Radix UI](https://radix-ui.com)
- **Forms:** [React Hook Form](https://react-hook-form.com)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see individual package LICENSE files for details.

The QR code generation is based on [qrcode.react](https://github.com/zpao/qrcode.react) by Paul O'Shannessy.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=bucharitesh/qrdx&type=date&legend=top-left)](https://www.star-history.com/#bucharitesh/qrdx&type=date&legend=top-left)

## Acknowledgments

- QR code generation based on qrcode.react
- UI components powered by Radix UI and Tailwind CSS

---

Made with ❤️ by Ritesh Bucha
