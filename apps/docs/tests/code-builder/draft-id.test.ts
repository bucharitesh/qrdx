// Builder session (draft) ids come from the browser's crypto, never
// Math.random: crypto.randomUUID where the page is a secure context, else a
// version 4 UUID built from crypto.getRandomValues (plain-http pages, such as
// a dev server opened by its LAN address, have no randomUUID).
import { afterEach, describe, expect, it, vi } from "vitest";
import { newDraftId } from "@/components/code-builder/use-code-drafts";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("newDraftId", () => {
  it("uses crypto.randomUUID when there is one", () => {
    const random = vi.spyOn(Math, "random");
    const id = newDraftId();
    expect(id).toMatch(UUID_V4);
    expect(random).not.toHaveBeenCalled();
  });

  it("builds a UUID from getRandomValues when randomUUID throws", () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new TypeError("crypto.randomUUID is not a function");
    });
    const random = vi.spyOn(Math, "random");
    const values = vi.spyOn(crypto, "getRandomValues");
    const ids = new Set(Array.from({ length: 200 }, () => newDraftId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(values).toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });
});
