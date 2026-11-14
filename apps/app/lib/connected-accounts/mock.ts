// Dev-only: fake connected accounts so pickers and dialogs can be tried (and
// screenshotted) without real Bitly/Dropbox/... apps or a signed-in user.
// /playground?integrations-mock=1   (ignored outside `next dev`)
import type {
  PickerItem,
  PickerPage,
  SharedLinkResult,
  ShortLink,
  ShortLinkDomain,
} from "@repo/integrations";

export function isIntegrationsMock(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("integrations-mock");
}

const day = (n: number) =>
  new Date(Date.UTC(2026, 9, 28 - n, 10, 30)).toISOString();

const MOCK_TREE: Record<string, PickerItem[]> = {
  root: [
    { id: "id:f-menus", name: "Restaurant menus", kind: "folder" },
    { id: "id:f-events", name: "Events 2026", kind: "folder" },
    {
      id: "id:1",
      name: "Spring menu.pdf",
      kind: "file",
      mimeType: "application/pdf",
      size: 1_482_000,
      modifiedAt: day(1),
    },
    {
      id: "id:2",
      name: "Storefront poster.png",
      kind: "file",
      mimeType: "image/png",
      size: 3_920_000,
      modifiedAt: day(3),
    },
    {
      id: "id:3",
      name: "Product walkthrough.mp4",
      kind: "file",
      mimeType: "video/mp4",
      size: 48_200_000,
      modifiedAt: day(6),
    },
    {
      id: "id:4",
      name: "Price list.xlsx",
      kind: "file",
      size: 84_000,
      modifiedAt: day(12),
    },
  ],
  "id:f-menus": [
    {
      id: "id:5",
      name: "Lunch menu.pdf",
      kind: "file",
      mimeType: "application/pdf",
      size: 902_000,
      modifiedAt: day(2),
      path: "/Restaurant menus",
    },
    {
      id: "id:6",
      name: "Wine list.pdf",
      kind: "file",
      mimeType: "application/pdf",
      size: 640_000,
      modifiedAt: day(9),
      path: "/Restaurant menus",
    },
  ],
  "id:f-events": [],
};

const MOCK_PAGES: PickerItem[] = [
  {
    id: "p1",
    name: "Event schedule",
    kind: "page",
    emoji: "📅",
    modifiedAt: day(1),
  },
  {
    id: "p2",
    name: "Team handbook",
    kind: "page",
    emoji: "📘",
    modifiedAt: day(4),
  },
  { id: "p3", name: "Product FAQ", kind: "page", modifiedAt: day(8) },
];

const delay = <T>(value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), 250));

export function mockPickerPage(
  provider: string,
  options: { folderId?: string; search?: string },
): Promise<PickerPage> {
  const all =
    provider === "notion"
      ? MOCK_PAGES
      : options.search
        ? Object.values(MOCK_TREE).flat()
        : (MOCK_TREE[options.folderId ?? "root"] ?? []);
  const q = options.search?.toLowerCase();
  return delay({
    items: q ? all.filter((item) => item.name.toLowerCase().includes(q)) : all,
  });
}

export function mockShareLink(
  provider: string,
  item: Pick<PickerItem, "id" | "kind">,
): Promise<SharedLinkResult> {
  if (provider === "notion") {
    return delay({
      url: `https://www.notion.so/mock-${item.id}`,
      access: "restricted",
      warning:
        "This page isn't published to the web, so only people in your Notion workspace can open it. In Notion, click Share → Publish → Publish to web, then pick the page again.",
    });
  }
  return delay({
    url: `https://example.com/${provider}/shared/${encodeURIComponent(item.id)}`,
    directUrl:
      item.kind === "file"
        ? `https://example.com/${provider}/raw/${encodeURIComponent(item.id)}`
        : undefined,
    access: "public",
  });
}

export const MOCK_DOMAINS: ShortLinkDomain[] = [
  { id: "go.acme.com", hostname: "go.acme.com", branded: true },
  { id: "bit.ly", hostname: "bit.ly", isDefault: true },
];

export const MOCK_LINKS: ShortLink[] = [
  {
    id: "go.acme.com/spring",
    shortUrl: "https://go.acme.com/spring",
    longUrl: "https://acme.com/campaigns/spring-2026?utm_source=print",
    title: "Spring campaign",
    domain: "go.acme.com",
    createdAt: day(2),
  },
  {
    id: "go.acme.com/menu",
    shortUrl: "https://go.acme.com/menu",
    longUrl: "https://acme.com/menu",
    title: "Menu",
    domain: "go.acme.com",
    createdAt: day(10),
  },
];

export function mockCreateLink(longUrl: string, hostname: string): ShortLink {
  const key = Math.random().toString(36).slice(2, 8);
  return {
    id: `${hostname}/${key}`,
    shortUrl: `https://${hostname}/${key}`,
    longUrl,
    domain: hostname,
  };
}
