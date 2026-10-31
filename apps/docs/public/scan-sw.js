// QRdx scanner service worker. Registered with scope "/scan" by the scanner
// page, so it only ever controls /scan. It keeps the scanner's page shell and
// static assets for offline use. API responses are never cached.

const CACHE = "qrdx-scan-v1";
const SHELL = "/scan";
const MAX_ASSETS = 120;
// The WebAssembly decoder used by browsers without a built-in BarcodeDetector.
const DECODER_PREFIX = "https://fastly.jsdelivr.net/npm/zxing-wasm@";

const sameOrigin = (url) => url.origin === self.location.origin;
// Content-hashed, so a cached copy is always correct.
const isImmutable = (url) =>
  (sameOrigin(url) && url.pathname.startsWith("/_next/static/")) ||
  url.href.startsWith(DECODER_PREFIX);
const isIcon = (url) =>
  sameOrigin(url) &&
  /^\/(favicon[^/]*|site\.webmanifest|web-app-manifest-[^/]+\.png|apple-touch-icon\.png)$/.test(
    url.pathname,
  );

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
          names
            .filter((name) => name.startsWith("qrdx-scan-") && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // API responses (link checks) always go to the network and are never cached.
  if (sameOrigin(url) && url.pathname.startsWith("/api/")) return;

  // The scanner page: network first, the cached shell when offline.
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
        .catch(async () => (await caches.match(SHELL)) ?? Response.error()),
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
        .catch(async () => (await caches.match(request)) ?? Response.error()),
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
