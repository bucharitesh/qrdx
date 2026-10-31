import "@/styles/styles.css";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import type { Metadata, Viewport } from "next";
import FeaturebaseScript from "@/components/featurebase-script";
import { NotOnCustomerPages } from "@/components/landing/not-on-customer-pages";
import { PostHogInit } from "@/components/posthog-init";
import { ThemeScript } from "@/components/theme-script";
import { baseUrl, siteDescription, siteName, siteTitle } from "@/lib/metadata";
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
  keywords: [
    "free qr code generator",
    "unlimited qr codes",
    "custom qr code",
    "qr code generator no signup",
    "qr code with logo free",
    "ai qr code generator",
    "open source qr code generator",
    "react qr code component",
    "qr code npm package",
    "svg qr code",
  ],
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
        <Provider>{children}</Provider>
        {/* Never on customer pages (/p, /q gates, /ended; only owner-set pixels load there) or the no-tracking scanner (/scan). */}
        <NotOnCustomerPages>
          {process.env.NODE_ENV === "production" &&
            Boolean(process.env.NEXT_PUBLIC_FEATUREBASE_APP_ID) && (
              <FeaturebaseScript />
            )}
          {process.env.NODE_ENV === "production" && <PostHogInit />}
        </NotOnCustomerPages>
      </body>
    </html>
  );
}
