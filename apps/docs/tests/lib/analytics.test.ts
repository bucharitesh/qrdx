// The analytics layer (lib/analytics): PostHog waits for consent, every
// property is stripped of PII, Umami stays off unless configured. posthog-js
// is a fake and the browser is a stub: nothing here leaves the process.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  group: vi.fn(),
  resetGroups: vi.fn(),
  reset: vi.fn(),
  setPersonProperties: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  has_opted_out_capturing: vi.fn(() => false),
  get_property: vi.fn(() => undefined),
  get_distinct_id: vi.fn(() => "anonymous-id"),
}));
vi.mock("posthog-js", () => ({ default: posthog }));

type Browser = {
  path?: string;
  doNotTrack?: boolean;
  gpc?: boolean;
  debug?: boolean;
};

function installBrowser({
  path = "/playground",
  doNotTrack = false,
  gpc = false,
  debug = true,
}: Browser = {}) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
  };
  if (debug) storage.setItem("qrdx:analytics-debug", "1");
  const url = new URL(path, "http://localhost:3000");
  const umami = { track: vi.fn() };
  const win = {
    location: {
      href: url.href,
      origin: url.origin,
      hostname: url.hostname,
      pathname: url.pathname,
      protocol: url.protocol,
    },
    localStorage: storage,
    sessionStorage: storage,
    umami,
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    cookie: "",
    referrer: "",
    title: "Playground",
  });
  vi.stubGlobal("navigator", {
    doNotTrack: doNotTrack ? "1" : null,
    globalPrivacyControl: gpc,
  });
  return { win, umami };
}

/** Fresh modules, so env and module state start clean for each case. */
async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_POSTHOG_KEY: "phc_test_key",
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: undefined,
    NEXT_PUBLIC_UMAMI_SCRIPT_URL: undefined,
    ...env,
  })) {
    vi.stubEnv(key, value as string);
  }
  const track = await import("@/lib/analytics/track");
  const ph = await import("@/lib/analytics/posthog");
  const umami = await import("@/lib/analytics/umami");
  const privacy = await import("@/lib/analytics/privacy");
  return { ...track, ...ph, ...umami, ...privacy };
}

/** Lets the dynamic import of posthog-js settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  for (const fn of Object.values(posthog)) fn.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("PostHog consent gating", () => {
  it("loads and sends nothing before a choice", async () => {
    installBrowser();
    const a = await load();
    a.track("qr_downloaded", { format: "png", source: "playground" });
    a.trackPageview();
    await settle();
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("drops what waited when the visitor declines", async () => {
    installBrowser();
    const a = await load();
    a.track("qr_copied", { format: "svg", source: "playground" });
    a.setPostHogConsent(false);
    a.track("sign_out");
    await settle();
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("starts through /ingest on consent and sends what waited, in order", async () => {
    installBrowser();
    const a = await load();
    a.track("theme_applied", { method: "shuffle" });
    a.setPostHogConsent(true);
    await settle();
    expect(posthog.init).toHaveBeenCalledTimes(1);
    const [key, config] = posthog.init.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(key).toBe("phc_test_key");
    expect(config).toMatchObject({
      api_host: "/ingest",
      person_profiles: "identified_only",
      capture_pageview: false,
      autocapture: false,
      disable_session_recording: true,
    });
    expect(posthog.capture).toHaveBeenCalledWith("theme_applied", {
      method: "shuffle",
    });
    // The choice is mirrored for server-side events.
    expect(document.cookie).toContain("qrdx_analytics=1");
  });

  it("stops capturing at once when consent is revoked", async () => {
    installBrowser();
    const a = await load();
    a.setPostHogConsent(true);
    await settle();
    a.setPostHogConsent(false);
    posthog.capture.mockClear();
    a.track("sign_out");
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(document.cookie).toContain("Max-Age=0");
  });

  it("counts the current page when consent comes after it was viewed", async () => {
    installBrowser();
    const a = await load();
    a.setPostHogConsent(false);
    a.trackPageview();
    a.setPostHogConsent(true);
    await settle();
    expect(posthog.capture).toHaveBeenCalledWith("$pageview");
  });

  it("identifies by user id, never email, and resets on sign-out", async () => {
    installBrowser();
    const a = await load();
    a.setPostHogUser(
      { id: "user_123", properties: { signup_date: "2026-11-01" } },
      "org_9",
    );
    a.setPostHogConsent(true);
    await settle();
    expect(posthog.identify).toHaveBeenCalledWith("user_123", {
      signup_date: "2026-11-01",
    });
    expect(posthog.group).toHaveBeenCalledWith("organization", "org_9");
    a.resetAnalytics();
    expect(posthog.reset).toHaveBeenCalled();
  });

  it("records nothing on admin and customer pages", async () => {
    for (const path of ["/admin/users", "/p/menu", "/scan"]) {
      const { umami } = installBrowser({ path });
      const a = await load({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "site-1" });
      a.setPostHogConsent(true);
      await settle();
      posthog.capture.mockClear();
      a.track("sign_out");
      a.trackPageview();
      expect(posthog.capture).not.toHaveBeenCalled();
      expect(umami.track).not.toHaveBeenCalled();
    }
  });

  it("sends nothing in development without the debug opt-in", async () => {
    const { umami } = installBrowser({ debug: false });
    const a = await load({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "site-1" });
    a.setPostHogConsent(true);
    await settle();
    a.track("sign_out");
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(umami.track).not.toHaveBeenCalled();
  });
});

describe("PII stripping", () => {
  it("keeps coarse values and drops personal ones", async () => {
    installBrowser();
    const { sanitizeProps } = await load();
    expect(
      sanitizeProps({
        content_type: "url",
        format: "png",
        query_length: 12,
        count: 3,
        saved: true,
        email: "ada@example.com",
        theme_name: "Ada's theme",
        destination_url: "https://example.com/private",
        url: "https://example.com",
        prompt: "make it pink",
        label: "ada@example.com",
        target: "https://evil.example/path?token=1",
        domain: "example.com",
        phone_like: "+1 (555) 010-9999",
        long: "x".repeat(65),
        nested: { a: 1 },
        list: [1, 2],
        nan: Number.NaN,
        camelCase: "dropped",
      }),
    ).toEqual({
      content_type: "url",
      format: "png",
      query_length: 12,
      count: 3,
      saved: true,
    });
  });

  it("strips PII from what track() sends to both destinations", async () => {
    const { umami } = installBrowser();
    const a = await load({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "site-1" });
    a.setPostHogConsent(true);
    await settle();
    (a.track as (event: string, props: object) => void)("qr_downloaded", {
      format: "png",
      source: "playground",
      email: "ada@example.com",
      value: "https://secret.example/path",
    });
    expect(posthog.capture).toHaveBeenCalledWith("qr_downloaded", {
      format: "png",
      source: "playground",
    });
    const payload = umami.track.mock.calls[0]?.[0]({
      website: "site-1",
      url: "http://localhost:3000/playground?value=secret",
    });
    expect(payload).toMatchObject({
      name: "qr_downloaded",
      data: { format: "png", source: "playground" },
      url: "http://localhost:3000/playground",
    });
    expect(JSON.stringify(payload)).not.toMatch(/ada@|secret/);
  });

  it("sanitizes page URLs: campaign params only, no hash, no invite ids", async () => {
    installBrowser();
    const { sanitizeUrl } = await load();
    expect(
      sanitizeUrl(
        "https://qrdx.dev/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fx&state=s#frag",
      ),
    ).toBe("https://qrdx.dev/oauth/authorize");
    expect(
      sanitizeUrl("https://qrdx.dev/pricing?utm_source=x&email=a%40b.co"),
    ).toBe("https://qrdx.dev/pricing?utm_source=x");
    expect(sanitizeUrl("https://qrdx.dev/invite/inv_secret123")).toBe(
      "https://qrdx.dev/invite/:id",
    );
    expect(sanitizeUrl("$direct")).toBe("$direct");
  });

  it("cleans PostHog's own URL properties and drops admin events", async () => {
    installBrowser({ path: "/dashboard/codes" });
    const { beforeSend } = await load();
    const event = beforeSend({
      uuid: "u",
      event: "$pageview",
      properties: {
        $current_url: "http://localhost:3000/dashboard/codes?q=ada%40x.com",
        $referrer: "https://mail.example/inbox?token=1",
        title: "Ada's codes",
      },
      $set_once: {
        $initial_current_url: "http://localhost:3000/invite/abc?x=1",
      },
    });
    expect(event?.properties).toMatchObject({
      $current_url: "http://localhost:3000/dashboard/codes",
      $referrer: "https://mail.example/inbox",
      title: "",
    });
    expect(event?.$set_once?.$initial_current_url).toBe(
      "http://localhost:3000/invite/:id",
    );

    installBrowser({ path: "/admin" });
    const admin = await load();
    expect(
      admin.beforeSend({ uuid: "u", event: "x", properties: {} }),
    ).toBeNull();
  });
});

describe("Umami", () => {
  it("is off when NEXT_PUBLIC_UMAMI_WEBSITE_ID is unset", async () => {
    const { umami } = installBrowser();
    const a = await load();
    expect(a.getUmamiConfig()).toBeNull();
    expect(a.isUmamiEnabled()).toBe(false);
    a.track("sign_out");
    a.trackPageview();
    expect(umami.track).not.toHaveBeenCalled();
  });

  it("runs without consent once configured, with the default script", async () => {
    const { umami } = installBrowser();
    const a = await load({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "site-1" });
    expect(a.getUmamiConfig()).toEqual({
      websiteId: "site-1",
      scriptUrl: "https://cloud.umami.is/script.js",
    });
    a.trackPageview();
    a.track("docs_search", { query_length: 4, result_count: 2 });
    expect(umami.track).toHaveBeenCalledTimes(2);
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("respects Do Not Track and Global Privacy Control", async () => {
    for (const signal of [{ doNotTrack: true }, { gpc: true }]) {
      const { umami } = installBrowser(signal);
      const a = await load({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "site-1" });
      expect(a.isUmamiEnabled()).toBe(false);
      a.track("sign_out");
      expect(umami.track).not.toHaveBeenCalled();
    }
  });

  it("queues until the script loads", async () => {
    const { win } = installBrowser();
    const loaded = win.umami;
    (win as { umami?: unknown }).umami = undefined;
    const a = await load({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: "site-1" });
    a.trackPageview();
    (win as { umami?: unknown }).umami = loaded;
    a.flushUmami();
    expect(loaded.track).toHaveBeenCalledTimes(1);
  });
});

describe("server events", () => {
  it("are anonymous without consent and named with it", async () => {
    vi.resetModules();
    const { buildServerEvent } = await import("@/lib/analytics/server");
    const anonymous = buildServerEvent("form_submitted", {}, "phc_key");
    expect(anonymous.distinct_id).toBe(anonymous.uuid);
    expect(anonymous.properties).toMatchObject({
      $process_person_profile: false,
      $geoip_disable: true,
    });

    const named = buildServerEvent(
      "subscription_activated",
      { plan: "pro", interval: "month" },
      "phc_key",
      { distinctId: "user_1", dedupeKey: "sub_1" },
    );
    expect(named.distinct_id).toBe("user_1");
    expect(named.properties.$process_person_profile).toBe(true);
    // Redelivered webhooks map to the same event id.
    const again = buildServerEvent(
      "subscription_activated",
      { plan: "pro" },
      "phc_key",
      { dedupeKey: "sub_1" },
    );
    expect(again.uuid).toBe(named.uuid);
    expect(named.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("sign-in detection", () => {
  it("tells a sign-up from a sign-in, and ignores old sessions", async () => {
    vi.resetModules();
    const { authEventFor, toSignInMethod } = await import(
      "@/lib/analytics/identity"
    );
    const now = Date.parse("2026-11-01T10:00:00Z");
    const session = (userAgoMs: number, sessionAgoMs: number) => ({
      userId: "user_1",
      userCreatedAt: now - userAgoMs,
      sessionCreatedAt: now - sessionAgoMs,
      organizationId: null,
    });
    expect(authEventFor(session(5_000, 4_000), now)).toBe("sign_up");
    expect(authEventFor(session(86_400_000, 4_000), now)).toBe("sign_in");
    expect(authEventFor(session(86_400_000, 10 * 60_000), now)).toBeNull();
    expect(toSignInMethod("github")).toBe("github");
    expect(toSignInMethod("email-otp")).toBe("email-otp");
    expect(toSignInMethod("passkey")).toBe("unknown");
    expect(toSignInMethod(null)).toBe("unknown");
  });
});

describe("person properties", () => {
  it("are sent once per tab, not on every page load", async () => {
    installBrowser();
    const a = await load();
    a.setPostHogUser({ id: "user_1", properties: { signup_date: "x" } }, null);
    a.setPostHogConsent(true);
    await settle();
    expect(posthog.identify).toHaveBeenCalledTimes(1);
    posthog.get_distinct_id.mockReturnValue("user_1");
    a.setPostHogPersonProperties({ plan: "pro" });
    a.setPostHogPersonProperties({ plan: "pro" });
    expect(posthog.setPersonProperties).toHaveBeenCalledTimes(1);
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({
      signup_date: "x",
      plan: "pro",
    });
    posthog.get_distinct_id.mockReturnValue("anonymous-id");
  });
});
