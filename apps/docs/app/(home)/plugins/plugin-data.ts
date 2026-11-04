// What /plugins adds to the catalog entries (packages/integrations/src/catalog/
// entries/plugins.ts): what kind of plugin it is, where it runs and where to
// install it. A plugin with a `storeUrl` installs from its store; the others
// install from source until they're listed.

import { CHROME_WEB_STORE_URL } from "@repo/integrations/src/catalog/entries/plugins";

const REPO = "https://github.com/bucharitesh/qrdx";

export type PluginSlug = "chrome" | "figma" | "raycast" | "canva";

export interface PluginInfo {
  slug: PluginSlug;
  /** Eyebrow, e.g. "Browser extension". */
  kind: string;
  /** Where it runs, as short chips. */
  platforms: string[];
  /** The store it will be listed in. */
  store: string;
  /** Store listing; set once it's published, and it becomes the main button. */
  storeUrl?: string;
  /** Install-from-source instructions: the README section, else the folder. */
  installUrl: string;
  sourceUrl: string;
}

export const PLUGINS: PluginInfo[] = [
  {
    slug: "chrome",
    kind: "Browser extension",
    platforms: ["Chrome 120+", "Windows", "macOS", "Linux", "ChromeOS"],
    store: "Chrome Web Store",
    storeUrl: CHROME_WEB_STORE_URL,
    installUrl: `${REPO}/tree/main/plugins/chrome#build-and-load-unpacked`,
    sourceUrl: `${REPO}/tree/main/plugins/chrome`,
  },
  {
    slug: "figma",
    kind: "Figma plugin",
    platforms: ["Figma Design", "Desktop app for macOS and Windows"],
    store: "Figma Community",
    installUrl: `${REPO}/tree/main/plugins/figma#import-for-development`,
    sourceUrl: `${REPO}/tree/main/plugins/figma`,
  },
  {
    slug: "raycast",
    kind: "Raycast extension",
    platforms: ["Raycast for macOS", "Raycast AI"],
    store: "Raycast Store",
    installUrl: `${REPO}/tree/main/plugins/raycast`,
    sourceUrl: `${REPO}/tree/main/plugins/raycast`,
  },
  {
    slug: "canva",
    kind: "Canva app",
    platforms: ["Canva editor", "Web and desktop app"],
    store: "Canva Apps Marketplace",
    installUrl: `${REPO}/tree/main/plugins/canva`,
    sourceUrl: `${REPO}/tree/main/plugins/canva`,
  },
];

export const REQUEST_PLUGIN_URL = `${REPO}/issues/new`;
