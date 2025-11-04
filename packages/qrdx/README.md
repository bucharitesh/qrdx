# qrdx

A powerful, flexible React component library for generating customizable QR codes.

## Features

- 🎨 **Highly Customizable** — Control colors for QR code, background, eyes, and dots
- 🖼️ **Logo Support** — Embed custom logos or images with automatic excavation
- 🎭 **Templates** — Pre-designed templates for various visual styles
- 📱 **Multiple Formats** — Canvas and SVG rendering with export options
- ♿ **Accessibility** — Built-in contrast checking utilities
- ⚡ **Performance** — Optimized rendering with Path2D support
- 🎯 **TypeScript** — Full type safety and IntelliSense support
- 🔒 **Error Correction** — Configurable error correction levels (L, M, Q, H)

## Installation

```bash
# Using pnpm (recommended in monorepo)
pnpm add qrdx@latest

# Using npm
npm install qrdx@latest

# Using yarn
yarn add qrdx@latest
```

## Basic Usage

### Simple QR Code

```tsx
import { QRCode } from 'qrdx';

export default function App() {
  return (
    <QRCode
      url="https://example.com"
      size={512}
    />
  );
}
```

### With Custom Colors

```tsx
import { QRCode } from 'qrdx';

export default function App() {
  return (
    <QRCode
      url="https://example.com"
      fgColor="#1a56db"
      bgColor="#f9fafb"
      eyeColor="#0d47a1"
      dotColor="#1976d2"
      size={512}
    />
  );
}
```

### With Logo

```tsx
import { QRCode } from 'qrdx';

export default function App() {
  return (
    <QRCode
      url="https://example.com"
      hideLogo={false}
      logo="https://example.com/logo.png"
      size={1024}
    />
  );
}
```

### With Template

```tsx
import { QRCode } from 'qrdx';

export default function App() {
  return (
    <QRCode
      url="https://example.com"
      templateId="gradient-blue"
      size={512}
    />
  );
}
```

### With Custom Dot Patterns

Choose from 7 different dot patterns:

```tsx
import { QRCode } from 'qrdx';

export default function App() {
  return (
    <QRCode
      url="https://example.com"
      bodyPattern="rounded"
      size={512}
    />
  );
}
```

Available patterns:
- `circle` — Classic circular dots (default)
- `square` — Modern square dots
- `diamond` — Diamond-shaped rotated squares
- `circle-mixed` — Circles with varying sizes
- `pacman` — Pill-shaped rounded rectangles
- `rounded` — Clean squares with smoothly rounded corners
- `clean-square` — Clean rectangles only

## API Reference

### QRCode Component

The main component for rendering QR codes.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `url` | `string` | **required** | The URL or text to encode |
| `size` | `number` | `128` | Size of the QR code in pixels |
| `scale` | `number` | `1` | Scale multiplier for the QR code |
| `fgColor` | `string` | `#000000` | Foreground/QR code color |
| `bgColor` | `string` | `#ffffff` | Background color |
| `eyeColor` | `string` | `fgColor` | Color for the position markers (eyes) |
| `dotColor` | `string` | `fgColor` | Color for the data dots |
| `hideLogo` | `boolean` | `true` | Whether to hide the logo |
| `logo` | `string` | Default Flam logo | URL to custom logo image |
| `templateId` | `string` | `'default'` | ID of the template to use |
| `level` | `'L' \| 'M' \| 'Q' \| 'H'` | `'L'` | Error correction level |
| `margin` | `number` | `0` | Margin around the QR code (in modules) |

#### Error Correction Levels

- **L (Low):** ~7% error correction
- **M (Medium):** ~15% error correction
- **Q (Quartile):** ~25% error correction
- **H (High):** ~30% error correction

Higher levels provide better resilience to damage but result in denser QR codes.

### QRCodeCanvas Component

Direct access to the canvas-based renderer.

```tsx
import { QRCodeCanvas } from 'qrdx';

export default function App() {
  return (
    <QRCodeCanvas
      value="https://example.com"
      size={512}
      bgColor="#ffffff"
      fgColor="#000000"
      level="Q"
      imageSettings={{
        src: "https://example.com/logo.png",
        height: 128,
        width: 128,
        excavate: true,
      }}
    />
  );
}
```

### Utility Functions

#### getQRAsSVGDataUri

Generate QR code as SVG data URI.

```tsx
import { getQRAsSVGDataUri } from 'qrdx';

const dataUri = await getQRAsSVGDataUri({
  value: "https://example.com",
  size: 512,
  fgColor: "#000000",
  bgColor: "#ffffff",
});
```

#### getQRAsCanvas

Generate QR code as canvas or data URL.

```tsx
import { getQRAsCanvas } from 'qrdx';

// Get as data URL
const dataUrl = await getQRAsCanvas(
  {
    value: "https://example.com",
    size: 1024,
  },
  "image/png"
);

// Get as canvas element
const canvas = await getQRAsCanvas(
  {
    value: "https://example.com",
    size: 1024,
  },
  "image/png",
  true
);
```

#### getQRData

Helper function to prepare QR code data with sensible defaults.

```tsx
import { getQRData } from 'qrdx';

const qrData = getQRData({
  url: "https://example.com",
  fgColor: "#000000",
  bgColor: "#ffffff",
  eyeColor: "#1a56db",
  dotColor: "#3b82f6",
  hideLogo: false,
  logo: "https://example.com/logo.png",
  margin: 4,
});
```

#### getContrastRatio

Calculate WCAG contrast ratio between two colors.

```tsx
import { getContrastRatio } from 'qrdx/utils';

const ratio = getContrastRatio("#000000", "#ffffff");
// Returns: 21 (maximum contrast)
```

#### getContrastLevel

Get contrast level assessment for QR code scanability.

```tsx
import { getContrastLevel } from 'qrdx/utils';

const level = getContrastLevel(4.5);
// Returns: { level: 'medium', warning: false, message: '...' }
```

## Templates

The library includes several pre-designed templates:

- `default` — Classic black and white
- `gradient-blue` — Blue gradient style
- `gradient-purple` — Purple gradient style
- `gradient-green` — Green gradient style
- `dots` — Rounded dot style
- `rounded` — Rounded corners style
- And many more...

Templates are automatically applied based on the `templateId` prop.

## Advanced Usage

### Server-Side Rendering

The QR code generation works in both client and server environments:

```tsx
import { getQRAsSVGDataUri } from 'qrdx';

export default async function ServerComponent() {
  const qrDataUri = await getQRAsSVGDataUri({
    value: "https://example.com",
    size: 512,
  });
  
  return <img src={qrDataUri} alt="QR Code" />;
}
```

### Downloading QR Codes

```tsx
import { getQRAsCanvas } from 'qrdx';

async function downloadQR() {
  const dataUrl = await getQRAsCanvas(
    {
      value: "https://example.com",
      size: 2048,
      fgColor: "#000000",
      bgColor: "#ffffff",
    },
    "image/png"
  );
  
  const link = document.createElement('a');
  link.download = 'qrcode.png';
  link.href = dataUrl;
  link.click();
}
```

### Custom Image Settings

```tsx
import { QRCodeCanvas } from 'qrdx';

<QRCodeCanvas
  value="https://example.com"
  size={1024}
  imageSettings={{
    src: "https://example.com/logo.png",
    height: 256,        // Logo height in QR modules
    width: 256,         // Logo width in QR modules
    excavate: true,     // Remove QR modules under the logo
    x: 384,            // Optional: x position
    y: 384,            // Optional: y position
  }}
/>
```

## Best Practices

### Contrast Requirements

For optimal scanability:
- Maintain a contrast ratio of **at least 3:1** (minimum)
- Aim for **4.5:1 or higher** for best results
- Use the built-in `getContrastRatio` utility to validate

### Size Recommendations

- **Minimum size:** 128px for basic QR codes
- **Recommended:** 512px for general use
- **High quality:** 1024px or larger for print
- **With logo:** Use larger sizes (1024px+) to maintain scanability

### Error Correction

- Use `Q` level when embedding logos
- Use `H` level for QR codes that might get damaged
- Use `L` level for simple, clean environments

### Logo Size

- Keep logo size between 10-30% of QR code area
- Enable `excavate: true` to maintain scanability
- Test scanning with your target devices

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```tsx
import type { QRProps, QRPropsCanvas, ImageSettings } from 'qrdx';

const imageSettings: ImageSettings = {
  src: "https://example.com/logo.png",
  height: 256,
  width: 256,
  excavate: true,
};

const qrProps: QRProps = {
  value: "https://example.com",
  size: 512,
  imageSettings,
};
```

## Browser Support

- Modern browsers with Canvas and SVG support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance

- Optimized Path2D rendering when available
- Efficient module excavation for logo placement
- Minimal re-renders with React hooks
- Supports high-DPI displays automatically

## License

ISC License - Based on [qrcode.react](https://github.com/zpao/qrcode.react) by Paul O'Shannessy

## Credits

- QR code generation algorithm: [qrcode.react](https://github.com/zpao/qrcode.react)
- Developed for [Flam](https://flamapp.ai)

