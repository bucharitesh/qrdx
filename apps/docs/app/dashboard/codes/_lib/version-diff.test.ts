// Run: cd apps/docs && npx tsx --test app/dashboard/codes/_lib/version-diff.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffVersions,
  normalizeVersion,
  restorableColumns,
  stableStringify,
} from "./version-diff";

const live = {
  destinationUrl: "https://example.com/b",
  title: "Menu",
  style: { fgColor: "#000", bgColor: "#fff" },
  domainId: "d1",
  startsAt: new Date("2026-11-01T09:00:00.000Z"),
  expiresAt: null,
  scanLimit: 500,
  fallbackUrl: null,
  passwordHash: "$2a$hash",
  routing: { rules: [{ type: "device" }] },
  utm: null,
  pixels: {},
  scanCount: 99,
};

// The same row after a JSON round trip, as stored in qr_code_version.
const stored = {
  ...JSON.parse(JSON.stringify({ ...live, passwordHash: undefined })),
  style: { bgColor: "#fff", fgColor: "#000" },
  hasPassword: true,
  scanCount: 3,
};

describe("normalizeVersion", () => {
  it("treats live rows and stored snapshots alike", () => {
    assert.deepEqual(normalizeVersion(live), normalizeVersion(stored));
  });

  it("never exposes the password hash", () => {
    const normalized = normalizeVersion(live);
    assert.equal(normalized.hasPassword, true);
    assert.ok(!JSON.stringify(normalized).includes("$2a$hash"));
  });

  it("sorts keys in JSON comparisons", () => {
    assert.equal(
      stableStringify({ b: 1, a: [{ d: 1, c: 2 }] }),
      stableStringify({ a: [{ c: 2, d: 1 }], b: 1 }),
    );
  });
});

describe("diffVersions", () => {
  it("lists only changed settings, with display values", () => {
    const before = normalizeVersion({
      ...stored,
      destinationUrl: "https://example.com/a",
      domainId: null,
      scanLimit: null,
      hasPassword: false,
      routing: null,
      scanCount: 1,
    });
    const changes = diffVersions(before, normalizeVersion(live), {
      domainName: (id) => (id === "d1" ? "go.brand.com" : null),
    });
    assert.deepEqual(
      changes.map((change) => change.field),
      ["destinationUrl", "domainId", "scanLimit", "hasPassword", "routing"],
    );
    assert.deepEqual(changes[0], {
      field: "destinationUrl",
      label: "Destination",
      kind: "url",
      from: "https://example.com/a",
      to: "https://example.com/b",
    });
    assert.equal(changes[1]?.to, "go.brand.com");
    assert.equal(changes[1]?.from, null);
    assert.equal(changes[3]?.to, "On");
    assert.equal(
      changes[4]?.from,
      undefined,
      "opaque settings carry no values",
    );
  });

  it("is empty when only untracked columns differ", () => {
    assert.deepEqual(
      diffVersions(normalizeVersion(stored), normalizeVersion(live)),
      [],
    );
  });
});

describe("restorableColumns", () => {
  it("returns typed column values from a snapshot", () => {
    const columns = restorableColumns(stored);
    assert.equal(columns.destinationUrl, "https://example.com/b");
    assert.ok(columns.startsAt instanceof Date);
    assert.equal(
      (columns.startsAt as Date).toISOString(),
      "2026-11-01T09:00:00.000Z",
    );
    assert.equal(columns.expiresAt, null);
    assert.equal(columns.pixels, null, "empty JSON restores as null");
    assert.deepEqual(columns.routing, { rules: [{ type: "device" }] });
    assert.ok(!("hasPassword" in columns));
  });
});
