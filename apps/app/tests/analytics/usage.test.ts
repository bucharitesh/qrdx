// Daily usage counters (lib/analytics/usage.ts, usage_daily) against the
// in-memory database: one row per day, channel, metric and key, counted up;
// keys from a fixed list, never user data; the REST API's requests and
// errors, the MCP server's tool calls and sessions; and nothing that can
// throw into a request, including the table not existing yet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // No request here: count now.
  after: () => {
    throw new Error("outside a request");
  },
}));

import {
  countMcpSessions,
  countToolCalls,
  mcpClientFamily,
} from "@/app/api/mcp/usage";
import {
  addUsage,
  apiCallerKind,
  recordUsage,
  recordUsageInTests,
  usageDay,
  withApiUsage,
} from "@/lib/analytics/usage";
import { interactionUsageKey } from "@/lib/chat-bots/discord/interactions";
import { fakeDb } from "../support/fake-db";

const DAY = new Date("2026-11-13T23:59:00Z");
const rows = () =>
  fakeDb.rows("usageDaily").map(({ day, channel, metric, key, count }) => ({
    day,
    channel,
    metric,
    key,
    count,
  }));
/** The counts, once the after-response writes have landed. */
const settled = async (expected: number) => {
  await vi.waitFor(() =>
    expect(
      fakeDb
        .rows("usageDaily")
        .reduce((sum, row) => sum + Number(row.count), 0),
    ).toBe(expected),
  );
  return rows();
};

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("usageDaily", "day", "channel", "metric", "key");
  recordUsageInTests(true);
});

afterEach(() => {
  recordUsageInTests(false);
});

describe("the counters", () => {
  it("count up one row per UTC day, channel, metric and key", async () => {
    await addUsage("mcp", "tool_call", "design_qr", DAY);
    await addUsage("mcp", "tool_call", "design_qr", DAY);
    await addUsage("mcp", "tool_call", "list_options", DAY);
    await addUsage(
      "mcp",
      "tool_call",
      "design_qr",
      new Date("2026-11-14T00:00:01Z"),
    );
    expect(rows()).toEqual([
      {
        day: "2026-11-13",
        channel: "mcp",
        metric: "tool_call",
        key: "design_qr",
        count: 2,
      },
      {
        day: "2026-11-13",
        channel: "mcp",
        metric: "tool_call",
        key: "list_options",
        count: 1,
      },
      {
        day: "2026-11-14",
        channel: "mcp",
        metric: "tool_call",
        key: "design_qr",
        count: 1,
      },
    ]);
    expect(usageDay(DAY)).toBe("2026-11-13");
  });

  it("never keep a key that could be user data", async () => {
    for (const key of [
      "ana@example.com",
      "https://example.com/menu",
      "Make a QR for my wifi",
      "x".repeat(80),
    ]) {
      await addUsage("slack", "command", key, DAY);
    }
    expect(rows()).toEqual([
      expect.objectContaining({ key: "other", count: 4 }),
    ]);
  });

  it("skip the write, warning once, until the table exists", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeDb.missing("usageDaily");
    await expect(addUsage("api", "request", "qr:anon")).resolves.toBe(
      undefined,
    );
    await addUsage("api", "request", "qr:anon");
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  it("count nothing in the test suites unless a test asks", async () => {
    recordUsageInTests(false);
    recordUsage("api", "request", "me:keyed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(rows()).toEqual([]);
    recordUsageInTests(true);
    recordUsage("api", "request", "me:keyed");
    expect(await settled(1)).toEqual([
      expect.objectContaining({ key: "me:keyed" }),
    ]);
  });
});

describe("the REST API", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("https://qrdx.dev/api/v1/qr?data=hello", { headers });

  it("tells keyed callers from anonymous ones", () => {
    expect(apiCallerKind(request({ authorization: "Bearer qrdx_abc" }))).toBe(
      "keyed",
    );
    expect(apiCallerKind(request())).toBe("anon");
    expect(apiCallerKind(request({ authorization: "Bearer " }))).toBe("anon");
  });

  it("counts each request by route group and caller, and failures by class", async () => {
    const ok = withApiUsage("qr", async () => new Response("svg"));
    const missing = withApiUsage(
      "codes",
      async () => new Response(null, { status: 404 }),
    );
    await ok(request());
    await ok(request());
    await missing(request({ authorization: "Bearer qrdx_abc" }));
    expect(await settled(4)).toEqual([
      expect.objectContaining({
        channel: "api",
        metric: "request",
        key: "qr:anon",
        count: 2,
      }),
      expect.objectContaining({ metric: "request", key: "codes:keyed" }),
      expect.objectContaining({ metric: "error", key: "codes:4xx" }),
    ]);
  });

  it("doesn't count a request refused with a 429", async () => {
    const limited = withApiUsage(
      "qr",
      async () => new Response(null, { status: 429 }),
    );
    const ok = withApiUsage("qr", async () => new Response("svg"));
    await limited(request());
    await limited(request({ authorization: "Bearer qrdx_abc" }));
    await ok(request());
    expect(await settled(1)).toEqual([
      expect.objectContaining({ metric: "request", key: "qr:anon", count: 1 }),
    ]);
  });

  it("counts a handler that throws as a server error, and still throws", async () => {
    const broken = withApiUsage("hooks", () => {
      throw new Error("boom");
    });
    await expect(broken(request())).rejects.toThrow("boom");
    expect(await settled(2)).toEqual([
      expect.objectContaining({ metric: "request", key: "hooks:anon" }),
      expect.objectContaining({ metric: "error", key: "hooks:5xx" }),
    ]);
  });

  it("hands the route's arguments through untouched", async () => {
    const handler = vi.fn(
      async (_req: Request, context: { params: Promise<{ id: string }> }) =>
        Response.json({ id: (await context.params).id }),
    );
    const counted = withApiUsage("codes", handler);
    const context = { params: Promise.resolve({ id: "code_1" }) };
    const response = await counted(request(), context);
    expect(await response.json()).toEqual({ id: "code_1" });
    expect(handler).toHaveBeenCalledWith(expect.any(Request), context);
  });
});

describe("the MCP server", () => {
  /** A stand-in McpServer that keeps what was registered. */
  function fakeServer() {
    const tools = new Map<string, (...args: unknown[]) => unknown>();
    const server = {
      registerTool: (
        name: string,
        _config: unknown,
        callback: (...args: unknown[]) => unknown,
      ) => {
        tools.set(name, callback);
      },
    };
    return { server, tools };
  }

  it("counts each tool call by tool name, and failed ones", async () => {
    const { server, tools } = fakeServer();
    const counted = countToolCalls(server as never);
    counted.registerTool("design_qr", {}, async (input: unknown) => ({
      content: [],
      echoed: input,
    }));
    counted.registerTool("save_template", {}, async () => ({
      isError: true,
      content: [],
    }));
    counted.registerTool("list_options", {}, () => {
      throw new Error("boom");
    });
    // The arguments reach the tool as they were.
    expect(
      await tools.get("design_qr")?.({ data: "https://example.com" }, {}),
    ).toEqual({ content: [], echoed: { data: "https://example.com" } });
    await tools.get("save_template")?.({}, {});
    await expect(tools.get("list_options")?.({}, {})).rejects.toThrow("boom");
    const counts = await settled(5);
    expect(counts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "tool_call", key: "design_qr" }),
        expect.objectContaining({ metric: "tool_call", key: "save_template" }),
        expect.objectContaining({ metric: "error", key: "save_template" }),
        expect.objectContaining({ metric: "tool_call", key: "list_options" }),
        expect.objectContaining({ metric: "error", key: "list_options" }),
      ]),
    );
    // The content never becomes a key.
    expect(JSON.stringify(counts)).not.toContain("example.com");
  });

  it("counts initialize requests as sessions, by the client's family only", async () => {
    expect(mcpClientFamily("claude-ai")).toBe("claude");
    expect(mcpClientFamily("Cursor")).toBe("cursor");
    expect(mcpClientFamily("Visual Studio Code")).toBe("vscode");
    expect(mcpClientFamily("ana-diaz-private-bot")).toBe("other");
    expect(mcpClientFamily(undefined)).toBe("other");
    const initialize = (name: string) => ({
      type: "REQUEST_RECEIVED",
      method: "initialize",
      parameters: { params: { clientInfo: { name, version: "1.0" } } },
    });
    countMcpSessions(initialize("claude-ai"));
    countMcpSessions(initialize("Ana's laptop agent"));
    countMcpSessions({ type: "REQUEST_RECEIVED", method: "tools/call" });
    countMcpSessions({ type: "REQUEST_COMPLETED", method: "initialize" });
    expect(await settled(2)).toEqual([
      expect.objectContaining({ metric: "session", key: "claude" }),
      expect.objectContaining({ metric: "session", key: "other" }),
    ]);
  });
});

describe("the chat bots", () => {
  it("name a Discord interaction by what it asks, never its content", () => {
    expect(
      interactionUsageKey({
        type: 2,
        data: { type: 1, name: "qr", options: [] },
      } as never),
    ).toBe("qr");
    expect(
      interactionUsageKey({
        type: 2,
        data: { type: 3, name: "Make QR code" },
      } as never),
    ).toBe("message");
    expect(
      interactionUsageKey({ type: 3, data: { custom_id: "x" } } as never),
    ).toBe("restyle");
    expect(
      interactionUsageKey({
        type: 2,
        data: { type: 1, name: "other" },
      } as never),
    ).toBe("help");
  });
});
