// Pure community rules: handles (opt-in, reserved words and look-alikes),
// text checks, editing a custom frame through its spec in the editor, the
// theme schema accepting custom frames, and manual-sql/0012 creating every
// table and column the schema declares. No database or network.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getOfficialFrame, OFFICIAL_FRAMES } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  customFrameColors,
  customFrameName,
  specIcons,
  specTokens,
  swapSpecIcon,
} from "@/components/editor/control-sections/frame-specs";
import {
  BUILT_IN_SPEC_STYLES,
  builtInSpec,
  officialFrameOfSpec,
} from "@/lib/community/catalog";
import {
  handleProblem,
  looksLikeQrdx,
  normalizeHandle,
  RESERVED_HANDLES,
} from "@/lib/community/handles";
import { textProblem } from "@/lib/community/text";
import { themeStylePropsSchema } from "@/types/theme";

const wifi = getOfficialFrame("wifi-card");
if (!wifi) throw new Error("no wifi-card");

describe("handles", () => {
  it("normalizes what people type", () => {
    expect(normalizeHandle("  @@Ana_Ruiz ")).toBe("ana_ruiz");
  });

  it("accepts 3 to 30 of a-z, 0-9, _ and -, starting with a letter or digit", () => {
    expect(handleProblem("ana")).toBeNull();
    expect(handleProblem("studio-42_x")).toBeNull();
    expect(handleProblem("ab")).toMatch(/3 to 30/);
    expect(handleProblem("-ana")).toMatch(/3 to 30/);
    expect(handleProblem("ana ruiz")).toMatch(/3 to 30/);
    expect(handleProblem("a".repeat(31))).toMatch(/3 to 30/);
  });

  it("keeps reserved words and qrdx look-alikes for QRdx", () => {
    for (const word of RESERVED_HANDLES) {
      if (word.length >= 3) expect(handleProblem(word)).toMatch(/reserved/);
    }
    for (const alike of ["qr-dx", "qrd_x", "the-qrdx-team", "qrdx0"]) {
      expect(looksLikeQrdx(alike), alike).toBe(true);
      expect(handleProblem(alike)).toMatch(/reserved/);
    }
    expect(looksLikeQrdx("quadrax")).toBe(false);
  });
});

describe("text people publish", () => {
  it("refuses links, emails and phone numbers", () => {
    expect(textProblem("Scan to join Wi-Fi")).toBeNull();
    expect(textProblem("Table 12")).toBeNull();
    expect(textProblem("see https://x.io")).toMatch(/links/);
    expect(textProblem("example.com")).toMatch(/links/);
    expect(textProblem("ana@example.com")).toMatch(/email/);
    expect(textProblem("+44 20 7946 0958")).toMatch(/phone/);
  });
});

describe("editing a custom frame through its spec", () => {
  it("knows the colors and icons a spec uses", () => {
    expect([...specTokens(wifi.spec)].sort()).toEqual(["frame", "text"]);
    expect(specIcons(wifi.spec)).toEqual(["wifi"]);
    expect(
      customFrameColors({ style: "custom", spec: wifi.spec, color: "#123456" }),
    ).toEqual({ frame: "#123456", text: "#ffffff", accent: "#123456" });
  });

  it("swaps an icon and keeps the spec valid", () => {
    const spec = swapSpecIcon(wifi.spec, "wifi", "cup");
    expect(specIcons(spec)).toEqual(["cup"]);
    expect(specIcons(wifi.spec)).toEqual(["wifi"]);
    expect(
      themeStylePropsSchema.safeParse({ frame: { style: "custom", spec } })
        .success,
    ).toBe(true);
    expect(customFrameName({ style: "custom", spec })).toBe("Custom");
    expect(customFrameName({ style: "custom", spec: wifi.spec })).toBe(
      "Wi-Fi card",
    );
  });

  it("names every official frame and opens the built-in specs", () => {
    for (const frame of OFFICIAL_FRAMES) {
      expect(officialFrameOfSpec(frame.spec)?.id).toBe(frame.id);
    }
    expect(BUILT_IN_SPEC_STYLES.length).toBeGreaterThan(0);
    for (const style of BUILT_IN_SPEC_STYLES) {
      expect(builtInSpec(style)?.kind).toBe("qrdx.frame");
    }
  });

  it("lets saved themes and codes carry a custom frame, but only a valid one", () => {
    expect(
      themeStylePropsSchema.safeParse({
        frame: { style: "custom", spec: wifi.spec, text: "Join us" },
      }).success,
    ).toBe(true);
    expect(
      themeStylePropsSchema.safeParse({
        frame: {
          style: "custom",
          spec: { ...wifi.spec, qr: { ...wifi.spec.qr, size: 10 } },
        },
      }).success,
    ).toBe(false);
    expect(
      themeStylePropsSchema.safeParse({ frame: { style: "banner-bottom" } })
        .success,
    ).toBe(true);
  });
});

describe("manual-sql/0012_community.sql", () => {
  const root = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "packages",
    "database",
  );
  const sql = readFileSync(
    join(root, "manual-sql", "0012_community.sql"),
    "utf8",
  );
  const schema = readFileSync(join(root, "schema.ts"), "utf8");
  const section = schema.slice(
    schema.indexOf("// ─── Community"),
    schema.indexOf("// OAuth apps."),
  );
  const tables = [
    ...section.matchAll(/pgTable\(\s*"(\w+)",\s*\{([\s\S]*?)\n {2}\},/g),
  ].map((match) => ({
    name: match[1] as string,
    columns: [...(match[2] as string).matchAll(/^\s+\w+: \w+\("(\w+)"/gm)].map(
      (column) => column[1] as string,
    ),
  }));

  it("creates every community table with every column, idempotently", () => {
    expect(tables.map((t) => t.name)).toEqual([
      "community_profile",
      "community_item",
      "community_item_version",
      "community_item_tag",
      "community_like",
      "community_save",
      "community_use",
      "community_collection_entry",
    ]);
    for (const table of tables) {
      const create = new RegExp(
        `CREATE TABLE IF NOT EXISTS "${table.name}" \\(([\\s\\S]*?)\\n\\);`,
      ).exec(sql);
      expect(create, table.name).not.toBeNull();
      const body = create?.[1] ?? "";
      for (const column of table.columns) {
        expect(body, `${table.name}.${column}`).toContain(`"${column}"`);
      }
    }
    const statements = sql.replace(/^--.*$/gm, "");
    expect(statements).not.toMatch(
      /\b(DROP|RENAME|TRUNCATE)\b|(?<!ON )DELETE\b/i,
    );
    expect(sql).not.toMatch(/ALTER TABLE "(?!community_)/);
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });
});
