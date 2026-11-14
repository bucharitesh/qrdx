// "Dynamic" picked while signed out resumes after sign-in, but only for the
// same destination and soon after the pick, so an abandoned sign-in never
// creates a dynamic code later.
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAKE_DYNAMIC_MAX_AGE_MS,
  makeDynamicIntent,
  shouldResumeDynamic,
} from "@/components/editor/dynamic-resume";
import { useAuthStore } from "@/store/auth-store";

const DESTINATION = "https://example.org/spring-menu";
const NOW = 1_800_000_000_000;

describe("shouldResumeDynamic", () => {
  it("resumes a fresh pick for the same destination", () => {
    const intent = makeDynamicIntent(DESTINATION, NOW);
    expect(shouldResumeDynamic(intent, DESTINATION, NOW + 90_000)).toBe(true);
  });

  it("drops a pick once the destination changed or is gone", () => {
    const intent = makeDynamicIntent(DESTINATION, NOW);
    expect(shouldResumeDynamic(intent, "https://example.org/other", NOW)).toBe(
      false,
    );
    expect(shouldResumeDynamic(intent, null, NOW)).toBe(false);
  });

  it("drops a stale pick", () => {
    const intent = makeDynamicIntent(DESTINATION, NOW);
    expect(
      shouldResumeDynamic(intent, DESTINATION, NOW + MAKE_DYNAMIC_MAX_AGE_MS),
    ).toBe(true);
    expect(
      shouldResumeDynamic(
        intent,
        DESTINATION,
        NOW + MAKE_DYNAMIC_MAX_AGE_MS + 1,
      ),
    ).toBe(false);
  });

  it("ignores anything that isn't a well-formed pick", () => {
    for (const bad of [
      null,
      undefined,
      "https://example.org",
      {},
      { destination: DESTINATION },
      { destination: DESTINATION, at: "yesterday" },
      { destination: 42, at: NOW },
      { destination: DESTINATION, at: Number.NaN },
      { destination: DESTINATION, at: NOW + 60_000 },
    ]) {
      expect(shouldResumeDynamic(bad, DESTINATION, NOW)).toBe(false);
    }
  });
});

describe("the stored post-login action", () => {
  beforeEach(() => {
    useAuthStore.setState({ isOpen: false, postLoginAction: null });
  });

  it("keeps the pick while sign-in runs, then clears it", () => {
    const intent = makeDynamicIntent(DESTINATION, NOW);
    useAuthStore.getState().openAuthDialog("signin", "MAKE_DYNAMIC", intent);
    expect(useAuthStore.getState()).toMatchObject({
      isOpen: true,
      postLoginAction: { type: "MAKE_DYNAMIC", data: intent },
    });
    useAuthStore.getState().clearPostLoginAction();
    expect(useAuthStore.getState().postLoginAction).toBeNull();
  });
});
