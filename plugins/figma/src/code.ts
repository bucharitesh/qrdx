import {
  type MainMessage,
  PLUGIN_DATA_KEY,
  parseMeta,
  parseUIMessage,
  type QRMeta,
} from "./messages";

// Main thread: runs in Figma's sandbox (no DOM). The UI renders the SVG with
// qrdx and sends it here to become a vector node.

const NAME_MAX = 60;
const MIN_SCALE = 0.01;

figma.showUI(__html__, {
  width: 360,
  height: 640,
  themeColors: true,
  title: "QRdx",
});

function readMeta(node: BaseNode): QRMeta | null {
  return parseMeta(node.getPluginData(PLUGIN_DATA_KEY));
}

/** The selected node, if exactly one QRdx code is selected. */
function selectedQR(): SceneNode | null {
  const { selection } = figma.currentPage;
  const node = selection.length === 1 ? selection[0] : undefined;
  return node && readMeta(node) ? node : null;
}

function postSelection(load = false) {
  const node = selectedQR();
  const message: MainMessage = {
    type: "selection",
    qr: node ? readMeta(node) : null,
    load,
  };
  figma.ui.postMessage(message);
}

function nodeName(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  const short =
    text.length > NAME_MAX ? `${text.slice(0, NAME_MAX - 1)}…` : text;
  return `QR – ${short}`;
}

function createQRNode(svg: string, meta: QRMeta): FrameNode {
  const node = figma.createNodeFromSvg(svg);
  node.name = nodeName(meta.value);
  node.setPluginData(PLUGIN_DATA_KEY, JSON.stringify(meta));
  // Shows an "Edit QR code" button in the properties panel (see manifest).
  node.setRelaunchData({ edit: "Change this QR code's content or style" });
  return node;
}

function focus(node: SceneNode) {
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

function insertQR(svg: string, meta: QRMeta) {
  const node = createQRNode(svg, meta);
  const { x, y } = figma.viewport.center;
  node.x = Math.round(x - node.width / 2);
  node.y = Math.round(y - node.height / 2);
  figma.currentPage.appendChild(node);
  focus(node);
  figma.notify("QR code inserted");
}

function replaceQR(svg: string, meta: QRMeta) {
  const old = selectedQR();
  const parent = old?.parent;
  if (!(old && parent)) {
    figma.notify("Select a QR code made with QRdx to replace it.", {
      error: true,
    });
    return;
  }

  // Keep the replaced code's on-canvas size, position, rotation and layer order.
  const node = createQRNode(svg, meta);
  if (old.width > 0 && node.width > 0) {
    node.rescale(Math.max(MIN_SCALE, old.width / node.width));
  }
  parent.insertChild(parent.children.indexOf(old), node);
  if ("constraints" in old) node.constraints = old.constraints;
  try {
    node.relativeTransform = old.relativeTransform;
  } catch {
    // Inside auto layout the parent positions the node.
  }
  old.remove();
  focus(node);
  figma.notify("QR code replaced");
}

figma.ui.onmessage = (input: unknown) => {
  const message = parseUIMessage(input);
  if (!message) return;
  if (message.type === "ready") {
    postSelection(figma.command === "edit");
    return;
  }
  try {
    if (message.type === "insert") insertQR(message.svg, message.meta);
    else replaceQR(message.svg, message.meta);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    figma.notify(`Couldn't create the QR code: ${detail}`, { error: true });
  }
};

figma.on("selectionchange", () => postSelection());
