// The non-profit discount: registered non-profits and charities ask on the
// pricing page, the form emails QRdx (the same path as pay-by-invoice
// requests), and QRdx replies with a Polar discount code. Only signed-in
// people can ask, a few times a day, only where QRdx itself runs with email,
// and a failed send says where to write instead. Email is faked; nothing is
// sent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  features: { nonprofitDiscounts: true } as Record<string, boolean>,
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed" | "not-configured" },
  sent: [] as {
    to: string | string[];
    replyTo?: string;
    subject: string;
    html: string;
  }[],
  user: null as null | { id: string; email: string },
  limited: false,
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
vi.mock("@/lib/shared", () => ({
  logError: () => {},
  getCurrentUser: async () => {
    const { UnauthorizedError } = await import("@/types/errors");
    if (!state.user) throw new UnauthorizedError();
    return state.user;
  },
}));
vi.mock("@/lib/scope", () => ({
  getActiveWorkspace: async () => ({
    workspace: { name: "Harbour Trust", slug: "harbour" },
  }),
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.limited,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));

const { nonprofitOffer, sendNonprofitRequest, NONPROFIT_REQUEST_TO } =
  await import("@/lib/nonprofit-requests");
const { requestNonprofitDiscountAction } = await import(
  "@/actions/nonprofit-requests"
);

const request = {
  organization: "Harbour Food Trust",
  country: "Ireland",
  registration: "CHY 20012345",
  contactEmail: "hello@harbour.example",
  plan: "business" as const,
};

beforeEach(() => {
  state.features = { nonprofitDiscounts: true };
  state.sendResult = { sent: true, id: "em_1" };
  state.sent = [];
  state.user = { id: "u_mia", email: "mia@harbour.example" };
  state.limited = false;
});

describe("non-profit discount requests", () => {
  it("offers half off Pro or Business", () => {
    expect(nonprofitOffer()).toBe("50% off Pro or Business");
  });

  it("emails QRdx support the details, with the contact email to reply to", async () => {
    expect(await requestNonprofitDiscountAction(request)).toEqual({ ok: true });
    expect(state.sent).toHaveLength(1);
    const [email] = state.sent;
    expect(NONPROFIT_REQUEST_TO).toBe("support@qrdx.dev");
    expect(email).toMatchObject({
      to: "support@qrdx.dev",
      replyTo: "hello@harbour.example",
      subject: "Non-profit discount request: Business for Harbour Food Trust",
    });
    for (const part of [
      "Harbour Food Trust",
      "Ireland",
      "CHY 20012345",
      "50% off Pro or Business",
      "Harbour Trust (harbour)",
      "mia@harbour.example (u_mia)",
      "discount code",
    ]) {
      expect(email?.html).toContain(part);
    }
  });

  it("needs a sign-in, valid details and a few requests a day at most", async () => {
    state.user = null;
    expect(await requestNonprofitDiscountAction(request)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
    state.user = { id: "u_mia", email: "mia@harbour.example" };
    for (const bad of [
      { contactEmail: "nope" },
      { organization: " " },
      { registration: "" },
      { country: "x" },
      { plan: "enterprise" },
    ]) {
      expect(
        await requestNonprofitDiscountAction({
          ...request,
          ...bad,
        } as typeof request),
      ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    }
    state.limited = true;
    expect(await requestNonprofitDiscountAction(request)).toMatchObject({
      ok: false,
      code: "RATE_LIMITED",
    });
    expect(state.sent).toEqual([]);
  });

  it("says where to write when the email doesn't go out", async () => {
    state.sendResult = { sent: false, reason: "failed" };
    expect(await requestNonprofitDiscountAction(request)).toEqual({
      ok: false,
      code: "NOT_SENT",
      error: "We couldn't send your request. Email support@qrdx.dev instead.",
    });
  });

  it("isn't offered where QRdx doesn't run it", async () => {
    state.features = { nonprofitDiscounts: false };
    await expect(
      sendNonprofitRequest(request, {
        id: "u_mia",
        email: "mia@harbour.example",
        workspace: null,
      }),
    ).rejects.toMatchObject({ status: 503, code: "UNAVAILABLE" });
    expect(state.sent).toEqual([]);
  });
});
