import { type PendingSource, setPendingValue } from "./storage";

const MENU_ITEMS: {
  id: string;
  title: string;
  context: `${chrome.contextMenus.ContextType}`;
  source: PendingSource;
}[] = [
  {
    id: "qrdx-link",
    title: "QR code for this link",
    context: "link",
    source: "link",
  },
  {
    id: "qrdx-image",
    title: "QR code for this image",
    context: "image",
    source: "image",
  },
  {
    id: "qrdx-selection",
    title: "QR code for selected text",
    context: "selection",
    source: "selection",
  },
];

const FALLBACK_WINDOW = { width: 640, height: 600 };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const item of MENU_ITEMS) {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: [item.context],
      });
    }
  });
});

function valueFor(
  info: chrome.contextMenus.OnClickData,
  source: PendingSource
): string | undefined {
  if (source === "link") return info.linkUrl;
  if (source === "image") return info.srcUrl;
  return info.selectionText;
}

chrome.contextMenus.onClicked.addListener((info) => {
  const item = MENU_ITEMS.find((menuItem) => menuItem.id === info.menuItemId);
  const value = item ? valueFor(info, item.source)?.trim() : undefined;
  if (!(item && value)) return;

  // Don't await before openPopup(): it must run while the click still counts as a
  // user gesture. The popup also listens for this value in case it lands late.
  setPendingValue(value, item.source).catch(() => undefined);
  chrome.action.openPopup().catch(() =>
    // openPopup() is unavailable before Chrome 127 and when no window is focused.
    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      ...FALLBACK_WINDOW,
    })
  );
});
