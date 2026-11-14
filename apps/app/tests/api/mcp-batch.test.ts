// The MCP server's per-IP limit (app/api/mcp/route.ts) counts JSON-RPC
// messages, not HTTP requests: each message of a batch uses one of the
// minute's requests, and a batch longer than MCP_MAX_BATCH_MESSAGES is
// refused before any of it runs. A normal client (initialize, the
// initialized notification, tools/list, a tool call) still uses one per
// request. The limiter is the package's own in-memory window, keyed by IP.
import { MCP_MAX_BATCH_MESSAGES, MCP_REQUESTS_PER_MINUTE } from "@repo/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  charges: [] as { key: string; rate: number }[],
  renders: 0,
}));

vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await vi.importActual<
    typeof import("@repo/rate-limit/fallback")
  >("@repo/rate-limit/fallback");
  return {
    slidingWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
    }),
    fixedWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
      sliding: false,
    }),
    createRateLimiter: ({
      limiter,
    }: {
      limiter: { tokens: number; windowMs: number };
    }) => {
      const memory = createMemoryLimiter(limiter);
      return {
        limit: async (key: string, rate?: number) => {
          state.charges.push({ key, rate: rate ?? 1 });
          return memory.limit(key, rate);
        },
      };
    },
  };
});
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/qr-render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/qr-render")>();
  return {
    ...actual,
    renderQrPng: (...args: Parameters<typeof actual.renderQrPng>) => {
      state.renders += 1;
      return actual.renderQrPng(...args);
    },
  };
});

const route = await import("@/app/api/mcp/route");

const PROTOCOL = "2025-06-18";
let ipCounter = 0;
let rpcId = 0;

beforeEach(() => {
  state.charges = [];
  state.renders = 0;
});

/** A fresh client address, so each test starts with a full minute. */
const freshIp = () => `203.0.113.${++ipCounter}`;

function post(ip: string, body: unknown) {
  return route.POST(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL,
        "x-real-ip": ip,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Every JSON-RPC message in a response (JSON, or SSE `data:` lines). */
async function messagesOf(response: Response): Promise<any[]> {
  const text = await response.text();
  if (!text) return [];
  if (!response.headers.get("content-type")?.includes("event-stream")) {
    const json = JSON.parse(text);
    return Array.isArray(json) ? json : [json];
  }
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:") && line.slice(5).trim())
    .map((line) => JSON.parse(line.slice(5)));
}

const request = (method: string, params: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id: ++rpcId,
  method,
  params,
});
const toolCall = (name: string, args: Record<string, unknown>) =>
  request("tools/call", { name, arguments: args });
const qrCall = (i: number) =>
  toolCall("generate_qr_code", { data: `batch ${i}` });
const smsCall = () => toolCall("qr_payload_sms", { phone: "+15551234567" });

describe("the MCP server's rate limit", () => {
  it("charges a batch one request per message", async () => {
    const ip = freshIp();
    const response = await post(ip, [qrCall(1), qrCall(2), qrCall(3)]);
    expect(response.status).toBe(200);
    const results = (await messagesOf(response)).filter((m) => m.result);
    expect(results).toHaveLength(3);
    expect(state.renders).toBe(3);
    expect(state.charges).toEqual([{ key: `mcp:ip:${ip}`, rate: 3 }]);
  });

  it("stops at the minute's requests whether they come one by one or in batches", async () => {
    const ip = freshIp();
    const perBatch = MCP_MAX_BATCH_MESSAGES;
    const batches = Math.floor(MCP_REQUESTS_PER_MINUTE / perBatch);
    for (let i = 0; i < batches; i++) {
      const response = await post(
        ip,
        Array.from({ length: perBatch }, smsCall),
      );
      expect(response.status, `batch ${i + 1}`).toBe(200);
      await response.text();
    }
    const left = MCP_REQUESTS_PER_MINUTE - batches * perBatch;
    for (let i = 0; i < left; i++) {
      expect((await post(ip, smsCall())).status).toBe(200);
    }
    const over = await post(ip, smsCall());
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(over.headers.get("access-control-allow-origin")).toBe("*");
    // Another address has its own minute.
    expect((await post(freshIp(), smsCall())).status).toBe(200);
  });

  it("refuses a batch longer than the cap without running any of it", async () => {
    const ip = freshIp();
    const response = await post(
      ip,
      Array.from({ length: MCP_MAX_BATCH_MESSAGES + 1 }, (_, i) => qrCall(i)),
    );
    expect(response.status).toBe(400);
    const [message] = await messagesOf(response);
    expect(message.error.code).toBe(-32_600);
    expect(message.error.message).toContain(String(MCP_MAX_BATCH_MESSAGES));
    expect(state.renders).toBe(0);
  });

  it("refuses a batch over what is left of the minute's budget, without rendering", async () => {
    const ip = freshIp();
    const budget = MCP_REQUESTS_PER_MINUTE - MCP_MAX_BATCH_MESSAGES + 1;
    for (let i = 0; i < budget; i++) {
      await (await post(ip, smsCall())).text();
    }
    const response = await post(
      ip,
      Array.from({ length: MCP_MAX_BATCH_MESSAGES }, (_, i) => qrCall(i)),
    );
    expect(response.status).toBe(429);
    expect(state.renders).toBe(0);
  });

  it("uses one request per call for a normal client", async () => {
    const ip = freshIp();
    const init = await post(
      ip,
      request("initialize", {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      }),
    );
    expect(init.status).toBe(200);
    const [initialized] = await messagesOf(init);
    expect(initialized.result.serverInfo).toMatchObject({ name: "qrdx" });

    const notified = await post(ip, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(notified.status).toBe(202);

    const list = await post(ip, request("tools/list"));
    const [listed] = await messagesOf(list);
    expect(
      listed.result.tools.map((tool: { name: string }) => tool.name),
    ).toContain("generate_qr_code");

    const call = await post(ip, qrCall(0));
    const [called] = await messagesOf(call);
    expect(called.result.isError).toBeFalsy();
    expect(state.renders).toBe(1);

    expect(state.charges).toEqual(
      Array.from({ length: 4 }, () => ({ key: `mcp:ip:${ip}`, rate: 1 })),
    );
  });
});
