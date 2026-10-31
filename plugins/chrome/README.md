# QRdx for Chrome

A Manifest V3 extension that shows a styled QR code for the current tab, any link, image or selected text. It is built with the [`qrdx`](../../packages/qrdx) library and runs entirely in the browser.

- Popup: QR code for the current tab's URL (editable), 12 style presets taken from the QRdx playground, foreground and background colors, export size (256 to 2048 px).
- Actions: Download PNG, Download SVG, Copy image (PNG), Open in QRdx (opens qrdx.dev).
- Context menu: "QR code for this link", "QR code for this image" (encodes the image address) and "QR code for selected text" open the popup with that value.
- Remembers the last style and size (`chrome.storage.local`), follows the system light or dark theme, keyboard and screen-reader friendly.
- Warns when content is too long for a QR code, when colors have low contrast, and when a code is light on dark (phone cameras read these; some older scanner apps don't).

## Build and load unpacked

```bash
pnpm --filter @qrdx/chrome-extension build   # writes plugins/chrome/dist
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `plugins/chrome/dist`.
3. Pin QRdx from the puzzle-piece menu, then click its icon on any page.

`dist/` contains `manifest.json`, `popup.html`, `popup.css`, `popup.js`, `background.js` (service worker) and `icons/`.

For development, run `pnpm --filter @qrdx/chrome-extension dev` (tsup watch) and press the reload button on the extension card after each change. Type-check with `pnpm --filter @qrdx/chrome-extension typecheck`.

To produce the upload zip for the Chrome Web Store (not done automatically): `cd plugins/chrome/dist && zip -r ../qrdx-chrome.zip .`

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the current tab's URL, only after you click the extension icon or one of its menu items. No access to page content. |
| `contextMenus` | The "QR code for this link / image / selected text" menu items. |
| `storage` | Remember your last style locally, and hand a context-menu value to the popup (`chrome.storage.session`, cleared as soon as the popup reads it). |

There are no host permissions and no content scripts.

When you use a context-menu item, the extension opens its popup with `chrome.action.openPopup()` (Chrome 127+). If Chrome can't open the popup, it opens the same page in a small window instead.

## Privacy

No data leaves your browser. QR codes are drawn locally by the bundled `qrdx` library; the extension makes no network requests, has no analytics and no account. Your last style is stored in `chrome.storage.local` on this device only (not synced). The page URL, link, image address or selected text you turn into a QR code is never sent anywhere. "Open in QRdx" opens https://qrdx.dev in a new tab and does not pass the current page's URL.

## Icons

`public/icons/icon-{16,32,48,128}.png` are generated from `apps/docs/public/logo.png`. To regenerate (ImageMagick):

```bash
cd plugins/chrome
for s in 16 32 48 128; do magick ../../apps/docs/public/logo.png -filter Lanczos -resize ${s}x${s} -strip public/icons/icon-$s.png; done
```

## Chrome Web Store listing copy

**Name:** QRdx — QR code for this page

**Short description** (max 132 characters):

> Styled QR codes for this page, any link, image or selected text. Download PNG or SVG, or copy. Made in your browser.

**Category:** Tools

**Long description:**

> Turn the page you're on into a good-looking QR code in one click.
>
> QRdx shows a QR code for the current tab the moment you open it. Pick one of 12 styles from the QRdx playground (Classic, Minimal, Modern, Ocean Blue, Nature, Sunset, Lavender, Caffeine, Pastel Dream, Midnight, Neon, Cyberpunk), adjust the foreground and background colors, and download it as PNG or SVG at up to 2048 × 2048 px, or copy the image straight to your clipboard.
>
> Right-click any link, image or selected text and choose "QR code for this link", "QR code for this image" or "QR code for selected text" to make a code for exactly that. You can also edit the content in the popup to encode any text or URL.
>
> Helpful checks: QRdx tells you when the content is too long for a QR code, when your colors don't have enough contrast to scan reliably, and when a code is light on dark.
>
> Private by design: everything happens in your browser. No account, no tracking, no network requests. Your last style is remembered on this device only.
>
> Want a logo in the middle, more patterns or decorative templates? Open the full editor at qrdx.dev.

**Screenshot captions:**

1. A styled QR code for the page you're on, in one click.
2. Choose from 12 styles, then fine-tune the colors.
3. Right-click any link, image or selected text to make its QR code.
4. Download PNG or SVG up to 2048 px, or copy the image.
5. Light and dark mode, and it remembers your last style.

**Privacy practices (dashboard answers):** single purpose "Generate QR codes for the current page, links, images and selected text"; collects no user data; `activeTab`, `contextMenus` and `storage` justified as in the table above; no remote code.
