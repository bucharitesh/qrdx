import { vi } from "vitest";

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

type Responder = Response | Error | ((call: RecordedCall) => Response);

/** Replaces global fetch with a queue of canned responses; records each call. */
export function mockFetch(...responders: Responder[]) {
  const calls: RecordedCall[] = [];
  const queue = [...responders];
  const fn = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const call: RecordedCall = {
      url: String(input),
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const next = queue.shift();
    if (!next) {
      return Promise.reject(new Error(`Unexpected fetch: ${call.url}`));
    }
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(typeof next === "function" ? next(call) : next);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export const networkError = () => new TypeError("fetch failed");

export function bodyOf(call: RecordedCall | undefined): unknown {
  return call?.body ? JSON.parse(call.body) : undefined;
}
