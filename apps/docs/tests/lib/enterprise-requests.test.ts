// The contact form on /enterprise. Anyone can send it, so it emails QRdx's
// sales address the way pay-by-invoice requests do and adds the public
// forms' protections: per-IP limits, Turnstile and a field only bots fill
// in. Where the form isn't offered, nothing is sent and the page's address
// is the way in. Email, rate limits and Turnstile are faked; nothing is sent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  features: { enterpriseRequests: true } as Record<string, boolean>,
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed" | "not-configured" },
  sent: [] as {
    to: string | string[];
    replyTo?: string;
    subject: string;
    html: string;
  }[],
  limited: false,
  limitKeys: [] as string[],
  turnstile: true,
  turnstileTokens: [] as (string | null | undefined)[],
}));

vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => Boolean(state.features[id]),
}));
vi.mock("@/lib/email/send", async () => {
  const { renderEmail } =
    await vi.importActual<typeof import("@/lib/email/send")>(
      "@/lib/email/send",
    );
  return {
    isEmailConfigured: true,
    sendEmail: async (message: {
      to: string | string[];
      replyTo?: string;
      subject: string;
      react: React.ReactElement;
    }) => {
      const { html } = await renderEmail(message.react);
      state.sent.push({
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        html,
      });
      return state.sendResult;
    },
  };
});
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("@/lib/safety/turnstile", () => ({
  TURNSTILE_FIELD: "cf-turnstile-response",
  verifyTurnstile: async (token: string | null | undefined) => {
    state.turnstileTokens.push(token);
    return state.turnstile;
  },
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async (key: string) => {
      state.limitKeys.push(key);
      return {
        success: !state.limited,
        limit: 3,
        remaining: 0,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      };
    },
  }),
}));

const { submitEnterpriseRequest } = await import(
  "@/actions/enterprise-requests"
);
const { sendEnterpriseRequest } = await import("@/lib/enterprise-requests");
const { ENTERPRISE_EMAIL, ENTERPRISE_HONEYPOT_FIELD } = await import(
  "@/lib/enterprise"
);

const details = {
  name: "Mei Tanaka",
  email: "mei@north.example",
  company: "North Foods KK",
  teamSize: "201-1000",
  need: "Single sign-on for 400 people and a yearly invoice in yen.",
  locale: "ja",
  "cf-turnstile-response": "token-1",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const send = (values: Record<string, string> = details) =>
  submitEnterpriseRequest({ status: "idle" }, form(values));

beforeEach(() => {
  state.features = { enterpriseRequests: true };
  state.sendResult = { sent: true, id: "em_1" };
  state.sent = [];
  state.limited = false;
  state.limitKeys = [];
  state.turnstile = true;
  state.turnstileTokens = [];
});

describe("the enterprise contact form", () => {
  it("emails QRdx the details, with the sender's address to reply to", async () => {
    expect(await send()).toEqual({
      status: "sent",
      email: "mei@north.example",
    });
    expect(ENTERPRISE_EMAIL).toBe("enterprise@qrdx.dev");
    expect(state.sent).toHaveLength(1);
    const [email] = state.sent;
    expect(email).toMatchObject({
      to: "enterprise@qrdx.dev",
      replyTo: "mei@north.example",
      subject: "Enterprise: North Foods KK (201 to 1,000 people)",
    });
    for (const part of [
      "Mei Tanaka",
      "mei@north.example",
      "North Foods KK",
      "201 to 1,000 people",
      "Single sign-on for 400 people",
      "ja",
    ]) {
      expect(email?.html).toContain(part);
    }
    expect(state.turnstileTokens).toEqual(["token-1"]);
  });

  it("limits each IP address, over ten minutes and over a day", async () => {
    await send();
    expect(state.limitKeys).toEqual([
      "enterprise-request:ip:203.0.113.9",
      "enterprise-request:day:ip:203.0.113.9",
    ]);
    state.limited = true;
    expect(await send()).toEqual({ status: "error", code: "rateLimited" });
    expect(state.sent).toHaveLength(1);
  });

  it("refuses a failed bot check", async () => {
    state.turnstile = false;
    expect(await send()).toEqual({ status: "error", code: "check" });
    expect(state.sent).toEqual([]);
  });

  it("tells a bot it worked without sending anything", async () => {
    expect(
      await send({ ...details, [ENTERPRISE_HONEYPOT_FIELD]: "https://spam" }),
    ).toEqual({ status: "sent", email: "mei@north.example" });
    expect(state.sent).toEqual([]);
    expect(state.limitKeys).toEqual([]);
  });

  it("points at the field that's wrong", async () => {
    expect(await send({ ...details, email: "nope" })).toEqual({
      status: "error",
      code: "invalid",
      field: "email",
    });
    expect(await send({ ...details, company: "   " })).toMatchObject({
      field: "company",
    });
    expect(await send({ ...details, teamSize: "lots" })).toMatchObject({
      field: "teamSize",
    });
    expect(await send({ ...details, need: "x".repeat(2001) })).toMatchObject({
      field: "need",
    });
    expect(state.sent).toEqual([]);
  });

  it("says where to write when the email doesn't go out", async () => {
    state.sendResult = { sent: false, reason: "failed" };
    expect(await send()).toEqual({ status: "error", code: "notSent" });
  });

  it("isn't offered where QRdx doesn't run it", async () => {
    state.features = { enterpriseRequests: false };
    expect(await send()).toEqual({ status: "error", code: "unavailable" });
    await expect(
      sendEnterpriseRequest(
        {
          name: "Mei",
          email: "mei@north.example",
          company: "North",
          teamSize: "1-10",
          need: "SSO",
        },
        "en",
      ),
    ).rejects.toMatchObject({ status: 503, code: "UNAVAILABLE" });
    expect(state.sent).toEqual([]);
  });

  it("writes an unknown page language as English", async () => {
    await send({ ...details, locale: "xx" });
    expect(state.sent[0]?.html).toContain("Page language");
    expect(state.sent[0]?.html).not.toContain(">xx<");
  });
});

describe("where the enterprise form is offered", () => {
  it("runs only where QRdx itself does, with email set up", async () => {
    const { computeFeatures } = await vi.importActual<
      typeof import("@/lib/feature-availability-rules")
    >("@/lib/feature-availability-rules");
    const on = (env: Record<string, string>) =>
      computeFeatures({ env, onVercel: true, production: true })
        .enterpriseRequests;
    const email = { RESEND_API_KEY: "x", EMAIL_FROM: "QRdx <hi@qrdx.dev>" };
    expect(on({ ...email, NEXT_PUBLIC_APP_URL: "https://qrdx.dev" })).toBe(
      true,
    );
    expect(on({ NEXT_PUBLIC_APP_URL: "https://qrdx.dev" })).toBe(false);
    expect(
      on({ ...email, NEXT_PUBLIC_APP_URL: "https://qr.example.org" }),
    ).toBe(false);
  });
});
