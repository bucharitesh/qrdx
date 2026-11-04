// The playground's Art tab, rendered from fixture state (no network, no
// sign-in, no model): the AI art canvas over the preview, the download
// dialog's switch to PNG only, the Art panel's modes, AI art's sign-in prompt,
// "Use as Image QR", and the Design tab's section anchors. The flows run in a
// real browser in e2e/playground.e2e.ts ("art tab links").
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateCreator, StoreApi } from "zustand/vanilla";

// The editor store persists to window.localStorage, which Node doesn't have.
vi.hoisted(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => items.delete(key),
      setItem: (key: string, value: string) => items.set(key, String(value)),
    },
  });
});

const view = vi.hoisted(() => ({
  tab: "art" as string,
  user: { id: "user-1" } as { id: string } | null,
}));

// Server rendering reads a zustand store's initial state (its server
// snapshot); these tests render the state they set.
vi.mock("zustand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("zustand")>();
  const React = await import("react");
  const { createStore } = await import("zustand/vanilla");
  const useStore = (
    api: StoreApi<unknown>,
    selector = (state: unknown) => state,
  ) => {
    const read = () => selector(api.getState());
    return React.useSyncExternalStore(api.subscribe, read, read);
  };
  const build = (createState: StateCreator<unknown>) => {
    const api = createStore(createState);
    const hook = (selector?: (state: unknown) => unknown) =>
      useStore(api, selector);
    return Object.assign(hook, api);
  };
  const create = (createState?: StateCreator<unknown>) =>
    createState ? build(createState) : build;
  return { ...actual, create, useStore };
});

vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));
vi.mock("@/actions/user-settings", () => ({ getUserSettings: vi.fn() }));
vi.mock("@/actions/community", () => ({
  getSavedCommunityFrames: vi.fn(async () => []),
}));
vi.mock("@/actions/qr-codes", () => ({
  createQrCode: vi.fn(),
  updateQrCode: vi.fn(),
}));
vi.mock("@/lib/hooks/use-controls-tab-from-url", () => ({
  useControlsTabFromUrl: () => ({
    tab: view.tab,
    handleSetTab: vi.fn(),
    aiAvailable: true,
  }),
}));
vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: view.user ? { user: view.user } : null,
      isPending: false,
    }),
  },
}));
// The sampled picture "Use as Image QR" gets (a browser samples the real one).
const SAMPLED = vi.hoisted(() => ({ width: 1, height: 1, data: "AAAAAA==" }));
vi.mock("qrdx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("qrdx")>()),
  loadQRArtImage: vi.fn(async () => SAMPLED),
}));

const { AvailabilityProvider } = await import(
  "@/components/availability-provider"
);
const { ArtCanvas, applyResultAsImageQR, useShownArt } = await import(
  "@/components/editor/art/art-canvas"
);
const { AI_ART_DOWNLOAD_REASON } = await import(
  "@/components/editor/art/ai-art-download"
);
const { ArtPanel } = await import("@/components/editor/art/art-panel");
const { withArtImage } = await import(
  "@/components/editor/control-sections/art-controls"
);
const { DesignControls } = await import(
  "@/components/editor/control-sections/design-controls"
);
const { defaultThemeState } = await import("@/config/qr");
const { DESIGN_SECTIONS } = await import("@/lib/playground-links");
const { DEFAULT_AI_ART_DRAFT, useArtSessionStore } = await import(
  "@/store/art-session-store"
);
const { useQREditorStore } = await import("@/store/editor-store");

import type { AIArtRun } from "@/components/sections/ai-art/ai-art-run";
import type { FeatureId } from "@/lib/feature-availability-rules";

afterAll(() => {
  vi.unstubAllGlobals();
});

const TEXT = "https://qrdx.dev/q/Ab3dE9x";

const variant = (seed: number) => ({
  imageUrl: `data:image/png;base64,FIXTURE${seed}`,
  width: 1024,
  height: 1024,
  seed,
  blended: false,
  blend: "none" as const,
  blendStrength: 0,
});

const RUN: AIArtRun = {
  variants: [variant(1), variant(2)],
  failed: 0,
  text: TEXT,
  visibility: 50,
  creativity: 45,
};

function render(node: ReactNode, unavailable: FeatureId[] = []) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AvailabilityProvider
        value={{ unavailable, hiddenPaths: [], hiddenIntegrations: [] }}
      >
        {node}
      </AvailabilityProvider>
    </QueryClientProvider>,
  );
}

function Probe() {
  const shown = useShownArt();
  return (
    <pre>{JSON.stringify({ ...shown, result: Boolean(shown.result) })}</pre>
  );
}
const probe = (unavailable: FeatureId[] = []) => {
  const json = render(<Probe />, unavailable)
    .replace(/^<pre>|<\/pre>$/g, "")
    .replaceAll("&quot;", '"');
  return JSON.parse(json) as { visible: boolean; result: boolean };
};

beforeEach(() => {
  view.tab = "art";
  view.user = { id: "user-1" };
  useQREditorStore.setState({
    themeState: defaultThemeState,
    history: [],
    future: [],
    contentType: "url",
    value: TEXT,
  });
  useArtSessionStore.setState({
    configured: true,
    picked: "ai",
    run: RUN,
    pending: 0,
    controller: null,
    selected: 1,
    canvasOpen: true,
    checks: { run: null, results: [] },
    draft: DEFAULT_AI_ART_DRAFT,
    source: null,
  });
});

describe("the AI art canvas", () => {
  it("shows the selected variation with its strip, scan check and actions", () => {
    const html = render(<ArtCanvas />);
    expect(html).toContain('aria-label="AI art result"');
    expect(html).toContain("Encodes qrdx.dev/q/Ab3dE9x");
    expect(html).toContain('src="data:image/png;base64,FIXTURE2"');
    expect(html.match(/role="option"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-selected="true"[^>]*>.*?FIXTURE2/);
    expect(html).toContain("Scoring the scan…");
    for (const label of [
      "Back to code",
      "Download PNG",
      "Print PNG, 2048 px",
      "Use as Image QR",
      "Retry clearer",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("shows the browser's scan score once it's in", () => {
    useArtSessionStore.setState({
      checks: {
        run: RUN,
        results: [undefined, { status: "scannable", score: 91 }],
      },
    });
    const html = render(<ArtCanvas />);
    expect(html).toContain("Verified to scan");
    expect(html).toContain("Scan score 91");
  });

  it("offers no clearer retry at full QR visibility", () => {
    useArtSessionStore.setState({ run: { ...RUN, visibility: 100 } });
    expect(render(<ArtCanvas />)).not.toContain("Retry clearer");
  });

  it("covers the preview while a run is in flight", () => {
    useArtSessionStore.setState({ run: null, pending: 2 });
    const html = render(<ArtCanvas />);
    expect(html).toContain("Generating 2 variations…");
    expect(html).not.toContain("Download PNG");
  });

  it("stays off the preview elsewhere, after Back to code, and for other content", () => {
    view.tab = "customisations";
    expect(render(<ArtCanvas />)).toBe("");
    view.tab = "art";
    useArtSessionStore.setState({ canvasOpen: false });
    expect(render(<ArtCanvas />)).toBe("");
    useArtSessionStore.setState({ canvasOpen: true, picked: "logo" });
    expect(render(<ArtCanvas />)).toBe("");
    useArtSessionStore.setState({ picked: "ai" });
    useQREditorStore.setState({ value: "https://example.com" });
    expect(render(<ArtCanvas />)).toBe("");
    useQREditorStore.setState({ value: TEXT });
    expect(render(<ArtCanvas />, ["aiArt"])).toBe("");
  });
});

describe("the download dialog", () => {
  it("offers PNG only while a result is shown, and says why", () => {
    expect(probe()).toMatchObject({ visible: true, result: true });
    view.tab = "customisations";
    expect(probe()).toMatchObject({ visible: false, result: false });
    expect(AI_ART_DOWNLOAD_REASON).toBe(
      "AI art is an image; for SVG, PDF or EPS use Use as Image QR",
    );
  });
});

describe("the Art panel", () => {
  const panel = (unavailable: FeatureId[] = []) =>
    render(
      <ArtPanel onChange={() => {}} styles={defaultThemeState.styles} />,
      unavailable,
    );

  it("offers Off, Logo QR, Image QR and AI art", () => {
    useArtSessionStore.setState({ picked: null });
    const html = panel();
    const modes = [...html.matchAll(/role="radio"[^>]*>([^<]+)</g)].map(
      (match) => match[1],
    );
    expect(modes).toEqual(["Off", "Logo QR", "Image QR", "AI art"]);
  });

  it("leaves AI art out where it isn't set up", () => {
    useArtSessionStore.setState({ picked: "ai" });
    const html = panel(["aiArt"]);
    expect(html).not.toContain("AI art</");
    // The pick falls back to the design's mode (off here).
    expect(html).toMatch(/aria-checked="true"[^>]*>Off</);
  });

  it("asks you to sign in to generate, signed out", () => {
    view.user = null;
    const html = panel();
    expect(html).toContain("Sign in to generate</button>");
    expect(html).toContain("Sign in to generate. Every plan includes");
    expect(html).toContain("Encodes");
    expect(html).toContain("qrdx.dev/q/Ab3dE9x");
  });

  it("asks for content first", () => {
    useQREditorStore.setState({ value: "" });
    expect(panel()).toContain(
      "Add your content first: AI art paints the code you",
    );
  });

  it("says when it paints a dynamic short link", async () => {
    const { useDynamicLinkStore } = await import(
      "@/components/editor/dynamic-link-toggle"
    );
    useDynamicLinkStore.setState({
      code: {
        id: "code-1",
        shortLink: TEXT,
        destinationUrl: "https://example.com",
        userId: "user-1",
      },
    });
    const html = panel();
    useDynamicLinkStore.setState({ code: null });
    expect(html).toMatch(
      /Encodes your dynamic link.*qrdx\.dev\/q\/Ab3dE9x.*, so you can change where it points after printing\./,
    );
  });
});

describe("Use as Image QR", () => {
  it("makes the result the design's Image QR art, as one undo step", async () => {
    const before = useQREditorStore.getState().themeState.styles;
    await applyResultAsImageQR(variant(2).imageUrl);
    const { styles } = useQREditorStore.getState().themeState;
    expect(styles.art).toMatchObject({ mode: "halftone", image: SAMPLED });
    expect(styles.level).toBe("H");
    expect(styles.margin).toBeGreaterThanOrEqual(4);
    expect(useArtSessionStore.getState()).toMatchObject({
      picked: null,
      canvasOpen: false,
      source: variant(2).imageUrl,
    });
    useQREditorStore.getState().undo();
    expect(useQREditorStore.getState().themeState.styles).toEqual(before);
  });

  it("keeps the look of Image QR art already in the design", () => {
    const style = {
      ...defaultThemeState.styles,
      art: {
        mode: "halftone" as const,
        image: SAMPLED,
        variant: "mono" as const,
      },
    };
    expect(withArtImage(style, SAMPLED, "halftone").art?.variant).toBe("mono");
    expect(withArtImage(style, SAMPLED, "logo").art?.variant).toBeUndefined();
  });
});

describe("the Design tab", () => {
  it("anchors every section a link can open, and no longer holds Art", () => {
    const html = render(
      <DesignControls onChange={() => {}} styles={defaultThemeState.styles} />,
    );
    for (const section of DESIGN_SECTIONS) {
      expect(html).toContain(`id="section-${section}"`);
    }
    expect(html).not.toContain("Logo QR");
    expect(html).not.toContain(">Art<");
  });
});
