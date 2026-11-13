// QRdx scanner service worker. The scanner page registers it once per
// language, scoped to that language's scanner (/scan, /hi/scan …: see
// lib/scanner-app.ts), so it only ever controls the scanner. It keeps that
// page and its static assets for offline use, and receives images shared to
// the installed app. API responses are never cached, and no other page of
// the site (the dashboard, the editor, the docs) is ever touched.

// Bump to drop every cached page and asset on the next visit.
const VERSION = "v2";
// "/scan" or "/hi/scan": the scope this copy was registered with.
const SHELL = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const CACHE = `qrdx-scan-${VERSION}:${SHELL}`;
// Shared images wait here until the page reads (and deletes) them. Must
// match SHARE_CACHE, SHARE_FIELD and SHARED_HASH in lib/scanner-app.ts.
const SHARE_CACHE = "qrdx-scan-shared";
const SHARE_FIELD = "images";
const SHARE_PATH = `${SHELL}/share`;
const SHARED_URL = `${SHELL}#shared`;
const MAX_SHARED = 20;
const MAX_ASSETS = 120;
// The WebAssembly decoder used by browsers without a built-in BarcodeDetector.
const DECODER_PREFIX = "https://fastly.jsdelivr.net/npm/zxing-wasm@";

const sameOrigin = (url) => url.origin === self.location.origin;
// Content-hashed, so a cached copy is always correct.
const isImmutable = (url) =>
  (sameOrigin(url) && url.pathname.startsWith("/_next/static/")) ||
  url.href.startsWith(DECODER_PREFIX);
// Icons and manifests: what the installed app shows while offline.
const isIcon = (url) =>
  sameOrigin(url) &&
  (url.pathname === `${SHELL}/manifest.webmanifest` ||
    url.pathname.startsWith("/app-icons/scanner/") ||
    /^\/(favicon[^/]*|site\.webmanifest|web-app-manifest-[^/]+\.png|apple-touch-icon\.png)$/.test(
      url.pathname,
    ));

/** This scope's caches from earlier versions; the English scope also owns v1. */
const isOldCache = (name) =>
  name !== CACHE &&
  ((name.startsWith("qrdx-scan-v") && name.endsWith(`:${SHELL}`)) ||
    (SHELL === "/scan" && name === "qrdx-scan-v1"));

/** Same-origin static asset URLs referenced by the shell HTML. */
function assetsIn(html) {
  const urls = new Set();
  for (const match of html.matchAll(
    /(?:src|href)="(\/_next\/static\/[^"]+)"/g,
  )) {
    urls.add(match[1]);
  }
  return [...urls];
}

async function trim(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((request) => {
    const url = new URL(request.url);
    return url.pathname !== SHELL && !isIcon(url);
  });
  for (const request of assets.slice(
    0,
    Math.max(0, assets.length - MAX_ASSETS),
  )) {
    await cache.delete(request);
  }
}

async function cacheShell(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  await cache.put(SHELL, response);
  await Promise.all(
    assetsIn(html).map(async (path) => {
      if (await cache.match(path)) return;
      try {
        const asset = await fetch(path);
        if (asset.ok) await cache.put(path, asset);
      } catch {
        // Fetched again the next time it's needed.
      }
    }),
  );
  await trim(cache);
}

/**
 * The share target: keeps the shared images for the page, then opens the
 * scanner. Nothing is uploaded and nothing goes in the URL.
 */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const images = form
      .getAll(SHARE_FIELD)
      .filter(
        (file) =>
          typeof file === "object" &&
          typeof file.type === "string" &&
          file.type.startsWith("image/"),
      )
      .slice(0, MAX_SHARED);
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    const stamp = Date.now();
    await Promise.all(
      images.map((image, index) =>
        cache.put(
          `${SHELL}/shared/${stamp}-${index}`,
          new Response(image, { headers: { "Content-Type": image.type } }),
        ),
      ),
    );
  } catch {
    // The page says the image didn't arrive and offers the picker.
  }
  return Response.redirect(new URL(SHARED_URL, self.location.origin).href, 303);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(SHELL, { cache: "reload" })
      .then((response) => (response.ok ? cacheShell(response) : undefined))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter(isOldCache).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST" && sameOrigin(url)) {
    if (url.pathname === SHARE_PATH) event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET") return;

  // API responses (link checks) always go to the network and are never cached.
  if (sameOrigin(url) && url.pathname.startsWith("/api/")) return;

  // The scanner page: network first (so an update shows on the next
  // launch), the cached copy when offline.
  if (
    request.mode === "navigate" &&
    sameOrigin(url) &&
    url.pathname === SHELL
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            event.waitUntil(cacheShell(response.clone()));
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(SHELL, { cacheName: CACHE })) ??
            Response.error(),
        ),
    );
    return;
  }

  // Icons and the manifest: network first, cached copy offline.
  if (isIcon(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(request, copy)),
            );
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request, { cacheName: CACHE })) ??
            Response.error(),
        ),
    );
    return;
  }

  // Hashed static assets and the decoder: cache first.
  if (isImmutable(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          event.waitUntil(
            cache.put(request, response.clone()).then(() => trim(cache)),
          );
        }
        return response;
      }),
    );
  }
});
