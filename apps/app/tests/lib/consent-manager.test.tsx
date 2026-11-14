// @vitest-environment jsdom
// The consent manager and analytics live in @repo/analytics
// (packages/analytics); the app hands them its own pieces
// (components/consent/consent-manager.tsx): links that keep the visitor's
// language, and the server action that reads the signed-in user's plan,
// which is only asked for with the visitor's analytics consent.
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const auth = vi.hoisted(() => ({
  session: null as null | {
    user: { id: string; createdAt: string };
    session: { createdAt: string };
  },
}));
const getAnalyticsPlan = vi.hoisted(() => vi.fn(async () => "pro"));

vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: auth.session, isPending: false }),
    getLastUsedLoginMethod: () => null,
  },
}));
vi.mock("@/actions/analytics", () => ({ getAnalyticsPlan }));
vi.mock("@/components/i18n/locale-link", () => ({
  LocaleLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} data-locale-link="">
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/pricing",
}));
vi.mock("posthog-js", () => ({ default: { init: vi.fn() } }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  auth.session = null;
  getAnalyticsPlan.mockClear();
});

describe("the app's consent manager", () => {
  it("links to the privacy policy through the app's LocaleLink", async () => {
    const { ConsentManager } = await import(
      "@/components/consent/consent-manager"
    );
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ConsentManager />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('aria-labelledby="cookie-banner-title"');
    expect(html).toMatch(
      /<a href="\/legal\/privacy-policy"[^>]*data-locale-link=""/,
    );
  });

  it("asks for the plan with analytics consent only, and only when signed in", async () => {
    const { Analytics } = await import("@repo/analytics/analytics");
    const mount = async (node: React.ReactNode) => {
      const container = document.createElement("div");
      root = createRoot(container);
      await act(async () => root?.render(node));
      act(() => root?.unmount());
      root = null;
    };
    const now = new Date().toISOString();

    await mount(<Analytics measurement getPlan={getAnalyticsPlan} />);
    expect(getAnalyticsPlan).not.toHaveBeenCalled();

    auth.session = {
      user: { id: "user_1", createdAt: now },
      session: { createdAt: now },
    };
    await mount(<Analytics measurement={false} getPlan={getAnalyticsPlan} />);
    await mount(<Analytics measurement={null} getPlan={getAnalyticsPlan} />);
    expect(getAnalyticsPlan).not.toHaveBeenCalled();

    await mount(<Analytics measurement getPlan={getAnalyticsPlan} />);
    expect(getAnalyticsPlan).toHaveBeenCalledTimes(1);

    // A deployment without the action (the docs app) leaves the plan out.
    await expect(mount(<Analytics measurement />)).resolves.toBeUndefined();
  });
});
