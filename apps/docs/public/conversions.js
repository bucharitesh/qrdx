/*!
 * QRdx conversion tracking — https://qrdx.dev/docs/tracking-and-conversions
 *
 * <script async src="https://qrdx.dev/conversions.js"></script>
 * <script>
 *   window.qrdx = window.qrdx || function () {
 *     (window.qrdx.q = window.qrdx.q || []).push(arguments);
 *   };
 *   qrdx("conversion", { name: "purchase", value: 49.99, currency: "USD", id: "ORDER-1234" });
 * </script>
 *
 * Remembers the qrdx_sid a QRdx dynamic code adds to your URL (first-party
 * cookie, 30 days; add data-storage="session" to the script tag to keep it for
 * the browser session only) and removes it from the address bar. Conversions
 * are only sent when a qrdx_sid is known, so visitors who didn't scan are
 * never tracked.
 */
(() => {
  const KEY = "qrdx_sid";
  const MAX_AGE = 30 * 24 * 60 * 60;
  const SID_PATTERN = /^[A-Za-z0-9._-]{20,160}$/;
  const script = document.currentScript;
  let origin = "https://qrdx.dev";
  try {
    if (script?.src) origin = new URL(script.src).origin;
  } catch {
    // Keep the default origin.
  }
  const endpoint = `${origin}/api/v1/conversions`;
  const sessionOnly = script?.getAttribute("data-storage") === "session";

  const readCookie = () => {
    const match = document.cookie.match(/(?:^|;\s*)qrdx_sid=([^;]+)/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  };

  const store = (value) => {
    let cookie = `${KEY}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
    if (!sessionOnly) cookie += `; Max-Age=${MAX_AGE}`;
    if (location.protocol === "https:") cookie += "; Secure";
    // biome-ignore lint/suspicious/noDocumentCookie: plain script, no Cookie Store API everywhere
    document.cookie = cookie;
  };

  /** Takes qrdx_sid out of the address bar so shared links don't carry it. */
  const takeFromUrl = () => {
    try {
      const url = new URL(location.href);
      const value = url.searchParams.get(KEY);
      if (!value) return null;
      url.searchParams.delete(KEY);
      history.replaceState(
        history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      return value;
    } catch {
      return null;
    }
  };

  let sid = takeFromUrl();
  if (sid && SID_PATTERN.test(sid)) store(sid);
  else sid = readCookie();

  const conversion = (details = {}) => {
    if (!sid) return Promise.resolve({ sent: false, reason: "no-scan" });
    const body = { sid, name: details.name || "conversion" };
    if (details.value !== undefined && details.value !== null) {
      body.value = details.value;
    }
    if (details.currency) body.currency = details.currency;
    if (details.id) body.id = String(details.id);
    if (details.metadata) body.metadata = details.metadata;
    return fetch(endpoint, {
      method: "POST",
      // text/plain keeps this a simple request (no CORS preflight).
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: "omit",
    })
      .then((response) =>
        response.json().then(
          (data) => ({ sent: response.ok, status: response.status, data }),
          () => ({ sent: response.ok, status: response.status }),
        ),
      )
      .catch(() => ({ sent: false, reason: "network" }));
  };

  const qrdx = (command, details) => {
    if (command === "conversion") return conversion(details);
    if (command === "sid") return sid;
    return undefined;
  };
  qrdx.conversion = conversion;
  qrdx.sid = () => sid;

  const queued = window.qrdx?.q ?? [];
  window.qrdx = qrdx;
  for (const args of queued) qrdx(...args);
})();
