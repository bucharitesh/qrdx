// REST API errors that say what to do: unknown /v1 paths get a JSON 404 in
// the API's error shape (not the site's HTML 404 page), and unexpected
// failures a JSON 500 (lib/error-response, lib/api-errors).
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const route = await import("@/app/api/v1/[[...missing]]/route");
const { handleError } = await import("@/lib/error-response");

const ORIGIN = "http://localhost:3000";
const ENDPOINTS = "http://localhost:3000/docs/developers/rest-api#endpoints";

const call = (method: keyof typeof route, missing?: string[]) =>
  route[method](
    new NextRequest(new URL(`/api/v1/${(missing ?? []).join("/")}`, ORIGIN), {
      method,
    }),
    { params: Promise.resolve({ missing }) },
  );

describe("unknown /v1 endpoints", () => {
  it("return a JSON 404 that points to the endpoint list", async () => {
    const response = await call("GET", ["nope"]);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({
      code: "NOT_FOUND",
      message: `No such endpoint: GET /v1/nope. See ${ENDPOINTS} for the endpoints.`,
      status: 404,
      docs: ENDPOINTS,
    });
  });

  it("name the method and the full path, including /v1 itself", async () => {
    const nested = await (await call("POST", ["codes", "abc", "x"])).json();
    expect(nested.message).toMatch(
      /^No such endpoint: POST \/v1\/codes\/abc\/x\./,
    );
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      expect((await call(method, ["codez"])).status).toBe(404);
    }
    const root = await call("GET");
    expect(root.status).toBe(404);
    expect((await root.json()).message).toMatch(
      /^No such endpoint: GET \/v1\./,
    );
  });
});

describe("handleError", () => {
  it("answers unexpected failures with a JSON 500, without the details", async () => {
    const response = handleError(new Error("db password is hunter2"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our side. Try again in a moment.",
      status: 500,
    });
  });
});
