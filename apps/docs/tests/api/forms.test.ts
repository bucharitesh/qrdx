// Hosted-page forms as content/docs/forms-and-pages.mdx describes them: the
// public POST /api/forms/<pageId> (spam protection, answer validation, code
// controls, monthly response limits per plan) and the owner's CSV export
// (/dashboard/pages/<id>/responses/export). The route handlers and the
// responses service run for real against in-memory tables; only Cloudflare
// Turnstile, analytics and event delivery are stubbed.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LANDING_THEME } from "@/types/landing";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; organizationId: string | null },
  plan: "free" as "free" | "pro" | "business",
  rateLimited: false,
  env: {} as Record<string, string | undefined>,
  turnstile: { ok: true } as { ok: boolean; reason?: string },
  turnstileCalls: [] as unknown[],
  emitted: [] as { scope: unknown; data: Record<string, unknown> }[],
  cookies: new Map<string, string>(),
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock(
  "@repo/database/schema",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.session
          ? {
              user: { id: state.session.userId },
              session: { activeOrganizationId: state.session.organizationId },
            }
          : null,
    },
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name)
        ? { name, value: state.cookies.get(name) }
        : undefined,
  }),
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.rateLimited,
      limit: 5,
      remaining: state.rateLimited ? 0 : 4,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...original,
    env: new Proxy(original.env, {
      get: (target, key) =>
        typeof key === "string" && key in state.env
          ? state.env[key]
          : Reflect.get(target, key),
    }),
  };
});
vi.mock("@/app/api/forms/_lib/turnstile", () => ({
  verifyTurnstile: async (input: unknown) => {
    state.turnstileCalls.push(input);
    return state.turnstile;
  },
}));
vi.mock("@/lib/events", () => ({
  emitFormSubmitted: (scope: unknown, data: Record<string, unknown>) =>
    state.emitted.push({ scope, data }),
}));
vi.mock("@/lib/analytics/server", () => ({ trackServer: () => {} }));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const forms = await import("@/app/api/forms/[pageId]/route");
const exportRoute = await import(
  "@/app/dashboard/pages/[id]/responses/export/route"
);

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-20T12:00:00Z");
const DAY = 86_400_000;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const FEEDBACK_FIELDS = [
  { id: "rating", type: "stars", label: "How was it?", required: true, max: 5 },
  {
    id: "comment",
    type: "text",
    label: "Anything else?",
    required: false,
    maxLength: 200,
  },
  { id: "email", type: "email", label: "Email", required: false },
  {
    id: "visit",
    type: "choice",
    label: "Your visit",
    required: false,
    options: ["Lunch", "Dinner"],
  },
];

function content(blocks: Record<string, unknown>[]) {
  return { version: 1, theme: DEFAULT_LANDING_THEME, blocks };
}

const feedbackBlock = (overrides: Record<string, unknown> = {}) => ({
  id: "feedback",
  type: "form",
  props: { title: "Feedback", fields: FEEDBACK_FIELDS },
  ...overrides,
});

function page(
  id: string,
  overrides: Record<string, unknown> = {},
  blocks: Record<string, unknown>[] = [feedbackBlock()],
) {
  fakeDb.seed("landingPage", [
    {
      id,
      userId: "u_alice",
      organizationId: null,
      type: "blank",
      title: "Guest Feedback",
      content: content(blocks),
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    },
  ]);
}

let codeSeq = 0;
/** A dynamic code that shows the page (what "publishing" a page means). */
function pageCode(pageId: string, overrides: Record<string, unknown> = {}) {
  codeSeq += 1;
  const id = `code_${codeSeq}`;
  fakeDb.seed("qrCode", [
    {
      id,
      userId: "u_alice",
      organizationId: null,
      slug: `Page${String(codeSeq).padStart(3, "0")}`,
      kind: "page",
      pageId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
      domainId: null,
      passwordHash: null,
      startsAt: null,
      expiresAt: null,
      scanLimit: null,
      scanCount: 0,
      pausedAt: null,
      fallbackUrl: null,
      ...overrides,
    },
  ]);
  return id;
}

/** Earlier responses for `pageId`, received at `at`. */
function earlierResponses(pageId: string, count: number, at: Date) {
  fakeDb.seed(
    "formResponse",
    Array.from({ length: count }, (_, i) => ({
      id: `old_${pageId}_${at.getTime()}_${i}`,
      pageId,
      qrCodeId: null,
      data: { block: "feedback", answers: [] },
      visitorHash: null,
      createdAt: at,
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  codeSeq = 0;
  state.session = null;
  state.plan = "free";
  state.rateLimited = false;
  state.env = {
    TURNSTILE_SECRET_KEY: undefined,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined,
  };
  state.turnstile = { ok: true };
  state.turnstileCalls = [];
  state.emitted = [];
  state.cookies = new Map();
  page("page_1");
  pageCode("page_1");
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Requests ───────────────────────────────────────────────────────────────

const VISITOR = {
  "x-real-ip": "203.0.113.7",
  "user-agent": "Mozilla/5.0 (iPhone)",
};

function submit(
  pageId: string,
  body: unknown,
  {
    raw,
    headers = VISITOR,
  }: { raw?: string; headers?: Record<string, string> } = {},
) {
  return forms.POST(
    new NextRequest(new URL(`/api/forms/${pageId}`, ORIGIN), {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: raw ?? JSON.stringify(body),
    }),
    { params: Promise.resolve({ pageId }) },
  );
}

const answer = (
  answers: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  block: "feedback",
  answers,
  ...extra,
});

function status(pageId: string, block = "feedback") {
  return forms.GET(
    new NextRequest(new URL(`/api/forms/${pageId}?block=${block}`, ORIGIN), {
      headers: VISITOR,
    }),
    { params: Promise.resolve({ pageId }) },
  );
}

function exportCsv(pageId: string, query = "") {
  return exportRoute.GET(
    new NextRequest(
      new URL(`/dashboard/pages/${pageId}/responses/export${query}`, ORIGIN),
    ),
    { params: Promise.resolve({ id: pageId }) },
  );
}

const bodyOf = async (response: Response) =>
  (await response.json()) as {
    code?: string;
    message?: string;
    ok?: boolean;
    data?: { fields?: Record<string, string> };
  };

// ─── Submitting ─────────────────────────────────────────────────────────────

describe("POST /api/forms/<pageId>", () => {
  it("stores a valid response with the code that was scanned", async () => {
    const response = await submit(
      "page_1",
      answer({
        rating: 5,
        comment: "  Great food  ",
        email: "Visitor@Example.COM",
        visit: "Dinner",
        notAQuestion: "ignored",
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });

    const [stored] = fakeDb.rows("formResponse");
    expect(stored).toMatchObject({
      pageId: "page_1",
      qrCodeId: "code_1",
      createdAt: NOW,
      data: {
        block: "feedback",
        answers: [
          { id: "rating", label: "How was it?", type: "stars", value: 5 },
          {
            id: "comment",
            label: "Anything else?",
            type: "text",
            value: "Great food",
          },
          {
            id: "email",
            label: "Email",
            type: "email",
            value: "visitor@example.com",
          },
          { id: "visit", label: "Your visit", type: "choice", value: "Dinner" },
        ],
      },
    });
  });

  it("never stores the visitor's IP address", async () => {
    await submit("page_1", answer({ rating: 4 }));
    const [stored] = fakeDb.rows("formResponse");
    expect(stored?.visitorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain("203.0.113.7");
  });

  it("sends a form.submitted event with the answers", async () => {
    await submit("page_1", answer({ rating: 3, visit: "Lunch" }));
    expect(state.emitted).toHaveLength(1);
    expect(state.emitted[0]?.scope).toEqual({
      userId: "u_alice",
      organizationId: null,
    });
    expect(state.emitted[0]?.data).toMatchObject({
      responseId: fakeDb.rows("formResponse")[0]?.id,
      page: { id: "page_1", title: "Guest Feedback" },
      code: { id: "code_1", slug: "Page001" },
      fields: [
        { name: "rating", label: "How was it?", value: "3 ★" },
        { name: "visit", label: "Your visit", value: "Lunch" },
      ],
    });
  });

  it("attributes to the scanned code when several codes show the page", async () => {
    pageCode("page_1");
    await submit("page_1", answer({ rating: 5 }, { qrCodeId: "code_2" }));
    await submit("page_1", answer({ rating: 5 }));
    // A code of another page is not trusted.
    pageCode("page_other");
    await submit("page_1", answer({ rating: 5 }, { qrCodeId: "code_3" }));
    expect(fakeDb.rows("formResponse").map((row) => row.qrCodeId)).toEqual([
      "code_2",
      null,
      null,
    ]);
  });

  it("explains which answers need another look", async () => {
    const response = await submit(
      "page_1",
      answer({
        rating: 9,
        email: "nope",
        visit: "Breakfast",
        comment: "x".repeat(201),
      }),
    );
    expect(response.status).toBe(400);
    const body = await bodyOf(response);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.data?.fields).toEqual({
      rating: "Choose 1 to 5 stars",
      comment: "Keep it under 200 characters",
      email: "Enter a valid email address",
      visit: "Choose one of the options",
    });
    const missing = await bodyOf(await submit("page_1", answer({})));
    expect(missing.data?.fields).toEqual({ rating: "This field is required" });
    expect(fakeDb.rows("formResponse")).toHaveLength(0);
  });

  it("refuses an empty response to an all-optional form", async () => {
    fakeDb.reset();
    page("page_1", {}, [
      feedbackBlock({
        props: { fields: FEEDBACK_FIELDS.slice(1) },
      }),
    ]);
    pageCode("page_1");
    const response = await submit("page_1", answer({ comment: "   " }));
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).code).toBe("EMPTY_RESPONSE");
  });

  it("rejects malformed bodies", async () => {
    expect((await submit("page_1", null, { raw: "{oops" })).status).toBe(400);
    expect((await submit("page_1", { answers: {} })).status).toBe(400);
    expect(
      (await submit("page_1", { block: "../etc", answers: {} })).status,
    ).toBe(400);
  });

  it("caps bodies at 32 KB (413)", async () => {
    const response = await submit(
      "page_1",
      answer({ rating: 5, comment: "x".repeat(33 * 1024) }),
    );
    expect(response.status).toBe(413);
  });

  it("rate limits one visitor (429)", async () => {
    state.rateLimited = true;
    const response = await submit("page_1", answer({ rating: 5 }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(fakeDb.rows("formResponse")).toHaveLength(0);
  });
});

describe("which forms accept responses", () => {
  const notFound = async (pageId: string, body = answer({ rating: 5 })) => {
    const response = await submit(pageId, body);
    expect(response.status, pageId).toBe(404);
    expect(await bodyOf(response)).toMatchObject({
      code: "NOT_FOUND",
      message: "This form is no longer available.",
    });
  };

  it("answers 404 for missing pages, blocks and malformed ids", async () => {
    await notFound("page_missing");
    await notFound("page_1", answer({ rating: 5 }, { block: "other" }));
    await notFound("bad id!");
  });

  it("answers 404 for pages no live code shows (unpublished)", async () => {
    page("page_draft");
    await notFound("page_draft");
    for (const [id, overrides] of [
      ["page_archived", { archivedAt: NOW }],
      ["page_trashed", { deletedAt: NOW }],
      ["page_disabled", { isActive: false }],
      ["page_redirect", { kind: "redirect" }],
    ] as const) {
      page(id);
      pageCode(id, overrides);
      await notFound(id);
    }
    expect(fakeDb.rows("formResponse")).toHaveLength(0);
  });

  it("answers 404 for hidden form blocks and non-form blocks", async () => {
    page("page_hidden", {}, [feedbackBlock({ hidden: true })]);
    pageCode("page_hidden");
    await notFound("page_hidden");
    page("page_text", {}, [
      { id: "feedback", type: "text", props: { text: "Hello" } },
    ]);
    pageCode("page_text");
    await notFound("page_text");
  });

  it("closes the form while its code is paused, scheduled, expired or over its scan limit", async () => {
    for (const [id, overrides] of [
      ["page_paused", { pausedAt: NOW }],
      ["page_later", { startsAt: new Date(NOW.getTime() + DAY) }],
      ["page_expired", { expiresAt: new Date(NOW.getTime() - DAY) }],
      ["page_capped", { scanLimit: 10, scanCount: 11 }],
    ] as const) {
      page(id);
      pageCode(id, overrides);
      const response = await submit(id, answer({ rating: 5 }));
      expect(response.status, id).toBe(403);
      expect(await bodyOf(response)).toMatchObject({
        code: "FORM_CLOSED",
        message: "This form isn't accepting responses right now.",
      });
    }
    expect(fakeDb.rows("formResponse")).toHaveLength(0);
  });

  it("keeps a password-protected page's form locked until unlocked", async () => {
    page("page_locked");
    pageCode("page_locked", { passwordHash: "$2a$04$hash" });
    expect((await submit("page_locked", answer({ rating: 5 }))).status).toBe(
      403,
    );
    // A forged unlock cookie doesn't open it.
    state.cookies.set("qrdx_unlock_Page002", "forged.value");
    expect((await submit("page_locked", answer({ rating: 5 }))).status).toBe(
      403,
    );
  });

  it("on a custom domain, only takes responses for that domain's codes", async () => {
    page("page_branded");
    pageCode("page_branded", { domainId: "dom_brand" });
    const onDomain = (domainId: string) =>
      submit("page_branded", answer({ rating: 5 }), {
        headers: { ...VISITOR, "x-qrdx-custom-domain": domainId },
      });
    expect((await onDomain("dom_other")).status).toBe(404);
    expect((await onDomain("dom_brand")).status).toBe(201);
    // QRdx's own host serves every code of the page.
    expect((await submit("page_branded", answer({ rating: 5 }))).status).toBe(
      201,
    );
  });

  it("reports whether the form is accepting responses (GET)", async () => {
    const open = await status("page_1");
    expect(open.status).toBe(200);
    expect(await open.json()).toEqual({ accepting: true });
    expect((await status("page_1", "nope")).status).toBe(404);
    expect((await status("page_1", "../x")).status).toBe(404);
  });
});

// ─── Spam protection ────────────────────────────────────────────────────────

describe("spam protection", () => {
  it("pretends to accept honeypot submissions and stores nothing", async () => {
    const response = await submit(
      "page_1",
      answer({ rating: 5 }, { hp: "https://spam.example" }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(fakeDb.rows("formResponse")).toHaveLength(0);
    expect(state.emitted).toHaveLength(0);
  });

  it("skips Turnstile without both keys", async () => {
    state.env.TURNSTILE_SECRET_KEY = "secret";
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);
    state.env = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site" };
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);
    expect(state.turnstileCalls).toHaveLength(0);
  });

  it("checks Turnstile when both keys are set", async () => {
    state.env = {
      TURNSTILE_SECRET_KEY: "secret",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site",
    };
    state.turnstile = { ok: false, reason: "invalid" };
    const failed = await submit(
      "page_1",
      answer({ rating: 5 }, { token: "bad-token" }),
    );
    expect(failed.status).toBe(400);
    expect((await bodyOf(failed)).code).toBe("VERIFICATION_FAILED");
    expect(state.turnstileCalls[0]).toEqual({
      token: "bad-token",
      secret: "secret",
      ip: "203.0.113.7",
    });
    expect(fakeDb.rows("formResponse")).toHaveLength(0);

    state.turnstile = { ok: true };
    expect(
      (await submit("page_1", answer({ rating: 5 }, { token: "good" }))).status,
    ).toBe(201);
  });

  it("still accepts responses when Cloudflare is unreachable", async () => {
    state.env = {
      TURNSTILE_SECRET_KEY: "secret",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site",
    };
    state.turnstile = { ok: false, reason: "unavailable" };
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);
    expect(fakeDb.rows("formResponse")).toHaveLength(1);
  });
});

// ─── Monthly limits ─────────────────────────────────────────────────────────

describe("monthly response limits", () => {
  const thisMonth = new Date("2026-11-02T08:00:00Z");
  const lastMonth = new Date("2026-10-31T23:59:59Z");

  it("closes Free forms after 50 responses this month, across the workspace's pages", async () => {
    page("page_2");
    earlierResponses("page_1", 30, thisMonth);
    earlierResponses("page_2", 19, thisMonth);
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);

    const full = await submit("page_1", answer({ rating: 5 }));
    expect(full.status).toBe(403);
    expect(await bodyOf(full)).toMatchObject({
      code: "FORM_CLOSED",
      message: "This form isn't accepting responses right now.",
    });
    expect(await (await status("page_1")).json()).toEqual({ accepting: false });
    // Responses already received are kept.
    expect(fakeDb.rows("formResponse")).toHaveLength(50);
  });

  it("counts only this calendar month (UTC) and starts over on the 1st", async () => {
    earlierResponses("page_1", 500, lastMonth);
    earlierResponses("page_1", 49, thisMonth);
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(403);

    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);
  });

  it("doesn't count other workspaces' responses", async () => {
    page("page_team", { organizationId: "org_acme" });
    page("page_bob", { userId: "u_bob" });
    earlierResponses("page_team", 60, thisMonth);
    earlierResponses("page_bob", 60, thisMonth);
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);
  });

  it("allows 1,000 a month on Pro and 10,000 on Business", async () => {
    state.plan = "pro";
    earlierResponses("page_1", 999, thisMonth);
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(403);
    state.plan = "business";
    expect((await submit("page_1", answer({ rating: 5 }))).status).toBe(201);
  });
});

// ─── The owner's inbox ──────────────────────────────────────────────────────

describe("CSV export of a page's responses", () => {
  beforeEach(async () => {
    await submit("page_1", answer({ rating: 4, comment: "=HYPERLINK(1)" }));
    vi.setSystemTime(NOW.getTime() + 60_000);
    await submit("page_1", answer({ rating: 5, visit: "Lunch" }));
  });

  it("gives the owner every response, newest first", async () => {
    state.session = { userId: "u_alice", organizationId: null };
    const response = await exportCsv("page_1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="qrdx-guest-feedback-responses-2026-11-20.csv"',
    );
    // A UTF-8 byte order mark first, so Excel reads non-ASCII answers.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes).trimEnd().split("\r\n");
    expect(lines).toEqual([
      "submitted_at,code,How was it?,Anything else?,Email,Your visit",
      `${new Date(NOW.getTime() + 60_000).toISOString()},Page001,5,,,Lunch`,
      // Formula-looking answers are neutralized for spreadsheets.
      `${NOW.toISOString()},Page001,4,'=HYPERLINK(1),,`,
    ]);
  });

  it("filters by form", async () => {
    state.session = { userId: "u_alice", organizationId: null };
    const one = await (await exportCsv("page_1", "?form=feedback")).text();
    expect(one.trimEnd().split("\r\n")).toHaveLength(3);
    const none = await (await exportCsv("page_1", "?form=other")).text();
    expect(none.trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("is 404 for other workspaces and 401 when signed out", async () => {
    expect((await exportCsv("page_1")).status).toBe(401);
    state.session = { userId: "u_bob", organizationId: null };
    expect((await exportCsv("page_1")).status).toBe(404);
    // The owner's team workspace doesn't see personal pages either.
    fakeDb.seed("member", [
      {
        id: "m1",
        organizationId: "org_acme",
        userId: "u_alice",
        role: "owner",
      },
    ]);
    state.session = { userId: "u_alice", organizationId: "org_acme" };
    expect((await exportCsv("page_1")).status).toBe(404);
  });

  it("lets every member of a team export the team's pages", async () => {
    page("page_team", { organizationId: "org_acme", userId: "u_alice" });
    pageCode("page_team", { organizationId: "org_acme" });
    await submit("page_team", answer({ rating: 2 }));
    fakeDb.seed("member", [
      { id: "m2", organizationId: "org_acme", userId: "u_bob", role: "member" },
    ]);
    state.session = { userId: "u_bob", organizationId: "org_acme" };
    const response = await exportCsv("page_team");
    expect(response.status).toBe(200);
    expect((await response.text()).trimEnd().split("\r\n")).toHaveLength(2);
  });
});
