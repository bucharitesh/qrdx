// The installable scanner (lib/scanner-app.ts): one app per language, each
// scoped to its own scanner page, with a share target the service worker
// answers on the device.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST as englishShare } from "@/app/scan/share/route";
import { manualInstall } from "@/components/scanner/install-app";
import { launchIntent } from "@/components/scanner/shared-images";
import { LOCALES } from "@/lib/i18n/config";
import {
  SHARE_CACHE,
  SHARE_FIELD,
  SHARED_HASH,
  scannerManifest,
  scannerManifestPath,
  scannerScope,
  scannerSharePath,
  sharedRedirect,
} from "@/lib/scanner-app";
import { localizedScannerManifest } from "@/lib/scanner-app-server";

const PUBLIC = path.join(import.meta.dirname, "../../public");
const COPY = {
  name: "QRdx Scanner",
  shortName: "QRdx Scanner",
  description: "Scan codes.",
  cameraShortcut: "Scan with camera",
  imageShortcut: "Scan from image",
};

describe("scanner manifest", () => {
  it("keeps English canonical at /scan, with the id existing installs have", () => {
    const manifest = scannerManifest("en", COPY);
    expect(manifest).toMatchObject({
      id: "/scan",
      start_url: "/scan",
      scope: "/scan",
      display: "standalone",
      lang: "en",
    });
    expect(scannerManifestPath("en")).toBe("/scan/manifest.webmanifest");
  });

  it("installs each language as its own app on its own scanner page", () => {
    const manifest = scannerManifest("hi", COPY);
    expect(manifest).toMatchObject({
      id: "/hi/scan",
      start_url: "/hi/scan",
      scope: "/hi/scan",
      lang: "hi",
    });
    expect(manifest.share_target?.action).toBe("/hi/scan/share");
    expect(scannerManifestPath("pt-BR")).toBe(
      "/pt-br/scan/manifest.webmanifest",
    );
  });

  it.each(LOCALES)("keeps every %s URL inside the app's scope", (locale) => {
    const manifest = scannerManifest(locale, COPY);
    const scope = scannerScope(locale);
    expect(manifest.start_url).toBe(scope);
    expect(manifest.share_target?.action).toBe(scannerSharePath(locale));
    expect(scannerSharePath(locale).startsWith(`${scope}/`)).toBe(true);
    for (const shortcut of manifest.shortcuts ?? []) {
      expect(shortcut.url.startsWith(`${scope}#`)).toBe(true);
    }
  });

  it("accepts only images, posted as files (never in the URL)", () => {
    expect(scannerManifest("en", COPY).share_target).toEqual({
      action: "/scan/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: SHARE_FIELD, accept: ["image/*"] }] },
    });
  });

  it("has maskable and plain icons, and every icon file exists", () => {
    const manifest = scannerManifest("en", COPY);
    const purposes = new Set(manifest.icons?.map((icon) => icon.purpose));
    expect(purposes).toEqual(new Set(["any", "maskable", "monochrome"]));
    expect(
      manifest.icons?.some(
        (icon) => icon.purpose === "maskable" && icon.sizes === "512x512",
      ),
    ).toBe(true);
    const files = [
      ...(manifest.icons ?? []),
      ...(manifest.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? []),
      { src: "/app-icons/scanner/apple-touch-icon.png" },
    ];
    for (const icon of files) {
      expect(existsSync(path.join(PUBLIC, icon.src)), icon.src).toBe(true);
    }
  });

  it("names the app from the catalog", async () => {
    const manifest = await localizedScannerManifest("en");
    expect(manifest.name).toBe("QRdx Scanner");
    expect(manifest.shortcuts?.map((shortcut) => shortcut.name)).toEqual([
      "Scan with camera",
      "Scan from image",
    ]);
  });
});

describe("share target", () => {
  it("matches the service worker's names", () => {
    const worker = readFileSync(path.join(PUBLIC, "scan-sw.js"), "utf8");
    expect(worker).toContain(`const SHARE_CACHE = "${SHARE_CACHE}";`);
    expect(worker).toContain(`const SHARE_FIELD = "${SHARE_FIELD}";`);
    expect(worker).toContain(`\`\${SHELL}${SHARED_HASH}\``);
  });

  it("sends a share that reached the server back to the scanner, unread", async () => {
    const request = new Request("https://qrdx.dev/scan/share", {
      method: "POST",
      body: new FormData(),
    });
    const response = englishShare(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://qrdx.dev/scan#shared",
    );
    expect(request.bodyUsed).toBe(false);
  });

  it("keeps the language of a translated scanner", () => {
    const response = sharedRedirect(
      new Request("https://qrdx.dev/ja/scan/share", { method: "POST" }),
      "ja",
    );
    expect(response.headers.get("location")).toBe(
      "https://qrdx.dev/ja/scan#shared",
    );
  });

  it("reads how the app was opened", () => {
    expect(launchIntent("#shared")).toBe("shared");
    expect(launchIntent("#image")).toBe("image");
    expect(launchIntent("#camera")).toBe("camera");
    expect(launchIntent("")).toBeNull();
    expect(launchIntent("#faq")).toBeNull();
  });
});

describe("install steps", () => {
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";
  const IPAD_DESKTOP =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15";
  const MAC_SAFARI_16 =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15";
  const MAC_CHROME =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
  const MAC_FIREFOX =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.6; rv:145.0) Gecko/20100101 Firefox/145.0";

  it("shows Home Screen steps on iPhone and iPad", () => {
    expect(manualInstall(IPHONE, 5)).toBe("ios");
    expect(manualInstall(IPAD_DESKTOP, 5)).toBe("ios");
  });

  it("shows Dock steps in Safari 17 or later on a Mac", () => {
    expect(manualInstall(IPAD_DESKTOP, 0)).toBe("mac");
    expect(manualInstall(MAC_SAFARI_16, 0)).toBeNull();
  });

  it("leaves browsers with an install prompt, or none at all, alone", () => {
    expect(manualInstall(MAC_CHROME, 0)).toBeNull();
    expect(manualInstall(ANDROID_CHROME, 5)).toBeNull();
    expect(manualInstall(MAC_FIREFOX, 0)).toBeNull();
  });
});
