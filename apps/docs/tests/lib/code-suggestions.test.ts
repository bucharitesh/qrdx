// "Suggest" in the code builder (lib/code-suggestions): the short prompt, the
// clean-up of the model's two-line reply, the plan and AI gates, the slug
// rules and uniqueness check every suggestion passes, and the SSRF rules of
// the page-title fetch. The model is a fake Vercel AI Gateway behind fetch
// (tests/support/fake-gateway.ts) and the tables are in memory: no real AI
// call, database or network.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";
import { installFakeGateway } from "../support/fake-gateway";

const state = vi.hoisted(() => {
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  return { plan: "pro" as "free" | "pro" | "business" };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, reset: Date.now() + 60_000 }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));

const {
  cleanTag,
  describeDestination,
  extractPageTitle,
  parseSuggestReply,
  pickTags,
  suggestPrompt,
  SUGGEST_INSTRUCTIONS,
  toSlugCandidate,
} = await import("@/lib/code-suggestions/prompt");
const { suggestCodeDetails } = await import("@/lib/code-suggestions/suggest");
const { fetchPageTitle } = await import("@/lib/code-suggestions/page-title");
const { baseUrl } = await import("@/lib/metadata");

const gateway = installFakeGateway();
const scope = {
  userId: "u_alice",
  organizationId: "org_acme",
  role: "owner" as const,
};

const USAGE = {
  inputTokens: { total: 74, noCache: 74, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 31, text: 31, reasoning: 0 },
};

/** A non-streaming model reply as the gateway sends it. */
const reply = (text: string) =>
  Response.json({
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "end_turn" },
    usage: USAGE,
    warnings: [],
  });

beforeEach(() => {
  fakeDb.resetAll();
  gateway.reset();
  state.plan = "pro";
});

describe("the prompt", () => {
  it("sends the host and path only: never the query string or hash", () => {
    const url = new URL(
      "https://www.Cafe-Rosa.com/menu/spring/?utm_source=x&email=a@b.c#top",
    );
    expect(describeDestination(url)).toBe("cafe-rosa.com/menu/spring");
    const prompt = suggestPrompt({
      url,
      title: "  Spring   Menu | Café Rosa ",
      existingTags: ["Food", "Events"],
    });
    expect(prompt).toBe(
      "url: cafe-rosa.com/menu/spring\ntitle: Spring Menu | Café Rosa\nexisting tags: Food, Events",
    );
    expect(prompt).not.toMatch(/utm_source|email|@/);
  });

  it("stays small: short instructions, capped title and tag list", () => {
    expect(SUGGEST_INSTRUCTIONS.length).toBeLessThan(400);
    const prompt = suggestPrompt({
      url: new URL(`https://example.com/${"a".repeat(300)}`),
      title: "t".repeat(500),
      existingTags: Array.from({ length: 80 }, (_, i) => `tag-${i}`),
    });
    expect(prompt.length).toBeLessThan(500);
  });
});

describe("reading the reply", () => {
  it("turns the two lines into clean back-halves and tags", () => {
    expect(
      parseSuggestReply(
        "Here you go:\ns: Spring Menu | cafe-rosa-spring | /menu_2026 | ab | spring menu\nt: #Food | events. | food",
      ),
    ).toEqual({
      slugs: ["spring-menu", "cafe-rosa-spring", "menu-2026"],
      tags: ["Food", "events"],
    });
  });

  it("makes back-halves URL-safe and short", () => {
    expect(toSlugCandidate("Crème Brûlée Night!")).toBe("creme-brulee-night");
    expect(toSlugCandidate("x")).toBeNull();
    const long = toSlugCandidate(
      "the-very-long-spring-menu-for-the-cafe-on-main-street",
    );
    expect(long?.length).toBeLessThanOrEqual(32);
    expect(long).not.toMatch(/-$/);
    expect(cleanTag('  - "Spring  specials" ')).toBe("Spring specials");
  });

  it("reuses an existing tag's spelling and skips tags the code has", () => {
    expect(
      pickTags(
        ["food", "Spring", "events", "extra"],
        ["Food", "Events"],
        ["events"],
      ),
    ).toEqual(["Food", "Spring", "extra"]);
  });

  it("finds og:title, else <title>, with entities decoded", () => {
    expect(
      extractPageTitle(
        '<html><head><title>Ignored</title><meta property="og:title" content="Spring &amp; Summer Menu"></head>',
      ),
    ).toBe("Spring & Summer Menu");
    expect(
      extractPageTitle("<title>\n  Caf&eacute; &#8211; Home \n</title>"),
    ).toBe("Caf&eacute; – Home");
    expect(extractPageTitle("<p>no title</p>")).toBeNull();
  });
});

describe("suggestCodeDetails", () => {
  it("asks the small text model through the gateway and returns 3 free back-halves", async () => {
    // spring-menu is taken in the shared namespace; "api" is reserved.
    fakeDb.seed("qrCode", [
      { id: "c_taken", slug: "spring-menu", slugScope: "", domainId: null },
    ]);
    gateway.respondWith(() =>
      reply(
        "s: spring-menu|api|cafe-spring|rosa-menu|spring-26|menu-rosa\nt: food|Events|spring",
      ),
    );

    const result = await suggestCodeDetails(
      scope,
      {
        destination: "https://cafe-rosa.com/menu/spring?utm_source=x",
        existingTags: ["Events"],
      },
      { fetchTitle: async () => "Spring Menu" },
    );

    expect(result).toEqual({
      slugs: ["cafe-spring", "rosa-menu", "spring-26"],
      tags: ["food", "Events", "spring"],
    });
    expect(gateway.calls).toHaveLength(1);
    const call = gateway.calls[0];
    expect(call?.headers["ai-language-model-id"]).toBe(
      "anthropic/claude-haiku-5.5",
    );
    expect(call?.body.maxOutputTokens).toBe(80);
    // Thinking would use the whole budget and leave no reply.
    expect(call?.body.reasoning).toBe("none");
    expect(call?.body.providerOptions).toEqual({
      gateway: { disallowPromptTraining: true, only: ["anthropic"] },
    });
    const sent = JSON.stringify(call?.body.prompt);
    expect(sent).toContain("cafe-rosa.com/menu/spring");
    expect(sent).toContain("Spring Menu");
    expect(sent).not.toContain("utm_source");
  });

  it("checks uniqueness on the code's own domain, and lets a code keep its own back-half", async () => {
    fakeDb.seed("customDomain", [
      {
        id: "dom_1",
        hostname: "go.rosa.com",
        verified: true,
        userId: "u_alice",
        organizationId: "org_acme",
      },
    ]);
    fakeDb.seed("qrCode", [
      { id: "c_other", slug: "menu", slugScope: "dom_1", domainId: "dom_1" },
      { id: "c_self", slug: "spring", slugScope: "dom_1", domainId: "dom_1" },
    ]);
    gateway.respondWith(() => reply("s: menu|spring|p|q|rosa\nt: food"));
    const result = await suggestCodeDetails(
      scope,
      {
        destination: "https://rosa.com/menu",
        domainId: "dom_1",
        codeId: "c_self",
      },
      { fetchTitle: async () => null },
    );
    // "menu" is taken on the domain, "p" and "q" too short or reserved.
    expect(result.slugs).toEqual(["spring", "rosa"]);
  });

  it("needs a plan with custom back-halves, and never calls the model without one", async () => {
    state.plan = "free";
    await expect(
      suggestCodeDetails(scope, { destination: "https://example.com" }),
    ).rejects.toMatchObject({ status: 402, code: "PLAN_REQUIRED" });
    expect(gateway.calls).toHaveLength(0);
  });

  it("refuses a destination that isn't a web link before any call", async () => {
    await expect(
      suggestCodeDetails(scope, { destination: "javascript:alert(1)" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(gateway.calls).toHaveLength(0);
  });

  it("skips the title fetch for QRdx's own links", async () => {
    const fetchTitle = vi.fn(async () => "x");
    gateway.respondWith(() => reply("s: abc\nt: x"));
    await suggestCodeDetails(
      scope,
      { destination: `${baseUrl.origin}/pricing` },
      { fetchTitle },
    );
    expect(fetchTitle).not.toHaveBeenCalled();
  });
});

describe("fetchPageTitle (SSRF rules from the /scan link checker)", () => {
  const html = (title: string) => ({
    status: 200,
    location: null,
    body: `<title>${title}</title>`,
  });

  it("reads the title of a public page", async () => {
    const get = vi.fn(async () => html("Spring Menu"));
    expect(
      await fetchPageTitle(new URL("https://example.com/menu"), { get }),
    ).toBe("Spring Menu");
  });

  it("never requests private, local or odd-port addresses", async () => {
    const get = vi.fn(async () => html("secret"));
    for (const url of [
      "http://127.0.0.1/",
      "http://10.0.0.5/admin",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://localhost/",
      "http://printer.local/",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
    ]) {
      expect(await fetchPageTitle(new URL(url), { get })).toBeNull();
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("stops at a redirect to a private address and after a few redirects", async () => {
    const toPrivate = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        location: "http://192.168.1.1/",
        body: null,
      })
      .mockResolvedValue(html("router"));
    expect(
      await fetchPageTitle(new URL("https://example.com/"), { get: toPrivate }),
    ).toBeNull();
    expect(toPrivate).toHaveBeenCalledTimes(1);

    const loop = vi.fn(async (url: URL) => ({
      status: 301,
      location: `${url.origin}/next${Math.random()}`,
      body: null,
    }));
    expect(
      await fetchPageTitle(new URL("https://example.com/"), { get: loop }),
    ).toBeNull();
    expect(loop.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("gives up quietly on network errors", async () => {
    const get = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    expect(
      await fetchPageTitle(new URL("https://example.com/"), { get }),
    ).toBeNull();
  });
});
