// Paying Business yearly by invoice (agency tools). Polar's checkout takes
// cards and wallets only (polar.sh/docs/features/checkout/payment-methods),
// so the pricing page's form emails QRdx the billing details and the
// invoice is arranged by hand. Only signed-in people can ask, only where
// QRdx itself runs with email, and a failed send says where to write
// instead. Email is faked; nothing is sent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  features: { invoiceRequests: true } as Record<string, boolean>,
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
    workspace: { name: "North Agency", slug: "north" },
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

const { invoicePlan, sendInvoiceRequest, INVOICE_REQUEST_TO } = await import(
  "@/lib/invoice-requests"
);
const { requestInvoiceAction } = await import("@/actions/invoice-requests");

const request = {
  company: "North Agency Ltd",
  billingEmail: "accounts@north.example",
  country: "Germany",
  taxId: "DE123456789",
  address: "Hauptstr. 1\n10115 Berlin",
  notes: "PO 4471",
};

beforeEach(() => {
  state.features = { invoiceRequests: true };
  state.sendResult = { sent: true, id: "em_1" };
  state.sent = [];
  state.user = { id: "u_ana", email: "ana@north.example" };
  state.limited = false;
});

describe("pay by invoice", () => {
  it("is for Business, billed yearly", () => {
    expect(invoicePlan()).toEqual({
      plan: "business",
      label: "Business, billed yearly ($144 a year)",
    });
  });

  it("emails QRdx the details, with the billing email to reply to", async () => {
    expect(await requestInvoiceAction(request)).toEqual({ ok: true });
    expect(state.sent).toHaveLength(1);
    const [email] = state.sent;
    expect(email).toMatchObject({
      to: INVOICE_REQUEST_TO,
      replyTo: "accounts@north.example",
      subject: expect.stringMatching(
        /^Invoice request: Business, billed yearly .* for North Agency Ltd$/,
      ),
    });
    expect(INVOICE_REQUEST_TO).toBe("enterprise@qrdx.dev");
    for (const part of [
      "North Agency Ltd",
      "DE123456789",
      "PO 4471",
      "North Agency (north)",
      "ana@north.example (u_ana)",
      "arranged by hand",
    ]) {
      expect(email?.html).toContain(part);
    }
  });

  it("needs a sign-in, valid details and a few requests a day at most", async () => {
    state.user = null;
    expect(await requestInvoiceAction(request)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
    state.user = { id: "u_ana", email: "ana@north.example" };
    expect(
      await requestInvoiceAction({ ...request, billingEmail: "nope" }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      await requestInvoiceAction({ ...request, company: "  " }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    state.limited = true;
    expect(await requestInvoiceAction(request)).toMatchObject({
      ok: false,
      code: "RATE_LIMITED",
    });
    expect(state.sent).toEqual([]);
  });

  it("says where to write when the email doesn't go out", async () => {
    state.sendResult = { sent: false, reason: "failed" };
    expect(await requestInvoiceAction(request)).toEqual({
      ok: false,
      code: "NOT_SENT",
      error:
        "We couldn't send your request. Email enterprise@qrdx.dev instead.",
    });
  });

  it("isn't offered where QRdx doesn't run it", async () => {
    state.features = { invoiceRequests: false };
    await expect(
      sendInvoiceRequest(request, {
        id: "u_ana",
        email: "ana@north.example",
        workspace: null,
      }),
    ).rejects.toMatchObject({ status: 503, code: "UNAVAILABLE" });
    expect(state.sent).toEqual([]);
  });
});

describe("where invoice requests are offered", () => {
  it("runs only where QRdx itself does, with email set up", async () => {
    const { computeFeatures } =
      await vi.importActual<typeof import("@repo/availability")>(
        "@repo/availability",
      );
    const on = (env: Record<string, string>) =>
      computeFeatures({ env, onVercel: true, production: true })
        .invoiceRequests;
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
