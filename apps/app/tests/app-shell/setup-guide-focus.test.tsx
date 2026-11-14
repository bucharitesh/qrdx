// @vitest-environment jsdom
// The "Get set up" launcher (components/app-shell/setup-guide.tsx) in the
// app frame: Dismiss guide removes it for good, and keyboard focus moves to
// the page (<main>) instead of falling back to <body>.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const seen = vi.hoisted(() => ({ ids: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/acme",
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/actions/spotlights", () => ({
  markSpotlightSeen: async (id: unknown) => {
    seen.ids.push(id);
    return { ok: true, id };
  },
}));
vi.mock("@/components/app-shell/create-actions", () => ({
  useCreate: () => () => {},
}));

const { SetupGuide } = await import("@/components/app-shell/setup-guide");
const { SpotlightProvider } = await import(
  "@/components/app-shell/feature-spotlight"
);
const { WorkspaceProvider } = await import("@/components/workspace-provider");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const WORKSPACE = {
  id: "ws_1",
  name: "Acme",
  slug: "acme",
  role: "owner" as const,
  own: true,
};

let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

async function render() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <QueryClientProvider client={queryClient}>
          <WorkspaceProvider workspace={WORKSPACE}>
            <SpotlightProvider seen={[]} viewerId="u_1">
              {/* The app frame's page region (app-frame.tsx). */}
              <main data-app-scroll="" tabIndex={-1}>
                <h1>Home</h1>
              </main>
              <SetupGuide />
            </SpotlightProvider>
          </WorkspaceProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
  });
  // The tasks request, then the launcher.
  for (let i = 0; i < 20 && !launcher(); i++) await flush();
}

const launcher = () =>
  document.querySelector<HTMLButtonElement>("[data-setup-launcher] button");
const panel = () =>
  document.querySelector<HTMLElement>('[data-slot="popover-content"]');
const buttonNamed = (name: string, within: ParentNode = document) =>
  [...within.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.trim() === name,
  );

beforeEach(() => {
  seen.ids = [];
  window.localStorage.clear();
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            workspaceId: "ws_1",
            tasks: [
              { id: "code", done: true },
              { id: "page", done: false },
              { id: "theme", done: false },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SetupGuide: Dismiss guide", () => {
  it("hands keyboard focus to the page, not <body>", async () => {
    await render();
    const trigger = launcher();
    expect(trigger?.getAttribute("aria-label")).toBe("Get set up: 1 of 3 done");

    await act(async () => {
      trigger?.focus();
      trigger?.click();
    });
    await flush();
    const open = panel();
    expect(open).not.toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");

    const dismiss = buttonNamed("Dismiss guide", open ?? document);
    await act(async () => {
      dismiss?.focus();
      dismiss?.click();
    });
    // Radix restores focus a tick after the popover unmounts.
    await flush();
    await flush();

    expect(launcher()).toBeNull();
    expect(panel()).toBeNull();
    const main = document.querySelector("main");
    expect(document.activeElement).toBe(main);
    expect(document.activeElement).not.toBe(document.body);
    // Remembered here and on the account.
    expect(window.localStorage.getItem("qrdx:home-setup-hidden")).toBe("1");
    expect(seen.ids).toEqual(["setup-guide"]);
  });
});
