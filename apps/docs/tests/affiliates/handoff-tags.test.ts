// QRdx's own `ref` tags (lib/analytics/handoff-tags.ts) share the `ref`
// parameter with affiliate links. Every tag is a well-formed referral code,
// so without these rules an affiliate who chose "chrome-extension" would be
// credited for every sign-up the Chrome extension sent. They're reserved as
// codes and never read as referrals, in the browser or on the server.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REFERRAL_HEADER } from "@repo/auth/referral-keys";
import { afterEach, describe, expect, it, vi } from "vitest";
import { referralCandidatesFrom } from "@/lib/affiliates/attribution";
import {
  captureReferralFromUrl,
  forgetPendingReferral,
  pendingReferralCode,
} from "@/lib/affiliates/referral-client";
import {
  checkChosenCode,
  parseReferralCode,
  RESERVED_REFERRAL_CODES,
} from "@/lib/affiliates/rules";
import {
  BOT_REFS,
  DEVELOPER_REFS,
  isHandoffTag,
  MCP_REF,
  PLUGIN_REFS,
  QRDX_HANDOFF_TAGS,
  SITE_REFS,
} from "@/lib/analytics/handoff-tags";
import { PLAYGROUND_REF as CANVA_REF } from "../../../../plugins/canva/src/playground-link";
import { PLAYGROUND_REF as FIGMA_REF } from "../../../../plugins/figma/src/playground-link";
import { PLAYGROUND_REF as RAYCAST_REF } from "../../../../plugins/raycast/src/playground-link";

const repo = join(import.meta.dirname, "../../../..");

afterEach(() => {
  forgetPendingReferral();
  vi.unstubAllGlobals();
});

describe("QRdx's own ref tags", () => {
  it("lists every plugin's, bot's and developer tool's tag", () => {
    expect(QRDX_HANDOFF_TAGS).toEqual(
      expect.arrayContaining([
        ...PLUGIN_REFS,
        MCP_REF,
        ...BOT_REFS,
        ...DEVELOPER_REFS,
        ...SITE_REFS,
      ]),
    );
    // The plugins can't import the app: their copies must match.
    for (const ref of [CANVA_REF, FIGMA_REF, RAYCAST_REF]) {
      expect(PLUGIN_REFS).toContain(ref);
    }
    const chrome = readFileSync(
      join(repo, "plugins/chrome/src/popup.tsx"),
      "utf8",
    );
    expect(chrome).toContain("?ref=chrome-extension");
    const notFound = readFileSync(
      join(repo, "apps/docs/components/not-found-screen.tsx"),
      "utf8",
    );
    expect(notFound).toContain('"not-found"');
  });

  it("are well-formed referral codes, so each one has to be reserved", () => {
    for (const tag of QRDX_HANDOFF_TAGS) {
      expect(parseReferralCode(tag), tag).toBe(tag);
      expect(RESERVED_REFERRAL_CODES.has(tag), tag).toBe(true);
      expect(checkChosenCode(tag), tag).toEqual({
        ok: false,
        problem: "reserved",
      });
      expect(isHandoffTag(tag)).toBe(true);
    }
    expect(isHandoffTag("ana-diaz-4k2p")).toBe(false);
  });

  it("are never referral candidates at sign-up", () => {
    for (const tag of QRDX_HANDOFF_TAGS) {
      expect(
        referralCandidatesFrom({
          headers: new Headers({ [REFERRAL_HEADER]: tag }),
          oauthReferralCode: tag.toUpperCase(),
        }),
        tag,
      ).toEqual([]);
    }
    // A real code still counts next to a tag.
    expect(
      referralCandidatesFrom({
        headers: new Headers({ [REFERRAL_HEADER]: "chrome-extension" }),
        oauthReferralCode: "ana-diaz-4k2p",
      }),
    ).toEqual([{ code: "ana-diaz-4k2p", via: "link" }]);
  });

  it("aren't kept in the browser as a referral either", () => {
    const location = { search: "?ref=chrome-extension", protocol: "https:" };
    vi.stubGlobal("window", { location });
    expect(captureReferralFromUrl()).toBeNull();
    expect(pendingReferralCode()).toBeNull();
    // An affiliate link later in the same visit still counts.
    location.search = "?ref=ana-diaz-4k2p";
    expect(captureReferralFromUrl()).toBe("ana-diaz-4k2p");
  });
});
