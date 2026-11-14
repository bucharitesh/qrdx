import "./styles.css";
import { prepareZXingModule } from "barcode-detector/ponyfill";
import { createRoot } from "react-dom/client";
import { IntlProvider } from "use-intl";
import { negotiateLocale } from "@/lib/i18n/accept-language";
import { App } from "./app";
import { installPlatformBridges } from "./native/platform";

installPlatformBridges();

// Images are decoded by the same ZXing reader as the website, bundled with
// the app (scripts/messages.mjs) so it works offline. Android's WebView also
// has a BarcodeDetector, but it relies on a Play services module that can
// fail until it's downloaded, so the app always uses the reader.
// biome-ignore lint/performance/noDelete: the property must be gone, not undefined
delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
prepareZXingModule({
  overrides: { locateFile: (file: string) => `/${file}` },
});

// Light and dark follow the device, like the website's default.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// The device's languages, matched the way the website matches browsers.
const locale = negotiateLocale(navigator.languages.join(","));
document.documentElement.lang = locale;
const messages = await import(`./generated/messages/${locale}.json`);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <IntlProvider
      locale={locale}
      messages={messages.default}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      <App />
    </IntlProvider>
  );
}
