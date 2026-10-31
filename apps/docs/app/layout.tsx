import "@/styles/styles.css";
import { cn } from "@repo/design-system/lib/utils";
import type { Metadata, Viewport } from "next";
import { ThemeScript } from "@/components/theme-script";
import { fonts } from "@/lib/fonts";
import {
  baseUrl,
  siteDescription,
  siteKeywords,
  siteName,
  siteTitle,
} from "@/lib/metadata";
import { Provider } from "./providers";

// No canonical/og:url here (every child would inherit them); pages set their own via createMetadata().
export const metadata: Metadata = {
  metadataBase: baseUrl,
  title: {
    default: siteTitle,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: siteKeywords,
  authors: [{ name: "Ritesh Bucha", url: "https://github.com/bucharitesh" }],
  creator: "Ritesh Bucha",
  openGraph: {
    siteName,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@bucharitesh",
  },
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
        <meta name="darkreader-lock" />
      </head>
      <body className="antialiased font-sans bg-background relative flex min-h-screen flex-col">
        {/* PostHog and Featurebase load from the consent manager in Provider, after consent. */}
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
