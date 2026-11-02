// The design-picker adapter (components/editor/style-scope.tsx): inside a
// QRStyleScopeProvider the playground's pickers show and edit the scope's
// design and never touch the playground's saved editor state; outside one
// they behave exactly as before.
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The editor store persists to window.localStorage, which Node doesn't have.
// Every write is recorded, so a test can prove the builder wrote nothing.
const storage = vi.hoisted(() => {
  const items = new Map<string, string>();
  const writes: string[] = [];
  const api = {
    writes,
    clear: () => {
      items.clear();
      writes.length = 0;
    },
    getItem: (key: string) => items.get(key) ?? null,
    removeItem: (key: string) => {
      writes.push(`remove:${key}`);
      items.delete(key);
    },
    setItem: (key: string, value: string) => {
      writes.push(`set:${key}`);
      items.set(key, String(value));
    },
  };
  vi.stubGlobal("window", {
    localStorage: api,
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  return api;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// The preset store loads saved themes through a server action.
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));

import { FrameTextPresets } from "@/components/editor/control-sections/frame-text-presets";
import {
  DotPatternControl,
  EyeControls,
} from "@/components/editor/control-sections/pattern-controls";
import {
  QRStyleScopeProvider,
  useEditableStyle,
  useEditorValue,
} from "@/components/editor/style-scope";
import { defaultThemeState } from "@/config/qr";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";

// Server rendering reads a zustand store's initial snapshot, so the
// playground's state here is its initial one: circle dots, gear eyes.
const PLAYGROUND: QRStyle = defaultThemeState.styles;
const BUILDER: QRStyle = {
  ...defaultThemeState.styles,
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
  frame: { style: "banner-bottom", text: "Scan for menu" },
};

type Captured = ReturnType<typeof useEditableStyle> & { value: string };

function Probe({ onRender }: { onRender: (captured: Captured) => void }) {
  const editable = useEditableStyle();
  const value = useEditorValue();
  onRender({ ...editable, value });
  return null;
}

function capture(node: (probe: React.ReactNode) => React.ReactNode): Captured {
  let captured: Captured | null = null;
  renderToStaticMarkup(
    node(
      <Probe
        onRender={(next) => {
          captured = next;
        }}
      />,
    ),
  );
  if (!captured) throw new Error("the probe didn't render");
  return captured;
}

/** The name of the tile marked pressed in a group (from rendered markup). */
function pressedNames(markup: string): string[] {
  return [
    ...markup.matchAll(
      /<button[^>]*aria-label="([^"]+)"[^>]*aria-pressed="true"/g,
    ),
  ].map((match) => match[1] ?? "");
}

beforeEach(() => {
  useQREditorStore.setState({
    themeState: { ...defaultThemeState, styles: PLAYGROUND },
    history: [],
  });
  storage.clear();
});

describe("inside a QRStyleScopeProvider", () => {
  it("reads the scope's design and value, not the playground's", () => {
    const captured = capture((probe) => (
      <QRStyleScopeProvider
        onChange={() => {}}
        style={BUILDER}
        value="https://qrdx.dev/q/success"
      >
        {probe}
      </QRStyleScopeProvider>
    ));
    expect(captured.scoped).toBe(true);
    expect(captured.style.bodyPattern).toBe("rounded");
    expect(captured.value).toBe("https://qrdx.dev/q/success");
  });

  it("sends every change to onChange and leaves the playground's saved state alone", () => {
    const onChange = vi.fn();
    const before = structuredClone(useQREditorStore.getState().themeState);
    const captured = capture((probe) => (
      <QRStyleScopeProvider onChange={onChange} style={BUILDER}>
        {probe}
      </QRStyleScopeProvider>
    ));
    captured.setStyle({ ...captured.style, bodyPattern: "diamond" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].bodyPattern).toBe("diamond");
    expect(useQREditorStore.getState().themeState).toEqual(before);
    expect(useQREditorStore.getState().history).toEqual([]);
    // Nothing was persisted to the playground's "editor-storage" key.
    expect(storage.writes).toEqual([]);
  });

  it("renders the real pickers with the scope's picks", () => {
    const markup = renderToStaticMarkup(
      <QRStyleScopeProvider onChange={() => {}} style={BUILDER}>
        <DotPatternControl />
        <EyeControls />
        <FrameTextPresets />
      </QRStyleScopeProvider>,
    );
    const pressed = pressedNames(markup);
    expect(pressed).toContain("Rounded");
    expect(pressed).not.toContain("Circle");
    // The frame label preset matches the scope's frame text.
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Scan for menu</);
  });
});

describe("outside a provider (the playground)", () => {
  it("reads and writes the playground's editor state as before", () => {
    const captured = capture((probe) => probe);
    expect(captured.scoped).toBe(false);
    expect(captured.style.bodyPattern).toBe(PLAYGROUND.bodyPattern);

    captured.setStyle({ ...captured.style, bodyPattern: "diamond" });
    expect(useQREditorStore.getState().themeState.styles.bodyPattern).toBe(
      "diamond",
    );
    expect(storage.writes).toContain("set:editor-storage");
  });

  it("renders the pickers with the playground's picks", () => {
    const pressed = pressedNames(renderToStaticMarkup(<DotPatternControl />));
    expect(pressed).toContain("Circle");
    expect(pressed).not.toContain("Rounded");
  });
});
