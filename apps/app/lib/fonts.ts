import { cn } from "@repo/design-system/lib/utils";
import { Geist, Geist_Mono, Mona_Sans } from "next/font/google";

// next/font must resolve `next`, which only the app can, so the brand faces
// live here rather than in @repo/design-system/lib/fonts.

/** Brand face: Mona Sans text for UI and body, its expanded widths for display. */
// `subsets` only picks what gets preloaded; latin-ext glyphs (₹, accents)
// still load on demand through the unicode-range @font-face rules.
const monaSans = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-mona-sans",
});

/** Code and data readouts. */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

/** Only the "Geist" font option on hosted landing pages uses this, so it isn't preloaded. */
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--font-geist-sans",
});

export const fonts = cn(
  monaSans.variable,
  geistMono.variable,
  geist.variable,
  "touch-manipulation font-sans antialiased",
);
