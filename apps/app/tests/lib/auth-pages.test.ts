// /sign-in (where to go next, the signed-out notice) and /sign-out (only the
// app's own menu signs out on arrival). Pure functions; no auth server.
import { describe, expect, it } from "vitest";
import { readSignInParams } from "@/app/(app)/(auth)/sign-in/_lib/params";
import {
  isFreshSignOutIntent,
  SIGN_OUT_INTENT_TTL_MS,
  SIGNED_OUT_PATH,
} from "@/app/(app)/(auth)/sign-out/_lib/intent";

describe("readSignInParams", () => {
  it("keeps a same-site next and defaults to the dashboard", () => {
    expect(readSignInParams({ next: "/settings/usage?x=1" }).next).toBe(
      "/settings/usage?x=1",
    );
    expect(readSignInParams({}).next).toBe("/dashboard");
    expect(readSignInParams({ next: ["/dashboard/codes", "/x"] }).next).toBe(
      "/dashboard/codes",
    );
  });

  it("refuses other sites and the sign-in page itself", () => {
    for (const next of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/sign-in",
      "/sign-in?next=/dashboard",
    ]) {
      expect(readSignInParams({ next }).next, next).toBe("/dashboard");
    }
  });

  it("shows the signed-out notice only for signedOut=1", () => {
    expect(readSignInParams({ signedOut: "1" }).signedOut).toBe(true);
    expect(readSignInParams({}).signedOut).toBe(false);
    expect(readSignInParams({ signedOut: "true" }).signedOut).toBe(false);
  });

  it("lands sign-out on the page with the notice", () => {
    const url = new URL(SIGNED_OUT_PATH, "https://qrdx.dev");
    expect(url.pathname).toBe("/sign-in");
    expect(
      readSignInParams(Object.fromEntries(url.searchParams)).signedOut,
    ).toBe(true);
  });
});

describe("isFreshSignOutIntent", () => {
  const now = 1_800_000_000_000;

  it("accepts the menu's mark for a minute", () => {
    expect(isFreshSignOutIntent(String(now), now)).toBe(true);
    expect(
      isFreshSignOutIntent(String(now - SIGN_OUT_INTENT_TTL_MS), now),
    ).toBe(true);
  });

  it("rejects a missing, stale, future or garbled mark", () => {
    expect(isFreshSignOutIntent(null, now)).toBe(false);
    expect(
      isFreshSignOutIntent(String(now - SIGN_OUT_INTENT_TTL_MS - 1), now),
    ).toBe(false);
    expect(isFreshSignOutIntent(String(now + 5_000), now)).toBe(false);
    expect(isFreshSignOutIntent("soon", now)).toBe(false);
    expect(isFreshSignOutIntent("", now)).toBe(false);
  });
});
