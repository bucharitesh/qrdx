import { join } from "node:path";

// Geist (SIL OFL 1.1, the licence in ./fonts/OFL.txt) for images drawn on the
// server: Open Graph cards (./brand.tsx) and the frame labels the main app
// outlines into server PNGs. Server code reads the files with fs at run time.
// An app runs from its own folder (apps/<app>) under `next dev`, `next start`,
// on Vercel and in the standalone server, so the files are found from there,
// and each app's next.config lists OG_FONT_GLOB in outputFileTracingIncludes
// so its build ships them with every function.

/** The fonts folder, from an app's folder (apps/<app>). */
export const OG_FONTS_DIR = "../../packages/design-system/og/fonts";

/** For next.config's outputFileTracingIncludes. */
export const OG_FONT_GLOB = `${OG_FONTS_DIR}/*.ttf`;

export type OgFontFile =
  | "Geist-Regular.ttf"
  | "Geist-SemiBold.ttf"
  | "Geist-Bold.ttf";

/** Where a font file is at run time (`appDir`: the app's folder, the working directory). */
export function ogFontPath(file: OgFontFile, appDir = process.cwd()): string {
  return join(appDir, OG_FONTS_DIR, file);
}
