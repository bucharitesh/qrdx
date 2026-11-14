// The QR card's HTML: one self-contained document (inline CSS and JS, no
// network but the QR image itself) that MCP Apps hosts render in a sandboxed
// iframe under design_qr and generate_qr_code. It talks to the host over
// postMessage with the MCP Apps JSON-RPC methods (SEP-1865, stable
// 2026-01-26): ui/initialize, then ui/notifications/initialized; it reads
// ui/notifications/tool-result and host-context-changed, sends
// ui/notifications/size-changed, and opens links with ui/open-link (or
// ChatGPT's documented window.openai.openExternal when the host doesn't
// declare openLinks). Files are saved with ui/download-file when the host
// declares downloadFile (draft spec), else the image URL opens in a tab.
//
// The script only sets textContent and attributes, never HTML, so text from
// a tool result can't become markup. Keep it plain ES2017: hosts run it as
// written, with no build step.

const STYLE = `
:root {
  color-scheme: light dark;
  --qr-text: #171717;
  --qr-muted: #5c5c5c;
  --qr-border: #e2e2e2;
  --qr-surface: #f4f4f4;
  --qr-strong: #171717;
  --qr-on-strong: #fafafa;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --qr-text: #f4f4f4;
    --qr-muted: #a6a6a6;
    --qr-border: #363636;
    --qr-surface: #262626;
    --qr-strong: #f4f4f4;
    --qr-on-strong: #171717;
  }
}
:root[data-theme="dark"] {
  --qr-text: #f4f4f4;
  --qr-muted: #a6a6a6;
  --qr-border: #363636;
  --qr-surface: #262626;
  --qr-strong: #f4f4f4;
  --qr-on-strong: #171717;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; }
body {
  color: var(--color-text-primary, var(--qr-text));
  font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
[hidden] { display: none !important; }
.card { display: flex; align-items: center; gap: 16px; padding: 12px; }
.code {
  flex: none;
  width: 168px;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--border-radius-md, 8px);
  background: var(--color-background-secondary, var(--qr-surface));
}
.code img { display: block; width: 100%; height: 100%; object-fit: contain; }
.card[aria-busy="true"] .code { animation: load 1.6s ease-in-out infinite; }
@keyframes load { 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) {
  .card[aria-busy="true"] .code { animation: none; }
}
.side { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.encodes {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-weight: var(--font-weight-medium, 500);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.details, .status {
  margin: 0;
  color: var(--color-text-secondary, var(--qr-muted));
  font-size: 13px;
}
.status:empty { display: none; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.files { display: inline-flex; gap: 8px; }
button {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--color-border-primary, var(--qr-border));
  border-radius: var(--border-radius-md, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
}
button:hover { background: var(--color-background-secondary, var(--qr-surface)); }
button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.primary {
  border-color: transparent;
  background: var(--qr-strong);
  color: var(--qr-on-strong);
}
.primary:hover { background: var(--qr-strong); opacity: 0.88; }
@media (pointer: coarse) { button { min-height: 44px; } }
@media (max-width: 420px) {
  .card { flex-direction: column; align-items: stretch; }
  .code { align-self: center; width: min(100%, 240px); }
}
`;

const SCRIPT = `
(function () {
  "use strict";
  var CARD_KEY = "dev.qrdx/qr-card";
  var host = window.parent;
  var nextId = 1;
  var pending = {};
  var caps = {};
  var connected = false;
  var result = null;
  var actions = { png: null, svg: null, editor: null };
  var fallbackImage = null;
  var lastWidth = 0;
  var lastHeight = 0;
  var sizeScheduled = false;

  function byId(id) { return document.getElementById(id); }
  var ui = {
    card: byId("card"),
    frame: byId("frame"),
    image: byId("image"),
    encodes: byId("encodes"),
    details: byId("details"),
    actions: byId("actions"),
    png: byId("png"),
    svg: byId("svg"),
    editor: byId("editor"),
    status: byId("status")
  };

  function post(message) { host.postMessage(message, "*"); }
  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }
  function notify(method, params) {
    var message = { jsonrpc: "2.0", method: method };
    if (params) message.params = params;
    post(message);
  }
  function say(text) { ui.status.textContent = text; reportSize(); }
  function clip(text, max) {
    var value = String(text);
    return value.length > max ? value.slice(0, max - 1) + "\\u2026" : value;
  }
  // https only, plus http on this computer (local development).
  var WEB_URL = /^(?:https:\\/\\/|http:\\/\\/(?:localhost|127\\.0\\.0\\.1)(?::\\d{1,5})?(?:[\\/?#]|$))/i;
  function webUrl(value) {
    return typeof value === "string" && WEB_URL.test(value) ? value : null;
  }

  function applyContext(context) {
    var root = document.documentElement;
    if (context.theme === "light" || context.theme === "dark") {
      root.setAttribute("data-theme", context.theme);
      root.style.colorScheme = context.theme;
    }
    var variables = context.styles && context.styles.variables;
    if (variables && typeof variables === "object") {
      Object.keys(variables).forEach(function (name) {
        var value = variables[name];
        if (name.indexOf("--") === 0 && typeof value === "string") {
          root.style.setProperty(name, value);
        }
      });
    }
    reportSize();
  }

  function parts(res) { return Array.isArray(res.content) ? res.content : []; }
  function pngData(content) {
    for (var i = 0; i < content.length; i++) {
      var part = content[i];
      if (part && part.type === "image" && part.mimeType === "image/png" && typeof part.data === "string") return part.data;
    }
    return null;
  }
  function svgText(content) {
    for (var i = 0; i < content.length; i++) {
      var part = content[i];
      if (part && part.type === "text" && typeof part.text === "string" && part.text.indexOf("<svg") === 0) return part.text;
    }
    return null;
  }
  function firstText(content) {
    for (var i = 0; i < content.length; i++) {
      var part = content[i];
      if (part && part.type === "text" && typeof part.text === "string") return part.text;
    }
    return "";
  }

  function fileAction(button, kind, resource, url) {
    var action = resource ? { resource: resource, url: url } : url ? { url: url } : null;
    actions[kind] = action;
    button.hidden = !action;
    button.textContent = (resource ? "Download " : "Open ") + kind.toUpperCase();
  }

  function render() {
    if (!result) return;
    var content = parts(result);
    var card = result._meta && result._meta[CARD_KEY];
    ui.card.setAttribute("aria-busy", "false");
    if (result.isError || !card || typeof card !== "object") {
      ui.frame.hidden = true;
      ui.actions.hidden = true;
      ui.details.textContent = "";
      ui.encodes.textContent = clip(firstText(content) || "No QR code came back.", 300);
      reportSize();
      return;
    }
    var png = pngData(content);
    var svg = svgText(content);
    var name = typeof card.fileName === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(card.fileName) ? card.fileName : "qr-code";
    var encodes = typeof card.encodes === "string" && card.encodes ? card.encodes : "QR code";
    fallbackImage = png ? "data:image/png;base64," + png : null;
    var shown = webUrl(card.svg) || fallbackImage;
    ui.frame.hidden = !shown;
    if (shown) {
      ui.image.alt = "QR code: " + clip(encodes, 120);
      if (ui.image.getAttribute("src") !== shown) ui.image.setAttribute("src", shown);
      ui.image.hidden = false;
    }
    ui.encodes.textContent = clip(encodes, 300);
    ui.details.textContent = Array.isArray(card.details) ? card.details.filter(function (item) { return typeof item === "string"; }).join(" \\u00b7 ") : "";
    var canSave = Boolean(caps.downloadFile);
    fileAction(ui.png, "png", canSave && png ? { uri: "file:///" + name + ".png", mimeType: "image/png", blob: png } : null, webUrl(card.png));
    fileAction(ui.svg, "svg", canSave && svg ? { uri: "file:///" + name + ".svg", mimeType: "image/svg+xml", text: svg } : null, webUrl(card.svg));
    actions.editor = webUrl(card.editor);
    ui.editor.hidden = !actions.editor;
    ui.actions.hidden = !(actions.png || actions.svg || actions.editor);
    reportSize();
  }

  function cancelled() {
    ui.card.setAttribute("aria-busy", "false");
    ui.frame.hidden = true;
    ui.actions.hidden = true;
    ui.encodes.textContent = "Cancelled.";
    reportSize();
  }

  function openLink(url) {
    var openai = window.openai;
    if (!caps.openLinks && openai && typeof openai.openExternal === "function") {
      try { openai.openExternal({ href: url }); } catch (error) { say("The link didn't open."); }
      return;
    }
    request("ui/open-link", { url: url }).catch(function () { say("The link didn't open."); });
  }

  function runFile(action) {
    if (!action) return;
    say("");
    if (!action.resource) { openLink(action.url); return; }
    request("ui/download-file", { contents: [{ type: "resource", resource: action.resource }] }).catch(function (error) {
      if (error && error.code === -32601 && action.url) openLink(action.url);
      else say("The file wasn't saved.");
    });
  }

  function reportSize() {
    if (!connected || sizeScheduled) return;
    sizeScheduled = true;
    requestAnimationFrame(function () {
      sizeScheduled = false;
      var root = document.documentElement;
      var previous = root.style.height;
      root.style.height = "max-content";
      var height = Math.ceil(root.getBoundingClientRect().height);
      root.style.height = previous;
      var width = Math.ceil(window.innerWidth);
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      notify("ui/notifications/size-changed", { width: width, height: height });
    });
  }

  ui.png.addEventListener("click", function () { runFile(actions.png); });
  ui.svg.addEventListener("click", function () { runFile(actions.svg); });
  ui.editor.addEventListener("click", function () { if (actions.editor) openLink(actions.editor); });
  ui.image.addEventListener("load", reportSize);
  ui.image.addEventListener("error", function () {
    if (fallbackImage && ui.image.getAttribute("src") !== fallbackImage) {
      ui.image.setAttribute("src", fallbackImage);
    } else {
      ui.frame.hidden = true;
      say("The image didn't load.");
    }
  });
  if (typeof ResizeObserver === "function") {
    var observer = new ResizeObserver(reportSize);
    observer.observe(document.documentElement);
    observer.observe(document.body);
  }

  window.addEventListener("message", function (event) {
    if (event.source !== host) return;
    var message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (typeof message.method !== "string") {
      var waiting = pending[message.id];
      if (!waiting) return;
      delete pending[message.id];
      if (message.error) waiting.reject(message.error);
      else waiting.resolve(message.result || {});
      return;
    }
    var params = message.params || {};
    var isRequest = message.id !== undefined && message.id !== null;
    switch (message.method) {
      case "ui/notifications/tool-result":
        result = params;
        render();
        break;
      case "ui/notifications/tool-cancelled":
        cancelled();
        break;
      case "ui/notifications/host-context-changed":
        applyContext(params);
        break;
      case "ui/resource-teardown":
      case "ping":
        if (isRequest) post({ jsonrpc: "2.0", id: message.id, result: {} });
        break;
      default:
        if (isRequest) post({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
    }
  });

  request("ui/initialize", {
    appInfo: { name: "qrdx-qr-card", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] },
    protocolVersion: "2026-01-26"
  }).then(function (init) {
    caps = (init && init.hostCapabilities) || {};
    applyContext((init && init.hostContext) || {});
    notify("ui/notifications/initialized");
    connected = true;
    render();
    reportSize();
  }, function () {
    ui.card.setAttribute("aria-busy", "false");
    ui.encodes.textContent = "This card couldn't connect to the app.";
  });
})();
`;

const BODY = `
<main id="card" class="card" aria-busy="true">
  <div id="frame" class="code"><img id="image" alt="" hidden></div>
  <div class="side">
    <p id="encodes" class="encodes">Making your QR code</p>
    <p id="details" class="details"></p>
    <div id="actions" class="actions" hidden>
      <div class="files" role="group" aria-label="Image files">
        <button type="button" id="png" hidden>PNG</button>
        <button type="button" id="svg" hidden>SVG</button>
      </div>
      <button type="button" id="editor" class="primary" hidden>Open in editor</button>
    </div>
    <p id="status" class="status" role="status" aria-live="polite"></p>
  </div>
</main>
`;

/** The QR card's HTML document, served as the ui://qrdx/qr-card resource. */
export const QR_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>QRdx QR code</title>
<style>${STYLE}</style>
</head>
<body>${BODY}<script>${SCRIPT}</script>
</body>
</html>
`;
