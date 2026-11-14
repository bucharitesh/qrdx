// The Generate tab's content dialog (components/editor/ai/content-dialog.tsx
// and content-request.ts): when the editor has no content, request_content
// opens it; a link or a content form fills the editor; the run then resumes
// by itself with the same prompt and pictures; Cancel puts the editor back.
// The server side of the same flow is in tests/api/ai-agent.test.ts
// ("pictures and missing content"); the clicks run in a real browser.

import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/types/ai";
import { renderIntl } from "../support/intl";

vi.hoisted(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { search: "", pathname: "/playground", hash: "" },
    localStorage: {
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => items.delete(key),
      setItem: (key: string, value: string) => items.set(key, String(value)),
    },
  });
});
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));
vi.mock("@/actions/user-settings", () => ({ getUserSettings: vi.fn() }));
vi.mock("@/actions/qr-codes", () => ({
  createQrCode: vi.fn(),
  updateQrCode: vi.fn(),
}));
vi.mock("@/actions/community", () => ({
  getSavedCommunityFrames: vi.fn(async () => []),
}));
vi.mock("@repo/auth/client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

const {
  contentReady,
  hasEditorContent,
  linkContent,
  MORE_CONTENT_TYPES,
  QUICK_CONTENT_TYPES,
  snapshotContent,
} = await import("@/components/editor/ai/content-request");
const { chatImages, pickAttachment } = await import(
  "@/components/editor/ai/attached-image"
);
const { editorContext, shouldResume } = await import("@/lib/hooks/chat-engine");
const { useQREditorStore } = await import("@/store/editor-store");
const { ContentDialogBody } = await import(
  "@/components/editor/ai/content-dialog"
);
const { ResponsiveDialog } = await import(
  "@repo/design-system/components/ui/revola"
);

const PHOTO = "data:image/png;base64,UEhPVE8=";

const user: ChatMessage = {
  id: "u1",
  role: "user",
  parts: [{ type: "text", text: "Put my photo behind the code" }],
  metadata: {
    promptData: {
      content: "Put my photo behind the code",
      mentions: [],
      images: [{ url: PHOTO }],
    },
  },
};

const asking = (state: "input-available" | "output-available"): ChatMessage =>
  ({
    id: "a1",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-request_content",
        toolCallId: "call_content",
        state,
        input: { reason: "for your photo QR" },
        ...(state === "output-available"
          ? { output: { added: true, type: "url" } }
          : {}),
      },
    ],
    metadata: { resume: "1.token" },
  }) as ChatMessage;

const empty = () =>
  useQREditorStore.setState({
    contentType: "url",
    contentConfigs: {},
    value: "",
  });

describe("the content dialog", () => {
  it("opens for an editor without content (the Sample badge)", () => {
    empty();
    expect(hasEditorContent(useQREditorStore.getState())).toBe(false);
    useQREditorStore.setState({ value: "https://example.com" });
    expect(hasEditorContent(useQREditorStore.getState())).toBe(true);
  });

  it("shows the link field first, then the content types", () => {
    empty();
    const html = renderIntl(
      <ResponsiveDialog open>
        <ContentDialogBody
          onCancel={() => {}}
          onDone={() => {}}
          restore={() => {}}
        />
      </ResponsiveDialog>,
    );
    expect(html).toContain("What should the code open?");
    const link = html.indexOf('id="content-dialog-link"');
    const types = html.indexOf(">or choose a type<");
    expect(link).toBeGreaterThan(-1);
    expect(types).toBeGreaterThan(link);
    for (const label of ["WiFi", "Contact", "WhatsApp", "Email"]) {
      expect(html.slice(types)).toContain(label);
    }
    expect(html).toContain(`${MORE_CONTENT_TYPES.length} more types`);
    expect(html).toContain("Cancel");
    expect(html).toContain("Continue");
  });

  it("lists the catalogue's types once: popular ones first, the link apart", () => {
    expect(QUICK_CONTENT_TYPES).toEqual(
      expect.arrayContaining(["wifi", "vcard", "whatsapp", "email"]),
    );
    expect(QUICK_CONTENT_TYPES).not.toContain("url");
    const all = [...QUICK_CONTENT_TYPES, ...MORE_CONTENT_TYPES];
    expect(new Set(all).size).toBe(all.length);
  });

  it("takes a link the way the URL form does", () => {
    expect(linkContent("example.com")).toMatchObject({
      ok: true,
      config: { type: "url", url: "https://example.com" },
      value: "https://example.com",
      host: "example.com",
    });
    expect(linkContent("")).toEqual({ ok: false, message: null });
    expect(linkContent("not a link")).toMatchObject({ ok: false });
  });

  it("checks a type's form with the encoder's rules", () => {
    empty();
    useQREditorStore.setState({
      contentType: "wifi",
      contentConfigs: {
        wifi: {
          type: "wifi",
          ssid: "Cafe Guest",
          password: "",
          encryption: "WPA",
        },
      },
      value: "WIFI:T:WPA;S:Cafe Guest;P:;H:false;;",
    });
    expect(contentReady(useQREditorStore.getState())).toEqual({
      ok: false,
      message: "Password is required for secured networks",
    });
    useQREditorStore.setState({
      contentConfigs: {
        wifi: {
          type: "wifi",
          ssid: "Cafe Guest",
          password: "sunshine123",
          encryption: "WPA",
        },
      },
      value: "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;H:false;;",
    });
    expect(contentReady(useQREditorStore.getState())).toEqual({
      ok: true,
      type: "wifi",
    });
  });

  it("Cancel puts the editor back as it was", () => {
    empty();
    const before = snapshotContent(useQREditorStore.getState());
    // A form writes as the user types (the Wi-Fi form, here).
    const store = useQREditorStore.getState();
    store.setContentType("wifi");
    store.setContentConfig("wifi", {
      type: "wifi",
      ssid: "Half typed",
      password: "",
      encryption: "WPA",
    });
    store.setValue("WIFI:T:WPA;S:Half typed;P:;H:false;;");
    useQREditorStore.setState(before);
    const after = useQREditorStore.getState();
    expect(after.contentType).toBe("url");
    expect(after.contentConfigs).toEqual({});
    expect(after.value).toBe("");
  });
});

describe("continuing after the dialog", () => {
  it("resumes with the same prompt and picture once content is added", () => {
    empty();
    // Waiting for the dialog: nothing is sent.
    expect(shouldResume({ messages: [user, asking("input-available")] })).toBe(
      false,
    );

    // The user adds a link; the card reports the type, never the value.
    const parsed = linkContent("example.com");
    if (!parsed.ok) throw new Error("link");
    const store = useQREditorStore.getState();
    store.setContentType("url");
    store.setContentConfig("url", parsed.config);
    store.setValue(parsed.value);
    const messages = [user, asking("output-available")];
    expect(shouldResume({ messages })).toBe(true);

    // What the next request carries: the same user turn (prompt and
    // picture) and the editor, which now has content.
    expect(messages[0]).toBe(user);
    expect(chatImages(messages)).toEqual([PHOTO]);
    expect(pickAttachment(messages, 1)).toBe(PHOTO);
    expect(pickAttachment(messages)).toBe(PHOTO);
    expect(pickAttachment(messages, 2)).toBeNull();
    const editor = editorContext();
    expect(editor).toMatchObject({
      contentType: "url",
      value: "https://example.com",
    });
    expect(JSON.stringify(messages[1])).not.toContain("example.com");
  });

  it("resumes after the picture card answers, too", () => {
    const placed = {
      id: "a2",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-use_image",
          toolCallId: "call_image",
          state: "output-available",
          input: { as: "image_qr", summary: "Your photo behind the code" },
          output: { applied: true, as: "image_qr", score: 92, grade: "great" },
        },
      ],
    } as ChatMessage;
    expect(shouldResume({ messages: [user, placed] })).toBe(true);
    const waiting = {
      ...placed,
      parts: [
        { type: "step-start" },
        { ...placed.parts[1], state: "input-available", output: undefined },
      ],
    } as ChatMessage;
    expect(shouldResume({ messages: [user, waiting] })).toBe(false);
  });
});
