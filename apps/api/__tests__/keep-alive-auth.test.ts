// Cron keep-alive endpoint: Vercel Cron sends "Authorization: Bearer
// <CRON_SECRET>". Anything else is 401 (and never touches the database);
// without a configured secret the route fails closed in production.
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: { CRON_SECRET: "s3cret-value" as string | undefined },
  inserted: [] as unknown[],
  returning: vi.fn(async (): Promise<{ id: string }[]> => [{ id: "page-id" }]),
  where: vi.fn(async () => undefined),
}));

vi.mock("@repo/database", () => ({
  database: {
    insert: vi.fn(() => ({
      values: (row: unknown) => {
        state.inserted.push(row);
        return { returning: state.returning };
      },
    })),
    delete: vi.fn(() => ({ where: state.where })),
  },
  eq: vi.fn(),
  page: { id: "id" },
}));

vi.mock("@/env", () => ({ env: state.env }));

const { GET } = await import("../app/cron/keep-alive/route");
const { database } = await import("@repo/database");

const request = (authorization?: string) =>
  new Request("http://localhost/cron/keep-alive", {
    headers: authorization === undefined ? {} : { authorization },
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.inserted.length = 0;
  state.env.CRON_SECRET = "s3cret-value";
  state.returning.mockResolvedValue([{ id: "page-id" }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test.each([
  ["no header", undefined],
  ["an empty header", ""],
  ["the bare secret without Bearer", "s3cret-value"],
  ["a longer token", "Bearer s3cret-value-and-more"],
  ["a shorter token", "Bearer s3cret"],
  ["a different scheme", "Basic s3cret-value"],
])("rejects %s with 401 and no database write", async (_name, header) => {
  const response = await GET(request(header));
  expect(response.status).toBe(401);
  expect(await response.text()).toBe("Unauthorized");
  expect(database.insert).not.toHaveBeenCalled();
});

test("fails closed in production when CRON_SECRET is not configured", async () => {
  state.env.CRON_SECRET = undefined;
  vi.stubEnv("NODE_ENV", "production");
  const response = await GET(request("Bearer anything"));
  expect(response.status).toBe(401);
  expect(database.insert).not.toHaveBeenCalled();
});

test("allows local runs without a secret outside production", async () => {
  state.env.CRON_SECRET = undefined;
  vi.stubEnv("NODE_ENV", "development");
  const response = await GET(request());
  expect(response.status).toBe(200);
});

test("inserts a temporary page and deletes exactly that row", async () => {
  const response = await GET(request("Bearer s3cret-value"));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("OK");
  expect(state.inserted).toHaveLength(1);
  expect(state.inserted[0]).toMatchObject({ name: "cron-temp" });
  expect((state.inserted[0] as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/);
  expect(database.delete).toHaveBeenCalledOnce();
});

test("skips the delete when the insert returns no row", async () => {
  state.returning.mockResolvedValueOnce([]);
  const response = await GET(request("Bearer s3cret-value"));
  expect(response.status).toBe(200);
  expect(database.delete).not.toHaveBeenCalled();
});

test("surfaces a database failure instead of reporting OK", async () => {
  state.returning.mockRejectedValueOnce(new Error("connection refused"));
  await expect(GET(request("Bearer s3cret-value"))).rejects.toThrow(
    "connection refused"
  );
});
