import { beforeEach, describe, expect, it, vi } from "vitest";
import { isReservedEmailAddress } from "@/lib/email/reserved-address";

const sent: { to: string[] }[] = [];

vi.mock("@/lib/env", () => ({
  env: { RESEND_API_KEY: "re_test", EMAIL_FROM: "QRdx <hi@qrdx.dev>" },
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => true,
}));
vi.mock("@react-email/render", () => ({
  render: async () => "<p>hi</p>",
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (email: { to: string[] }) => {
        sent.push({ to: email.to });
        return { data: { id: "em_1" }, error: null };
      },
    };
  },
}));

describe("reserved test and example addresses", () => {
  it("recognises RFC 2606 and 6761 names", () => {
    for (const address of [
      "ada@qrdx.test",
      "Ada@Example.COM",
      "a@sub.example.org",
      "a@example.net.",
      "a@host.invalid",
      "a@thing.example",
      "a@localhost",
    ]) {
      expect(isReservedEmailAddress(address), address).toBe(true);
    }
    for (const address of [
      "ada@gmail.com",
      "a@example.co",
      "a@myexample.com",
      "a@test.com",
      "a@qrdx.dev",
    ]) {
      expect(isReservedEmailAddress(address), address).toBe(false);
    }
  });
});

describe("sendEmail never mails reserved addresses", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("skips a message to reserved addresses only", async () => {
    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      to: ["e2e@qrdx.test", "x@example.com"],
      subject: "Your QRdx sign-in code",
      react: <p>code</p>,
    });
    expect(result).toEqual({ sent: false, reason: "reserved-address" });
    expect(sent).toHaveLength(0);
  });

  it("drops reserved addresses from a mixed list", async () => {
    const { sendEmail } = await import("@/lib/email/send");
    const result = await sendEmail({
      to: ["ada@gmail.com", "e2e@qrdx.test"],
      subject: "Hello",
      react: <p>hi</p>,
    });
    expect(result).toEqual({ sent: true, id: "em_1" });
    expect(sent).toEqual([{ to: ["ada@gmail.com"] }]);
  });
});
