# Flam QR Web Demo

A full-featured demo application showcasing the `@repo/qr` library capabilities.

**Live Demo:** [DEMO](https://qr.flamapp.tech)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm/yarn

### Installation

```bash
# From the monorepo root
pnpm install

# Start the development server
pnpm dev

# Or start only the web app
pnpm dev --filter web
```

The app will be available at `http://localhost:3000`

### Building for Production

```bash
# Build the web app
pnpm build --filter web

# Start the production server
cd apps/web
pnpm start
```

### Analyzing Bundle Size

```bash
cd apps/web
pnpm analyze
```

## Key Components

### Template Frames

Allows users to choose from pre-designed QR code templates with visual previews.

### Download Options

Provides multiple export formats:
- PNG (High quality)
- JPG (Compressed)
- SVG (Vector, scalable)

### Color Picker (`components/color-picker.tsx`)

Custom color picker with:
- HEX input field
- Visual color selector
- Outside click detection

## Customization

### Adding New Templates

Templates are defined in `packages/qr/templates.tsx`. To add a new template:

1. Add the template definition to the templates array
2. The template will automatically appear in the selector

### Modifying Styles

Global styles are in `app/globals.css`. Component-specific styles use Tailwind CSS classes.

### Changing Default Colors

Default colors are defined in the `QRStyles` interface state in `app/page.tsx`:

```tsx
const [qrStyles, setQrStyles] = useState<QRStyles>({
  showLogo: false,
  qrColor: "#000000",      // Default QR color
  eyeColor: "#000000",      // Default eye color
  dotColor: "#000000",      // Default dot color
  backgroundColor: "#ffffff", // Default background
  templateId: "default",
});
```

## Configuration

### Next.js Configuration

The app uses shared configuration from `@repo/next-config`:

```typescript
// next.config.ts
import baseConfig from '@repo/next-config';

export default baseConfig({
  // Custom configuration here
});
```

### TypeScript Configuration

TypeScript is configured using the shared `@repo/typescript-config/nextjs.json`.

### Environment Variables

No environment variables are required for basic functionality.

## Deployment

### Vercel (Recommended)

The app is optimized for deployment on Vercel:

```bash
# Deploy to Vercel
vercel

# Deploy to production
vercel --prod
```

Configuration is in `vercel.json`:

```json
{
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=web...",
  "outputDirectory": ".next"
}
```

### Other Platforms

For other platforms, ensure you:
1. Build the entire monorepo: `pnpm build`
2. Set the output directory to `apps/web/.next`
3. Configure the start command: `cd apps/web && pnpm start`

## Performance Optimizations

- **Code Splitting:** Automatic route-based code splitting
- **Image Optimization:** Next.js Image component for optimized images
- **Bundle Analysis:** Use `pnpm analyze` to monitor bundle size
- **React 19:** Latest React features for better performance
- **Tailwind CSS:** Optimized CSS with PurgeCSS

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development

### Available Scripts

```bash
# Development server (port 3000)
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Type checking
pnpm typecheck

# Clean build artifacts
pnpm clean

# Analyze bundle size
pnpm analyze
```

### Adding UI Components

UI components are based on Radix UI. To add a new component:

1. Install the Radix UI primitive:
```bash
pnpm add @radix-ui/react-[component-name]
```

2. Create the component in `components/ui/`
3. Style with Tailwind CSS using `class-variance-authority`

## Troubleshooting

### QR Code Not Rendering

- Check that the URL is valid
- Ensure contrast ratio is sufficient (minimum 3:1)
- Verify image URLs are accessible (CORS issues)

### Download Not Working

- Check browser permissions for downloads
- Ensure popup blockers are disabled
- Try a different export format

### Type Errors

```bash
# Clean and reinstall
pnpm clean
pnpm install

# Regenerate types
pnpm typecheck
```

## Contributing

Contributions are welcome! Please ensure:
- Code follows the existing style
- TypeScript types are properly defined
- Components are accessible (WCAG compliant)
- Changes are tested in multiple browsers

## License

ISC License - See LICENSE file for details

## Links

- **Live Demo:** [qr.flamapp.tech](https://qr.flamapp.tech)
- **Package Documentation:** [QR Package](../../packages/qr/README.md)
- **Monorepo Root:** [Main README](../../README.md)

