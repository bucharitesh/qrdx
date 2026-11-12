// The code builder opened over the playground (hub phase 4): what the
// playground asks for ("Make it dynamic…", "Link options…", the hosted page
// gallery), the one-click Dynamic toggle, and what the builder writes back to
// the editor in place (create, edit, "Continue in the editor"). Every server
// action is a fake: nothing here reaches a database.
import { createElement } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderIntl } from "../support/intl";

// The editor, auth and dynamic link stores persist to window.localStorage,
// which Node doesn't have.
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

// Server actions: fakes, so no test ever writes (or reads) a database.
const actions = vi.hoisted(() => ({
  createQrCode: vi.fn(),
  updateQrCode: vi.fn(),
}));
vi.mock("@/actions/qr-codes", () => actions);
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
);
vi.mock("@repo/design-system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/design-system")>()),
  toast,
}));

const { defaultThemeState } = await import("@/config/qr");
const { useQREditorStore } = await import("@/store/editor-store");
const toggle = await import("@/components/editor/dynamic-link-toggle");
const { useDynamicLinkStore, makeDynamic, DynamicLimitCard } = toggle;
const inPlace = await import("@/components/code-builder/in-place");
const {
  bindCreatedCode,
  currentBuilderRequest,
  currentPageGalleryRequest,
  openPlaygroundBuilder,
  syncSavedCode,
} = inPlace;
const request = await import("@/components/code-builder/playground-request");
const {
  builderRequestFor,
  dynamicBlockedReason,
  OPEN_CODE_BUILDER_MAX_AGE_MS,
  openCodeBuilderIntent,
  pageGalleryRequest,
  pageTypeOffered,
  resumableIntent,
} = request;
const { useCodeBuilderStore, openCodeBuilder, closeCodeBuilder } = await import(
  "@/components/code-builder/store"
);
const { fullEditorDestination, openInFullEditor } = await import(
  "@/components/code-builder/full-editor"
);
const { submitCreate, submitUpdate } = await import(
  "@/components/code-builder/submit"
);
const { EMPTY_FIELDS } = await import("@/components/code-builder/types");
const { BuilderFormBanner } = await import(
  "@/components/code-builder/form-banner"
);
const { FILE_PAGE_TYPES, offeredPageTypes } = await import(
  "@/lib/landing/file-page-types"
);
const { dashboardEntry } = await import("@/lib/workspace-paths");

import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import type { BuilderServices } from "@/components/code-builder/submit";
import type { BuilderFields } from "@/components/code-builder/types";

afterAll(() => {
  vi.unstubAllGlobals();
});

const MY_STYLE = {
  ...defaultThemeState.styles,
  fgColor: "#123456",
  bodyPattern: "diamond" as const,
};

const view = (patch: Partial<QrCodeView> = {}): QrCodeView => ({
  id: "code_1",
  slug: "abc1234",
  shortLink: "https://qrdx.dev/q/abc1234",
  defaultShortLink: "https://qrdx.dev/q/abc1234",
  domain: null,
  destinationUrl: "https://example.com/menu",
  kind: "redirect",
  pageId: null,
  title: null,
  contentType: "url",
  style: MY_STYLE,
  status: "active",
  scanCount: 0,
  lastScannedAt: null,
  archivedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  organizationId: null,
  createdBy: "u_alice",
  ...patch,
});

/** Fake services; each one a vi.fn, so a test can read its calls. */
type FakeServices = {
  [K in keyof BuilderServices]: BuilderServices[K] & ReturnType<typeof vi.fn>;
};

function services(overrides: Partial<BuilderServices> = {}): FakeServices {
  return {
    createCode: vi.fn(
      overrides.createCode ??
        (async () => ({ success: true as const, data: view() })),
    ),
    updateCode: vi.fn(
      overrides.updateCode ??
        (async () => ({ success: true as const, data: view() })),
    ),
    moveCodes: vi.fn(async () => ({ success: true as const, data: {} })),
    setTags: vi.fn(async () => ({ success: true as const, data: {} })),
  } as never;
}

/** The playground showing a URL code for `url` in MY_STYLE. */
function playgroundWithUrl(url: string) {
  const editor = useQREditorStore.getState();
  editor.setContentType("url");
  editor.setContentConfig("url", { type: "url", url });
  editor.setValue(url);
  editor.setThemeState({ ...editor.themeState, styles: MY_STYLE });
}

const editor = () => useQREditorStore.getState();
const linked = () => useDynamicLinkStore.getState().code;

beforeEach(() => {
  useQREditorStore.setState({
    contentType: "url",
    value: "",
    contentConfigs: {},
  });
  useQREditorStore.getState().replaceThemeState(defaultThemeState);
  useDynamicLinkStore.getState().unlink();
  useCodeBuilderStore.setState({ request: null, hosts: [] });
  actions.createQrCode.mockReset();
  actions.updateQrCode.mockReset();
  toast.mockClear();
  toast.error.mockClear();
});

describe("which codes can be dynamic", () => {
  it("only the URL type, with the reason for the others", () => {
    expect(dynamicBlockedReason("url")).toBeNull();
    expect(dynamicBlockedReason("wifi")).toBe(
      "Wi-Fi details are stored in the code itself.",
    );
    expect(dynamicBlockedReason("vcard")).toMatch(/Contact details/);
    expect(dynamicBlockedReason("bitcoin")).toMatch(/Payment details/);
    // Link types encode a web address, but the builder makes URL codes.
    expect(dynamicBlockedReason("instagram")).toMatch(/Use the URL type/);
    expect(dynamicBlockedReason("dubsh")).toMatch(/already dynamic/);
  });

  it("asks to create one with the address and design, or edits the linked code", () => {
    const base = {
      contentType: "url" as const,
      url: " example.com/menu ",
      style: MY_STYLE,
      userId: "u_alice",
    };
    expect(builderRequestFor({ ...base, linked: null })).toEqual({
      ok: true,
      request: {
        mode: "create",
        initial: { destination: "example.com/menu", style: MY_STYLE },
        origin: "playground",
      },
    });
    expect(
      builderRequestFor({
        ...base,
        linked: { id: "code_1", userId: "u_alice" },
      }),
    ).toEqual({
      ok: true,
      request: { mode: "edit", codeId: "code_1", origin: "playground" },
    });
    // Another account's link is never edited from here.
    expect(
      builderRequestFor({ ...base, linked: { id: "code_1", userId: "u_bob" } }),
    ).toMatchObject({ ok: true, request: { mode: "create" } });
    expect(
      builderRequestFor({ ...base, contentType: "wifi", linked: null }),
    ).toEqual({
      ok: false,
      reason: "Wi-Fi details are stored in the code itself.",
    });
  });

  it("reads the playground's own state", () => {
    playgroundWithUrl("https://example.com/menu");
    expect(currentBuilderRequest("u_alice")).toEqual({
      ok: true,
      request: {
        mode: "create",
        initial: { destination: "https://example.com/menu", style: MY_STYLE },
        origin: "playground",
      },
    });
    useDynamicLinkStore.getState().link({
      id: "code_1",
      shortLink: "https://qrdx.dev/q/abc1234",
      destinationUrl: "https://example.com/menu",
      userId: "u_alice",
    });
    expect(currentBuilderRequest("u_alice")).toMatchObject({
      request: { mode: "edit", codeId: "code_1" },
    });
    editor().setContentType("wifi");
    expect(currentBuilderRequest("u_alice")).toMatchObject({ ok: false });
  });
});

describe("opening it", () => {
  it("the playground's requests reach the store before its host has loaded", () => {
    // The playground mounts its host when the editor renders; a link's
    // open=dynamic is applied before that.
    openPlaygroundBuilder({ mode: "create", origin: "playground" });
    expect(useCodeBuilderStore.getState().request).toEqual({
      mode: "create",
      origin: "playground",
    });
  });

  it("openCodeBuilder keeps the origin and opens the page gallery", () => {
    useCodeBuilderStore.getState().registerHost("host_1");
    openCodeBuilder({ mode: "edit", codeId: "code_1", origin: "playground" });
    expect(useCodeBuilderStore.getState().request).toEqual({
      mode: "edit",
      codeId: "code_1",
      code: undefined,
      origin: "playground",
    });
    openCodeBuilder({ mode: "page", type: "menu", template: "cafe" });
    expect(useCodeBuilderStore.getState().request).toEqual({
      mode: "page",
      type: "menu",
      template: "cafe",
    });
    closeCodeBuilder();
    expect(useCodeBuilderStore.getState().request).toBeNull();
  });

  it("the page gallery carries the playground's design", () => {
    playgroundWithUrl("https://example.com");
    expect(currentPageGalleryRequest({ type: "menu" })).toEqual({
      mode: "page",
      type: "menu",
      style: MY_STYLE,
      origin: "playground",
    });
    // A template only goes with its type.
    expect(pageGalleryRequest(MY_STYLE, { template: "cafe" })).toEqual({
      mode: "page",
      style: MY_STYLE,
      origin: "playground",
    });
  });
});

describe("one-click Dynamic (the toggle)", () => {
  it("creates the code with the playground's design", async () => {
    actions.createQrCode.mockResolvedValue({ success: true, data: view() });
    const outcome = await makeDynamic({
      destination: "https://example.com/menu",
      styles: MY_STYLE,
      userId: "u_alice",
    });
    expect(actions.createQrCode).toHaveBeenCalledWith(
      {
        destinationUrl: "https://example.com/menu",
        style: MY_STYLE,
      },
      { via: "playground" },
    );
    expect(outcome).toEqual({
      kind: "linked",
      trimmed: false,
      code: {
        id: "code_1",
        shortLink: "https://qrdx.dev/q/abc1234",
        destinationUrl: "https://example.com/menu",
        userId: "u_alice",
      },
    });
  });

  it("LIMIT_REACHED shows the limit card", async () => {
    actions.createQrCode.mockResolvedValue({
      success: false,
      error: {
        code: "LIMIT_REACHED",
        message: "Your plan includes 10 active dynamic codes.",
      },
    });
    const outcome = await makeDynamic({
      destination: "https://example.com/menu",
      styles: MY_STYLE,
      userId: "u_alice",
    });
    expect(outcome).toEqual({
      kind: "limit",
      message: "Your plan includes 10 active dynamic codes.",
    });
    if (outcome.kind !== "limit") throw new Error("expected the limit");
    const html = renderIntl(
      createElement(DynamicLimitCard, {
        message: outcome.message,
        onUpgrade: () => {},
      }),
    );
    expect(html).toContain("Your plan includes 10 active dynamic codes.");
    expect(html).toContain("Upgrade to Pro");
    expect(html).toContain(`href="${dashboardEntry("codes")}"`);
  });

  it("a lost session asks for sign-in; a network failure says so", async () => {
    actions.createQrCode.mockResolvedValueOnce({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in" },
    });
    await expect(
      makeDynamic({
        destination: "https://a.com",
        styles: MY_STYLE,
        userId: "u",
      }),
    ).resolves.toEqual({ kind: "signin" });
    actions.createQrCode.mockRejectedValueOnce(new Error("offline"));
    await expect(
      makeDynamic({
        destination: "https://a.com",
        styles: MY_STYLE,
        userId: "u",
      }),
    ).resolves.toEqual({
      kind: "error",
      message: "Couldn't reach QRdx. Check your connection and try again.",
    });
  });
});

describe("the builder over the playground", () => {
  const fieldsFor = (patch: Partial<BuilderFields> = {}): BuilderFields => {
    const next = currentBuilderRequest("u_alice");
    if (!(next.ok && next.request.mode === "create")) {
      throw new Error("expected a create request");
    }
    return { ...EMPTY_FIELDS, ...next.request.initial, ...patch };
  };

  it("create: saves the playground's design and binds the playground to the code", async () => {
    playgroundWithUrl("https://example.com/menu");
    const fake = services();
    const result = await submitCreate(fieldsFor(), fake);
    expect(fake.createCode).toHaveBeenCalledWith({
      destinationUrl: "https://example.com/menu",
      title: null,
      domainId: null,
      slug: null,
      style: MY_STYLE,
    });
    if (!result.ok) throw new Error("expected a code");
    bindCreatedCode(result.code, "u_alice");

    expect(linked()).toEqual({
      id: "code_1",
      shortLink: "https://qrdx.dev/q/abc1234",
      destinationUrl: "https://example.com/menu",
      userId: "u_alice",
    });
    expect(editor().value).toBe("https://qrdx.dev/q/abc1234");
    expect(editor().contentType).toBe("url");
    expect(editor().themeState.styles).toEqual(MY_STYLE);
  });

  it("create: LIMIT_REACHED shows the limit banner with the upgrade, and nothing is bound", async () => {
    playgroundWithUrl("https://example.com/menu");
    const result = await submitCreate(
      fieldsFor(),
      services({
        createCode: async () => ({
          success: false,
          error: {
            code: "LIMIT_REACHED",
            message: "Your plan includes 10 active dynamic codes.",
          },
        }),
      }),
    );
    expect(result).toMatchObject({ ok: false, field: "form" });
    if (result.ok) throw new Error("expected the limit");
    const html = renderIntl(
      createElement(BuilderFormBanner, {
        error: result.error,
        onUpgrade: () => {},
        unlimitedCodesPlan: "pro",
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Your plan includes 10 active dynamic codes.");
    expect(html).toContain("Upgrade to Pro");
    expect(linked()).toBeNull();
    expect(editor().value).toBe("https://example.com/menu");
  });

  it("edit: a new back-half follows into the playground, an unchanged design doesn't", async () => {
    playgroundWithUrl("https://example.com/menu");
    useDynamicLinkStore.getState().link({
      id: "code_1",
      shortLink: "https://qrdx.dev/q/abc1234",
      destinationUrl: "https://example.com/menu",
      userId: "u_alice",
    });
    // Unsaved playground edits since the code was saved.
    const playgroundStyle = { ...MY_STYLE, fgColor: "#ff0000" };
    editor().setThemeState({ ...editor().themeState, styles: playgroundStyle });

    const code = view();
    const initial: BuilderFields = {
      ...EMPTY_FIELDS,
      destination: code.destinationUrl,
      slug: code.slug,
      style: code.style,
    };
    const fake = services({
      updateCode: async () => ({
        success: true,
        data: view({
          slug: "spring-menu",
          shortLink: "https://qrdx.dev/q/spring-menu",
        }),
      }),
    });
    const result = await submitUpdate(
      code,
      initial,
      { ...initial, slug: "spring-menu" },
      fake,
      { organizationKnown: true },
    );
    expect(fake.updateCode).toHaveBeenCalledWith({
      id: "code_1",
      slug: "spring-menu",
    });
    if (!result.ok) throw new Error("expected a save");
    expect(syncSavedCode(result.code, { style: null })).toBe(true);
    expect(linked()?.shortLink).toBe("https://qrdx.dev/q/spring-menu");
    expect(editor().value).toBe("https://qrdx.dev/q/spring-menu");
    expect(editor().themeState.styles).toEqual(playgroundStyle);
  });

  it("edit: a design changed in the builder comes back to the playground", () => {
    playgroundWithUrl("https://example.com/menu");
    useDynamicLinkStore.getState().link({
      id: "code_1",
      shortLink: "https://qrdx.dev/q/abc1234",
      destinationUrl: "https://example.com/menu",
      userId: "u_alice",
    });
    const builderStyle = { ...MY_STYLE, fgColor: "#00aa00" };
    syncSavedCode(view({ destinationUrl: "https://example.com/new" }), {
      style: builderStyle,
    });
    expect(editor().themeState.styles).toEqual(builderStyle);
    expect(linked()?.destinationUrl).toBe("https://example.com/new");
    expect(editor().contentConfigs.url).toEqual({
      type: "url",
      url: "https://example.com/new",
    });
  });

  it("edit: a code the playground isn't bound to leaves it alone", () => {
    playgroundWithUrl("https://example.com/menu");
    expect(syncSavedCode(view({ id: "code_2" }), { style: MY_STYLE })).toBe(
      false,
    );
    expect(editor().value).toBe("https://example.com/menu");
    expect(linked()).toBeNull();
  });

  it("Continue in the editor: applies in place and doesn't navigate", () => {
    expect(fullEditorDestination("playground")).toBeNull();
    // Opened anywhere else, it still goes to the playground.
    expect(fullEditorDestination(undefined)).toBe("/playground");

    const builderStyle = { ...MY_STYLE, fgColor: "#0000ff" };
    openInFullEditor({
      code: null,
      destination: "https://example.com/spring",
      style: builderStyle,
    });
    expect(editor().value).toBe("https://example.com/spring");
    expect(editor().themeState.styles).toEqual(builderStyle);
    expect(linked()).toBeNull();

    openInFullEditor({
      code: view(),
      style: builderStyle,
      userId: "u_alice",
    });
    expect(editor().value).toBe("https://qrdx.dev/q/abc1234");
    expect(linked()?.id).toBe("code_1");
  });
});

describe("signed out: sign-in first, then the builder", () => {
  it("keeps only the kind and page type, and only for 30 minutes", () => {
    const now = 1_000_000;
    const intent = openCodeBuilderIntent("page", { type: "menu" }, now);
    expect(intent).toEqual({ kind: "page", type: "menu", at: now });
    // Nothing private: no address, no design.
    expect(Object.keys(intent).sort()).toEqual(["at", "kind", "type"]);
    expect(resumableIntent(intent, now + 1000)).toEqual(intent);
    expect(
      resumableIntent(intent, now + OPEN_CODE_BUILDER_MAX_AGE_MS + 1),
    ).toBeNull();
    expect(resumableIntent({ ...intent, at: now + 5 }, now)).toBeNull();
    expect(resumableIntent({ kind: "other", at: now }, now)).toBeNull();
    expect(resumableIntent(null, now)).toBeNull();
    expect(
      resumableIntent(openCodeBuilderIntent("dynamic", {}, now), now),
    ).toEqual({ kind: "dynamic", at: now });
  });
});

describe("file page types", () => {
  it("are hidden where file storage is off", async () => {
    const { listTemplates } = await import("@/lib/landing/templates");
    const types = listTemplates();
    // Every hidden type is a real page type (a rename would slip through).
    for (const type of FILE_PAGE_TYPES) {
      expect(types.map((item) => item.type)).toContain(type);
    }
    const offered = offeredPageTypes(types, false).map((item) => item.type);
    expect(offered).not.toContain("pdf");
    expect(offered).not.toContain("images");
    expect(offered).not.toContain("mp3");
    expect(offered).not.toContain("video");
    expect(offered).toContain("links");
    expect(offered).toContain("menu");
    expect(offeredPageTypes(types, true)).toHaveLength(types.length);
    expect(pageTypeOffered("pdf", false)).toBe(false);
    expect(pageTypeOffered("pdf", true)).toBe(true);
    expect(pageTypeOffered("menu", false)).toBe(true);
  });
});
