// A stand-in for Vercel AI Gateway behind `fetch`: the app's real gateway
// client (createGateway from "ai") builds and sends each request, the fake
// records it and answers with what the test supplies. Any other URL throws,
// so nothing leaves the process.
import { vi } from "vitest";

export interface GatewayCall {
  url: string;
  headers: Record<string, string>;
  /** The gateway's JSON request body */
  body: any;
}

type Respond = (call: GatewayCall) => Response | Promise<Response>;

const GATEWAY = "https://ai-gateway.vercel.sh/";

export function installFakeGateway() {
  const calls: GatewayCall[] = [];
  let respond: Respond | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!url.startsWith(GATEWAY)) {
        throw new Error(`Unexpected fetch in a test: ${url}`);
      }
      const call: GatewayCall = {
        url,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      if (!respond) throw new Error("No fake gateway response set");
      return respond(call);
    }),
  );
  return {
    calls,
    respondWith(fn: Respond | null) {
      respond = fn;
    },
    reset() {
      calls.length = 0;
      respond = null;
    },
  };
}

/** The user message's text and images, as the gateway received them. */
export function userParts(call: GatewayCall): {
  text: string;
  images: { mediaType: string; bytes: Uint8Array }[];
} {
  const content = call.body.prompt.find(
    (message: { role: string }) => message.role === "user",
  ).content as {
    type: string;
    text?: string;
    mediaType?: string;
    data?: { type: string; data: string };
  }[];
  return {
    text: content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
    images: content
      .filter((part) => part.type === "file")
      .map((part) => ({
        mediaType: part.mediaType ?? "",
        bytes: new Uint8Array(Buffer.from(part.data?.data ?? "", "base64")),
      })),
  };
}

/** A language model result (LanguageModelV4) with one image file. */
export function imageFileResult(
  png: Uint8Array,
  gateway: Record<string, unknown> = {
    cost: "0.0336",
    generationId: "gen_test",
  },
): Response {
  return Response.json({
    content: [
      {
        type: "file",
        mediaType: "image/png",
        data: { type: "data", data: Buffer.from(png).toString("base64") },
      },
    ],
    finishReason: { unified: "stop", raw: "STOP" },
    usage: {
      inputTokens: { total: 300, noCache: 300, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1290, text: 0, reasoning: 0 },
    },
    providerMetadata: { gateway },
    warnings: [],
  });
}

/** A language model result with text only, no image. */
export function textOnlyResult(text: string): Response {
  return Response.json({
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "STOP" },
    usage: {
      inputTokens: { total: 300, noCache: 300, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 20, text: 20, reasoning: 0 },
    },
    warnings: [],
  });
}

/** An error in the gateway's format (`{ error: { message, type } }`). */
export function gatewayError(
  status: number,
  type: string,
  message = "Gateway error",
): Response {
  return Response.json(
    { error: { message, type } },
    // Retries wait the shortest time the AI SDK allows.
    { status, headers: { "retry-after-ms": "1" } },
  );
}
