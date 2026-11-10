import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ApiRequest } from "../nodes/Qrdx/api";
import {
  eventItems,
  parseSignatureHeader,
  reconcileHooks,
  sameEvents,
  verifySignature,
} from "../nodes/Qrdx/webhook";
import { fakeSigningSecret } from "./support/fakes";

// How QRdx signs a delivery (apps/docs/lib/events/signature.ts):
//   X-QRdx-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
function sign(secret: string, body: string, timestamp: number) {
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

const SECRET = fakeSigningSecret();
const NOW = 1_800_000_000;
const body = JSON.stringify({
  id: "evt_1",
  type: "code.created",
  created_at: "2026-11-10T09:30:00.000Z",
  data: { code: { id: "c1", title: "Café menü" } },
});

describe("verifySignature", () => {
  it("accepts QRdx's signature over the raw body, as text or bytes", () => {
    const header = sign(SECRET, body, NOW);
    expect(verifySignature(SECRET, header, body, NOW)).toBe(true);
    expect(verifySignature(SECRET, header, Buffer.from(body), NOW + 60)).toBe(
      true
    );
  });

  it("rejects a changed body, another secret or a missing signature", () => {
    const header = sign(SECRET, body, NOW);
    expect(verifySignature(SECRET, header, `${body} `, NOW)).toBe(false);
    expect(verifySignature("whsec_other", header, body, NOW)).toBe(false);
    expect(verifySignature("", header, body, NOW)).toBe(false);
    expect(verifySignature(SECRET, `t=${NOW}`, body, NOW)).toBe(false);
    expect(verifySignature(SECRET, "v1=abc", body, NOW)).toBe(false);
    expect(verifySignature(SECRET, `t=${NOW},v1=abc`, body, NOW)).toBe(false);
  });

  it("rejects timestamps more than five minutes away", () => {
    const header = sign(SECRET, body, NOW);
    expect(verifySignature(SECRET, header, body, NOW + 300)).toBe(true);
    expect(verifySignature(SECRET, header, body, NOW + 301)).toBe(false);
    expect(verifySignature(SECRET, header, body, NOW - 301)).toBe(false);
  });

  it("accepts any matching v1 when several are sent", () => {
    const good = sign(SECRET, body, NOW).split(",")[1];
    expect(
      verifySignature(SECRET, `t=${NOW}, v1=deadbeef, ${good}`, body, NOW)
    ).toBe(true);
  });

  it("parses the header", () => {
    expect(parseSignatureHeader("t=12,v1=ab, v1=cd,x=1")).toEqual({
      timestamp: 12,
      signatures: ["ab", "cd"],
    });
    expect(parseSignatureHeader("t=soon")).toEqual({
      timestamp: null,
      signatures: [],
    });
  });
});

describe("eventItems", () => {
  const batch = {
    id: "evt_2",
    type: "scan.created",
    created_at: "2026-11-10T09:31:00.000Z",
    data: {
      window_started_at: "2026-11-10T09:31:00.000Z",
      window_seconds: 60,
      count: 2,
      scans: [
        { scan_id: "s1", country: "DE" },
        { scan_id: "s2", country: "FR" },
      ],
    },
  };

  it("keeps the envelope as one item by default", () => {
    expect(eventItems(batch)).toEqual([batch]);
  });

  it("splits a scan batch into one item per scan", () => {
    expect(eventItems(batch, { splitScans: true })).toEqual([
      {
        scan_id: "s1",
        country: "DE",
        event_id: "evt_2",
        event_created_at: "2026-11-10T09:31:00.000Z",
      },
      {
        scan_id: "s2",
        country: "FR",
        event_id: "evt_2",
        event_created_at: "2026-11-10T09:31:00.000Z",
      },
    ]);
  });

  it("doesn't split other events", () => {
    const created = { id: "evt_3", type: "code.created", data: {} };
    expect(eventItems(created, { splitScans: true })).toEqual([created]);
  });
});

describe("reconcileHooks", () => {
  const HOOK_URL = "https://n8n.example.com/webhook/abc/webhook";

  function fake(hooks: unknown[]) {
    const requests: ApiRequest[] = [];
    const request = (req: ApiRequest) => {
      requests.push(req);
      return Promise.resolve(
        req.method === "GET" ? { data: hooks } : undefined
      );
    };
    return { request, requests };
  }

  it("keeps this node's subscription when the events match", async () => {
    const { request, requests } = fake([
      {
        id: "h1",
        target_url: HOOK_URL,
        events: ["code.updated", "code.created"],
      },
      { id: "h9", target_url: "https://other.example.com/x", events: [] },
    ]);
    const exists = await reconcileHooks(
      request,
      HOOK_URL,
      ["code.created", "code.updated"],
      { hookId: "h1", secret: "whsec_1" }
    );
    expect(exists).toBe(true);
    expect(requests).toEqual([{ method: "GET", path: "/hooks" }]);
  });

  it("removes subscriptions to this URL it can't use", async () => {
    const { request, requests } = fake([
      { id: "h1", target_url: HOOK_URL, events: ["scan.created"] },
      { id: "h2", target_url: HOOK_URL, events: ["code.created"] },
    ]);
    // Events changed, and h2 is a leftover whose secret is gone.
    const exists = await reconcileHooks(request, HOOK_URL, ["code.created"], {
      hookId: "h1",
      secret: "whsec_1",
    });
    expect(exists).toBe(false);
    expect(requests.slice(1)).toEqual([
      { method: "DELETE", path: "/hooks/h1", allowNotFound: true },
      { method: "DELETE", path: "/hooks/h2", allowNotFound: true },
    ]);
  });

  it("doesn't trust a subscription without a stored secret", async () => {
    const { request } = fake([
      { id: "h1", target_url: HOOK_URL, events: ["code.created"] },
    ]);
    expect(
      await reconcileHooks(request, HOOK_URL, ["code.created"], {
        hookId: "h1",
      })
    ).toBe(false);
  });

  it("compares events as sets", () => {
    expect(sameEvents(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameEvents(["a"], ["a", "b"])).toBe(false);
    expect(sameEvents(undefined, [])).toBe(false);
  });
});
