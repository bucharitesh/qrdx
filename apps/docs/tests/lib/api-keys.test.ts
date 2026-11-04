// API key primitives (lib/api-keys): the format, generation without bias,
// SHA-256 hashing with constant-time comparison, the access presets, the
// input rules, who sees and revokes keys, and the first request shown with a
// new key. Pure: nothing here touches a database.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// lib/oauth (for its token generator) imports the database client.
vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import {
  canRevokeKey,
  canSeeAllKeys,
  roleFromMembership,
} from "@/lib/api-keys/access";
import {
  generateApiKey,
  hashApiKey,
  randomBase62,
  sameHash,
} from "@/lib/api-keys/crypto";
import {
  API_KEY_EXPIRY_DAYS,
  API_KEY_PREFIX,
  API_KEY_PRESETS,
  API_KEY_RANDOM_LENGTH,
  accessLabel,
  accessOf,
  apiBaseFor,
  apiKeyInputSchema,
  expiryDate,
  firstRequest,
  isApiKeyFormat,
  MAX_API_KEYS,
  maskedKey,
} from "@/lib/api-keys/shared";
import { generateSecureToken } from "@/lib/oauth";
import {
  generateClientId,
  generateClientSecret,
} from "@/lib/oauth-apps/secrets";

describe("API key format", () => {
  it("is qrdx_ plus 40 base62 characters, with a 6-character visible start", () => {
    const { key, start } = generateApiKey();
    expect(key).toMatch(/^qrdx_[0-9A-Za-z]{40}$/);
    expect(isApiKeyFormat(key)).toBe(true);
    expect(start).toBe(key.slice(0, 11));
    expect(maskedKey(start)).toBe(`${start}…`);
  });

  it("never repeats", () => {
    const keys = new Set(
      Array.from({ length: 2000 }, () => generateApiKey().key),
    );
    expect(keys.size).toBe(2000);
  });

  it("can't be mistaken for OAuth tokens, client IDs or client secrets", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(isApiKeyFormat(generateSecureToken())).toBe(false);
    }
    expect(isApiKeyFormat(generateClientId())).toBe(false);
    expect(isApiKeyFormat(generateClientSecret())).toBe(false);
  });

  it("rejects truncated, padded and non-base62 keys", () => {
    const { key } = generateApiKey();
    expect(isApiKeyFormat(key.slice(0, -1))).toBe(false);
    expect(isApiKeyFormat(`${key}a`)).toBe(false);
    expect(isApiKeyFormat(` ${key}`)).toBe(false);
    expect(isApiKeyFormat(`qrdx_${"-".repeat(40)}`)).toBe(false);
    expect(isApiKeyFormat(`QRDX_${key.slice(5)}`)).toBe(false);
  });
});

describe("randomBase62", () => {
  it("skips bytes at or above 248, so no character is favoured", () => {
    // 247 → 'z'... the last usable byte; 248..255 must be skipped.
    const bytes = [248, 255, 250, 0, 61, 62, 247];
    let offset = 0;
    const random = (size: number) => {
      const out = new Uint8Array(size);
      for (let i = 0; i < size; i += 1) out[i] = bytes[offset++ % bytes.length];
      return out;
    };
    expect(randomBase62(4, random)).toBe("0z0z");
  });

  it("spreads characters evenly over many draws", () => {
    const counts = new Map<string, number>();
    const sample = randomBase62(62_000);
    for (const char of sample) counts.set(char, (counts.get(char) ?? 0) + 1);
    expect(counts.size).toBe(62);
    for (const total of counts.values()) {
      // Expected 1,000 each; 6 standard deviations is about ±190.
      expect(total).toBeGreaterThan(800);
      expect(total).toBeLessThan(1200);
    }
  });
});

describe("hashing", () => {
  it("stores SHA-256 hex of the whole key, never the key", () => {
    const { key, hash } = generateApiKey();
    expect(hash).toBe(createHash("sha256").update(key).digest("hex"));
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key.slice(5));
  });

  it("compares hashes in constant time and refuses mismatches", () => {
    const a = hashApiKey(generateApiKey().key);
    const b = hashApiKey(generateApiKey().key);
    expect(sameHash(a, a)).toBe(true);
    expect(sameHash(a, b)).toBe(false);
    expect(sameHash(a, a.slice(0, -2))).toBe(false);
    expect(sameHash("", "")).toBe(false);
    expect(sameHash(a, "not hex")).toBe(false);
  });
});

describe("access presets", () => {
  it("full access is every scope; read only is the :read scopes", () => {
    expect(API_KEY_PRESETS.full).toEqual([
      "themes:read",
      "profile:read",
      "codes:read",
      "codes:write",
    ]);
    expect(API_KEY_PRESETS.read).toEqual([
      "themes:read",
      "profile:read",
      "codes:read",
    ]);
  });

  it("labels keys by preset, whatever the order of their scopes", () => {
    expect(
      accessOf(["codes:write", "codes:read", "profile:read", "themes:read"]),
    ).toBe("full");
    expect(accessLabel(["codes:read", "themes:read", "profile:read"])).toBe(
      "Read only",
    );
    expect(accessLabel(["codes:write"])).toBe("Manage codes");
    expect(accessLabel(["codes:read", "profile:read"])).toBe(
      "Profile, Read codes",
    );
  });
});

describe("apiKeyInputSchema", () => {
  it("trims the name and normalises scopes", () => {
    expect(
      apiKeyInputSchema.parse({
        name: "  CI deploys ",
        scopes: ["codes:write", "codes:read", "codes:write"],
        expiresInDays: 90,
      }),
    ).toEqual({
      name: "CI deploys",
      scopes: ["codes:read", "codes:write"],
      expiresInDays: 90,
    });
  });

  it("refuses unknown scopes, no scopes, empty names and other expiries", () => {
    const base = { name: "Key", scopes: ["codes:read"], expiresInDays: null };
    expect(apiKeyInputSchema.safeParse(base).success).toBe(true);
    expect(
      apiKeyInputSchema.safeParse({ ...base, scopes: ["admin"] }).success,
    ).toBe(false);
    expect(apiKeyInputSchema.safeParse({ ...base, scopes: [] }).success).toBe(
      false,
    );
    expect(apiKeyInputSchema.safeParse({ ...base, name: "   " }).success).toBe(
      false,
    );
    expect(
      apiKeyInputSchema.safeParse({ ...base, name: "x".repeat(65) }).success,
    ).toBe(false);
    expect(
      apiKeyInputSchema.safeParse({ ...base, expiresInDays: 7 }).success,
    ).toBe(false);
  });

  it("turns days into an expiry date, or none", () => {
    const now = new Date("2026-11-02T00:00:00Z");
    expect(expiryDate(null, now)).toBeNull();
    expect(expiryDate(30, now)?.toISOString()).toBe("2026-12-02T00:00:00.000Z");
  });
});

describe("who sees and revokes keys", () => {
  // u1's own workspace.
  const personal = {
    userId: "u1",
    organizationId: ownWorkspaceId("u1"),
    role: "owner" as const,
  };
  const owner = { userId: "u1", organizationId: "t1", role: "owner" as const };
  const admin = { userId: "u2", organizationId: "t1", role: "admin" as const };
  const member = {
    userId: "u3",
    organizationId: "t1",
    role: "member" as const,
  };

  it("lets owners and admins see the whole team's keys, members only theirs", () => {
    expect(canSeeAllKeys(personal)).toBe(true);
    expect(canSeeAllKeys(owner)).toBe(true);
    expect(canSeeAllKeys(admin)).toBe(true);
    expect(canSeeAllKeys(member)).toBe(false);
  });

  it("lets the creator, owners and admins revoke, never another member", () => {
    expect(canRevokeKey(member, { userId: "u3" })).toBe(true);
    expect(canRevokeKey(member, { userId: "u1" })).toBe(false);
    expect(canRevokeKey(admin, { userId: "u3" })).toBe(true);
    expect(canRevokeKey(owner, { userId: "u2" })).toBe(true);
  });

  it("acts with the strongest of the creator's roles", () => {
    expect(roleFromMembership("member")).toBe("member");
    expect(roleFromMembership("member, admin")).toBe("admin");
    expect(roleFromMembership("admin,owner")).toBe("owner");
    expect(roleFromMembership("viewer")).toBe("viewer");
    expect(roleFromMembership("billing")).toBe("billing");
    // Unknown roles never grant more than reading.
    expect(roleFromMembership("superuser")).toBe("viewer");
  });
});

describe("the first request for a new key", () => {
  const key = "qrdx_0123456789abcdefghijABCDEFGHIJ0123456789";

  it("uses api.qrdx.dev on qrdx.dev and /api/v1 anywhere else", () => {
    expect(apiBaseFor("https://qrdx.dev")).toBe("https://api.qrdx.dev/v1");
    expect(apiBaseFor("http://localhost:3001")).toBe(
      "http://localhost:3001/api/v1",
    );
    expect(apiBaseFor("https://qr.example.com")).toBe(
      "https://qr.example.com/api/v1",
    );
  });

  it("creates a code when the key can write, with the key inlined", () => {
    const { command } = firstRequest(
      "https://api.qrdx.dev/v1",
      key,
      API_KEY_PRESETS.full,
    );
    expect(command).toBe(
      [
        "curl -X POST https://api.qrdx.dev/v1/codes \\",
        `  -H "Authorization: Bearer ${key}" \\`,
        '  -H "Content-Type: application/json" \\',
        `  -d '{"destinationUrl": "https://example.com"}'`,
      ].join("\n"),
    );
  });

  it("falls back to a read the key's scopes allow", () => {
    const base = "http://localhost:3001/api/v1";
    expect(firstRequest(base, key, ["codes:read"]).command).toContain(
      `curl "${base}/codes?limit=5"`,
    );
    expect(firstRequest(base, key, ["themes:read"]).command).toContain(
      `${base}/themes`,
    );
    expect(firstRequest(base, key, ["profile:read"]).command).toContain(
      `${base}/me`,
    );
  });
});

describe("the API keys docs match the code", () => {
  const page = readFileSync(
    join(import.meta.dirname, "../../content/docs/developers/api-keys.mdx"),
    "utf8",
  );

  it("states the real key cap, expiry choices and format", () => {
    expect(page).toContain(`up to ${MAX_API_KEYS} active keys`);
    expect(page).toContain("30 days, 90 days or 1 year");
    expect(API_KEY_EXPIRY_DAYS).toEqual([30, 90, 365]);
    expect(page).toContain(
      `\`${API_KEY_PREFIX}\` followed by ${API_KEY_RANDOM_LENGTH} letters and digits`,
    );
  });

  it("lists the presets' real scopes", () => {
    for (const scope of API_KEY_PRESETS.full)
      expect(page).toContain(`\`${scope}\``);
    expect(page).toContain(
      `| Read only | ${API_KEY_PRESETS.read.map((s) => `\`${s}\``).join(", ")} |`.replace(
        "`themes:read`, `profile:read`",
        "`profile:read`, `themes:read`",
      ),
    );
  });
});
