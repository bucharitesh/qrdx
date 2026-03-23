import "@/styles/styles.css";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import type { Metadata, Viewport } from "next";
import FeaturebaseScript from "@/components/featurebase-script";
import { PostHogInit } from "@/components/posthog-init";
import { ThemeScript } from "@/components/theme-script";
import { Provider } from "./providers";

export const metadata: Metadata = {
  title: "Free QR Code Generator | QRdx — Unlimited, AI-Powered, No Signup",
  description:
    "Create unlimited free QR codes with AI-powered customization. No signup required. Custom colors, logos, dot patterns, analytics, and a developer API. Open-source and free forever.",
  keywords:
    "free qr code generator, unlimited qr codes, custom qr code, qr code generator no signup, ai qr code generator, dynamic qr code free, qr code with logo free, open source qr code generator, react qr code component, qr code generator online free, qr code customization, qr analytics, npm package, qr code integrations, developer tools, qr code library, scannable qr codes, qr code infrastructure",
  authors: [{ name: "Ritesh Bucha" }],
  creator: "Ritesh Bucha",
  openGraph: {
    title: "Free QR Code Generator | QRdx — Unlimited, AI-Powered, No Signup",
    description:
      "Create unlimited free QR codes with AI-powered customization. No signup required. Custom colors, logos, dot patterns, analytics, and a developer API. Open-source and free forever.",
    url: "https://qrdx.dev/",
    siteName: "QRdx",
    images: [
      {
        url: "https://qrdx.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "QRdx - Free Unlimited QR Code Generator",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free QR Code Generator | QRdx — Unlimited, AI-Powered, No Signup",
    description:
      "Create unlimited free QR codes with AI-powered customization. No signup required. Custom colors, logos, dot patterns, analytics, and a developer API. Open-source and free forever.",
    creator: "@bucharitesh",
    images: ["https://qrdx.dev/og-image.png"],
  },
  metadataBase: new URL("https://qrdx.dev"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html className={cn(fonts)} lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Architects+Daughter&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Fira+Code:wght@300..700&family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&family=IBM+Plex+Sans:ital,wght@0,100..700;1,100..700&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400..700;1,400..700&family=Merriweather:ital,opsz,wght@0,18..144,300..900;1,18..144,300..900&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Outfit:wght@100..900&family=Oxanium:wght@200..800&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Roboto+Mono:ital,wght@0,100..700;1,100..700&family=Roboto:ital,wght@0,100..900;1,100..900&family=Source+Code+Pro:ital,wght@0,200..900;1,200..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=Space+Grotesk:wght@300..700&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
        <meta name="darkreader-lock" />
      </head>
      <body className="antialiased font-sans bg-background relative flex min-h-screen flex-col">
        <Provider>{children}</Provider>
        <FeaturebaseScript />
        <PostHogInit />
      </body>
    </html>
  );
}
