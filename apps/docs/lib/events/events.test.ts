// Pure parts of lib/events (signatures, retries, URL safety, unsubscribe
// tokens, chat payloads, digest helpers, REST hooks input). No network, no
// database: the HTTP transport is replaced and fetch throws if anything tries.
//   cd apps/docs && DATABASE_URL=postgres://test@127.0.0.1:1/test RESEND_API_KEY= \
//     BETTER_AUTH_SECRET=test-secret-for-unsubscribe-tokens \
//     npx tsx --conditions=react-server --test lib/events/events.test.ts
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  canSeeHookUrls,
  maskHookUrl,
  serializeHook,
  staticSample,
  subscribeSchema,
} from "@/app/api/v1/hooks/_lib/hooks";
import { outcomeValues, retryDelayMs, sendDelivery } from "./deliveries";
import {
  DIGEST_SHARDS,
  digestShard,
  isQuietDigest,
  previousWeek,
} from "./digest";
import { codeSummary, scanSummary } from "./emit";
import { postJson, setTransportForTests } from "./http";
import { discordPayload, isAlertEvent, slackPayload } from "./notify";
import {
  generateWebhookSecret,
  maskSecret,
  signatureHeader,
  verifySignature,
} from "./signature";
import { isScanMilestone, MAX_DELIVERY_ATTEMPTS } from "./types";
import {
  createUnsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "./unsubscribe";
import {
  checkDiscordWebhookUrl,
  checkSlackWebhookUrl,
  checkWebhookUrl,
  isBlockedAddress,
  maskChatWebhookUrl,
} from "./url-safety";

const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error("Network access is not allowed in tests");
}) as typeof fetch;
after(() => {
  globalThis.fetch = realFetch;
});

describe("webhook signatures", () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ id: "evt_1", type: "code.created" });
  const now = new Date("2026-10-31T12:00:00Z");

  it("creates whsec_ secrets and masks them", () => {
    assert.match(secret, /^whsec_[A-Za-z0-9_-]{32}$/);
    assert.equal(maskSecret(secret), `${secret.slice(0, 10)}…`);
    assert.notEqual(generateWebhookSecret(), secret);
  });

  it("round-trips and rejects tampering, wrong secrets and old timestamps", () => {
    const { header, timestamp } = signatureHeader(secret, body, now);
    assert.equal(timestamp, Math.floor(now.getTime() / 1000));
    assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/);
    assert.ok(verifySignature(secret, header, body, { now }));
    assert.ok(!verifySignature(secret, header, `${body} `, { now }));
    assert.ok(!verifySignature(generateWebhookSecret(), header, body, { now }));
    const late = new Date(now.getTime() + 6 * 60 * 1000);
    assert.ok(!verifySignature(secret, header, body, { now: late }));
    assert.ok(!verifySignature(secret, "v1=abc", body, { now }));
  });
});

describe("retries", () => {
  it("backs off exponentially, capped at 24 h", () => {
    const mid = () => 0.5; // no jitter
    assert.equal(retryDelayMs(1, mid), 60_000);
    assert.equal(retryDelayMs(2, mid), 4 * 60_000);
    assert.equal(retryDelayMs(3, mid), 16 * 60_000);
    assert.equal(retryDelayMs(7, mid), 24 * 60 * 60_000);
    assert.equal(retryDelayMs(20, mid), 24 * 60 * 60_000);
    const low = retryDelayMs(1, () => 0);
    const high = retryDelayMs(1, () => 1);
    assert.ok(low >= 54_000 && high <= 66_000);
  });

  it("marks failures pending until the last attempt", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const failed = {
      ok: false as const,
      status: 500,
      error: "HTTP 500",
      durationMs: 5,
    };
    const retrying = outcomeValues(1, failed, now);
    assert.equal(retrying.status, "pending");
    assert.ok(retrying.nextAttemptAt && retrying.nextAttemptAt > now);
    assert.equal(retrying.lastError, "HTTP 500");

    const exhausted = outcomeValues(MAX_DELIVERY_ATTEMPTS, failed, now);
    assert.equal(exhausted.status, "failed");
    assert.equal(exhausted.nextAttemptAt, null);

    assert.equal(
      outcomeValues(1, failed, now, { retry: false }).status,
      "failed",
    );
    const ok = outcomeValues(3, { ok: true, status: 204, durationMs: 1 }, now);
    assert.deepEqual(ok, {
      status: "succeeded",
      lastError: null,
      nextAttemptAt: null,
    });
  });
});

describe("URL safety", () => {
  it("accepts public https URLs only", () => {
    assert.ok(checkWebhookUrl("https://hooks.example.com/qrdx?x=1").ok);
    for (const bad of [
      "http://example.com/hook",
      "https://127.0.0.1/hook",
      "https://[::1]/hook",
      "https://localhost/hook",
      "https://printer.local/hook",
      "https://intranet/hook",
      "https://user:pass@example.com/hook",
      "ftp://example.com",
      "not a url",
      "",
    ]) {
      assert.equal(checkWebhookUrl(bad).ok, false, bad);
    }
  });

  it("blocks private, loopback, link-local and mapped addresses", () => {
    for (const address of [
      "10.1.2.3",
      "127.0.0.1",
      "169.254.169.254",
      "172.20.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::a9fe:a9fe",
      // IPv4-compatible, 6to4, Teredo and local-use NAT64 forms of 127.0.0.1
      "::7f00:1",
      "2002:7f00:1::",
      "2001:0:4136:e378:8000:63bf:80ff:fffe",
      "64:ff9b:1::7f00:1",
      "garbage",
    ]) {
      assert.ok(isBlockedAddress(address), address);
    }
    for (const address of [
      "8.8.8.8",
      "1.1.1.1",
      "::ffff:8.8.8.8",
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
    ]) {
      assert.ok(!isBlockedAddress(address), address);
    }
  });

  it("validates Slack and Discord incoming webhook URLs", () => {
    assert.ok(
      checkSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/XXXX")
        .ok,
    );
    assert.ok(!checkSlackWebhookUrl("https://evil.com/services/T/B/X").ok);
    assert.ok(!checkSlackWebhookUrl("https://hooks.slack.com/other").ok);
    assert.ok(
      checkDiscordWebhookUrl("https://discord.com/api/webhooks/123/abc_DEF-1")
        .ok,
    );
    assert.ok(
      checkDiscordWebhookUrl("https://discordapp.com/api/v10/webhooks/1/x").ok,
    );
    assert.ok(!checkDiscordWebhookUrl("https://discord.com/channels/1/2").ok);
    assert.ok(
      !checkDiscordWebhookUrl("https://discord.gg.evil.com/api/webhooks/1/x")
        .ok,
    );
    assert.equal(
      maskChatWebhookUrl("https://hooks.slack.com/services/T000/B000/XXXXYYYY"),
      "hooks.slack.com/services/T000/B000/XXXX…",
    );
  });
});

describe("delivery transport", () => {
  after(() => setTransportForTests(null));

  it("signs requests and treats only 2xx as success", async () => {
    const calls: {
      url: string;
      body: string;
      headers: Record<string, string>;
    }[] = [];
    let status = 200;
    let body = "";
    setTransportForTests(async (url, payload, headers) => {
      calls.push({ url: url.toString(), body: payload, headers });
      return { status, body };
    });
    const secret = generateWebhookSecret();
    const delivery = {
      id: "dlv_1",
      event: "code.created",
      payload: { id: "evt_1", type: "code.created", data: { a: 1 } },
    };

    const ok = await sendDelivery(
      { url: "https://example.com/h", secret },
      delivery,
    );
    assert.equal(ok.ok, true);
    const [call] = calls;
    assert.ok(call);
    assert.equal(call.body, JSON.stringify(delivery.payload));
    assert.equal(call.headers["X-QRdx-Event"], "code.created");
    assert.equal(call.headers["X-QRdx-Delivery"], "dlv_1");
    assert.equal(call.headers["Content-Type"], "application/json");
    assert.ok(
      verifySignature(
        secret,
        call.headers["X-QRdx-Signature"] ?? "",
        call.body,
      ),
    );

    status = 500;
    body = "  upstream\n exploded  ";
    const failed = await sendDelivery(
      { url: "https://example.com/h", secret },
      delivery,
    );
    assert.equal(failed.ok, false);
    assert.equal(!failed.ok && failed.error, "HTTP 500: upstream exploded");

    status = 301;
    const redirected = await postJson("https://example.com/h", "{}", {});
    assert.equal(
      !redirected.ok && redirected.error,
      "HTTP 301: redirects are not followed",
    );
  });

  it("reports transport errors and refuses unsafe URLs without calling out", async () => {
    let called = false;
    setTransportForTests(async () => {
      called = true;
      throw Object.assign(new Error("blocked"), { code: "EBLOCKEDADDRESS" });
    });
    const blocked = await postJson("https://example.com/h", "{}", {});
    assert.equal(
      !blocked.ok && blocked.error,
      "Blocked: private or reserved address",
    );
    called = false;
    const insecure = await postJson("http://example.com/h", "{}", {});
    assert.equal(insecure.ok, false);
    assert.equal(called, false);
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips and rejects tampering", () => {
    const token = createUnsubscribeToken("setting_123", "digest.weekly");
    assert.deepEqual(verifyUnsubscribeToken(token), {
      settingId: "setting_123",
      event: "digest.weekly",
    });
    assert.deepEqual(
      verifyUnsubscribeToken(createUnsubscribeToken("s", "all")),
      {
        settingId: "s",
        event: "all",
      },
    );
    const [payload, signature] = token.split(".");
    const other = Buffer.from("setting_999:digest.weekly").toString(
      "base64url",
    );
    assert.equal(verifyUnsubscribeToken(`${other}.${signature}`), null);
    assert.equal(
      verifyUnsubscribeToken(`${payload}.x${signature?.slice(1)}`),
      null,
    );
    assert.equal(verifyUnsubscribeToken("nonsense"), null);
    const unknownEvent = Buffer.from("s:scan.created").toString("base64url");
    assert.equal(verifyUnsubscribeToken(`${unknownEvent}.${signature}`), null);
    assert.match(
      unsubscribeUrl("s", "all"),
      /\/api\/email\/unsubscribe\?token=/,
    );
  });
});

describe("events", () => {
  it("fires milestones once at fixed counts", () => {
    for (const count of [
      1, 10, 100, 500, 1000, 5000, 10_000, 1_000_000, 3_000_000,
    ]) {
      assert.ok(isScanMilestone(count), String(count));
    }
    for (const count of [0, 2, 11, 99, 101, 1_500_000, -1, 1.5]) {
      assert.ok(!isScanMilestone(count), String(count));
    }
  });

  it("only alerts on alertable events", () => {
    assert.ok(isAlertEvent("scan.milestone"));
    assert.ok(isAlertEvent("form.submitted"));
    assert.ok(!isAlertEvent("scan.created"));
  });

  it("builds payload summaries without visitor hashes", () => {
    const scan = scanSummary(
      {
        id: "scan_1",
        scannedAt: new Date("2026-10-31T10:00:00Z"),
        country: "IN",
        region: null,
        city: "Pune",
        deviceType: "mobile",
        os: "Android",
        browser: "Chrome",
        referer: null,
      },
      {
        id: "c1",
        userId: "u1",
        organizationId: null,
        slug: "aB3dE5f",
        title: null,
        scanCount: 1,
      },
    );
    assert.equal(scan.scan_id, "scan_1");
    assert.deepEqual(scan.code, { id: "c1", slug: "aB3dE5f", title: null });
    assert.ok(!("visitor_hash" in scan));
    const code = codeSummary({
      id: "c1",
      slug: "aB3dE5f",
      title: "Menu",
      destinationUrl: "https://example.com",
      scanCount: 3,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-02T00:00:00Z"),
    });
    assert.match(code.short_link, /\/q\/aB3dE5f$/);
    assert.equal(code.status, "active");
  });
});

describe("chat payloads", () => {
  it("escapes Slack control characters and never pings in Discord", () => {
    const alert = {
      text: "<!channel> & <@U123> said hi",
      url: "https://qrdx.dev/x",
    };
    const slack = slackPayload(alert);
    assert.ok(!slack.text.includes("<!channel>"));
    assert.ok(slack.text.includes("&lt;!channel&gt; &amp; &lt;@U123&gt;"));
    assert.ok(slack.text.endsWith("<https://qrdx.dev/x|Open in QRdx>"));
    const discord = discordPayload({
      text: "@everyone".repeat(400),
      url: alert.url,
    });
    assert.deepEqual(discord.allowed_mentions, { parse: [] });
    assert.ok(discord.content.length <= 1901);
  });
});

describe("digest helpers", () => {
  it("covers the previous Monday-to-Monday week in UTC", () => {
    const { start, end } = previousWeek(new Date("2026-11-02T09:15:00Z")); // Monday
    assert.equal(start.toISOString(), "2026-10-26T00:00:00.000Z");
    assert.equal(end.toISOString(), "2026-11-02T00:00:00.000Z");
    const sunday = previousWeek(new Date("2026-11-01T23:00:00Z"));
    assert.equal(sunday.start.toISOString(), "2026-10-19T00:00:00.000Z");
  });

  it("spreads settings over shards and skips quiet weeks", () => {
    const shards = new Set(
      Array.from({ length: 200 }, (_, i) => digestShard(`setting_${i}`)),
    );
    assert.ok(
      [...shards].every((shard) => shard >= 0 && shard < DIGEST_SHARDS),
    );
    assert.ok(shards.size > 12);
    const base = {
      periodStart: new Date(),
      periodEnd: new Date(),
      uniqueVisitors: 0,
      newCodes: 0,
      topCodes: [],
      topCountries: [],
    };
    assert.ok(
      isQuietDigest({ ...base, scans: 0, previousScans: 0, formResponses: 0 }),
    );
    assert.ok(
      !isQuietDigest({ ...base, scans: 0, previousScans: 4, formResponses: 0 }),
    );
  });
});

describe("REST hooks", () => {
  it("accepts Zapier and Make subscribe bodies", () => {
    const zapier = subscribeSchema.parse({
      hookUrl: "https://hooks.zapier.com/hooks/standard/1/abc/",
      event: "scan.created",
    });
    assert.deepEqual(zapier.events, ["scan.created"]);
    const make = subscribeSchema.parse({
      target_url: "https://hook.eu1.make.com/xyz",
      events: ["code.created", "code.updated", "code.created"],
    });
    assert.deepEqual(make.events, ["code.created", "code.updated"]);
    assert.ok(
      !subscribeSchema.safeParse({ hookUrl: "https://x.com/h" }).success,
    );
    assert.ok(
      !subscribeSchema.safeParse({
        hookUrl: "http://x.com/h",
        event: "scan.created",
      }).success,
    );
    assert.ok(
      !subscribeSchema.safeParse({ hookUrl: "https://x.com/h", event: "nope" })
        .success,
    );
  });

  it("shows hook URLs in full only to callers who manage subscriptions", () => {
    const hook = {
      id: "wh_1",
      url: "https://hooks.zapier.com/hooks/standard/123/secret/",
      events: ["scan.created"],
      active: true,
      createdAt: new Date("2026-01-05T09:30:00.000Z"),
    } as unknown as Parameters<typeof serializeHook>[0];
    assert.equal(serializeHook(hook).target_url, hook.url);
    assert.equal(
      serializeHook(hook, { revealUrl: false }).target_url,
      "https://hooks.zapier.com/…",
    );
    assert.equal(maskHookUrl("not a url"), "…");

    const owner = { role: "owner" } as const;
    assert.equal(canSeeHookUrls({ scope: owner, canWrite: true }), true);
    assert.equal(canSeeHookUrls({ scope: owner, canWrite: false }), false);
    assert.equal(
      canSeeHookUrls({ scope: { role: "admin" }, canWrite: true }),
      true,
    );
    assert.equal(
      canSeeHookUrls({ scope: { role: "member" }, canWrite: true }),
      false,
    );
  });

  it("has a sample for every event", () => {
    for (const event of [
      "scan.created",
      "scan.milestone",
      "code.created",
      "code.updated",
      "form.submitted",
    ] as const) {
      const sample = staticSample(event);
      assert.equal(sample.type, event);
      assert.ok(sample.data);
    }
  });
});
