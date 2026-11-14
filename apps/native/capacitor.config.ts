import type { CapacitorConfig } from "@capacitor/cli";

// QRdx Scanner for iOS and Android (README.md). The web build in dist/ is
// the web scanner's UI (apps/app/components/scanner) with native camera
// scanning; nothing is loaded from a server.
const config: CapacitorConfig = {
  appId: "dev.qrdx.scanner",
  appName: "QRdx Scanner",
  webDir: "dist",
  ios: { contentInset: "never" },
  android: { allowMixedContent: false },
  plugins: {
    // Edge to edge on Android; the page pads itself with env(safe-area-inset-*).
    SystemBars: { insetsHandling: "native", style: "DEFAULT" },
  },
};

export default config;
