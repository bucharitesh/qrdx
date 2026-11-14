import { describe, expect, it } from "vitest";
import {
  DYNAMIC_TYPE_FIELDS,
  emptyContentValues,
} from "@/components/code-builder/builder-content";
import { CONTENT_EXAMPLES } from "@/components/editor/content-forms/content-examples";
import { dynamicDestination, OTHER_DYNAMIC_TYPES } from "@/lib/dynamic-content";
import { CONTENT_FIELDS } from "@/lib/qr-design/content";

describe("the builder's content forms", () => {
  it("has a form for every type under More types", () => {
    expect(Object.keys(DYNAMIC_TYPE_FIELDS).sort()).toEqual(
      [...OTHER_DYNAMIC_TYPES].sort(),
    );
  });

  it("only shows fields the type's schema has", () => {
    for (const type of OTHER_DYNAMIC_TYPES) {
      const known = new Set(CONTENT_FIELDS[type].map((field) => field.name));
      for (const field of DYNAMIC_TYPE_FIELDS[type]) {
        expect(known.has(field.name), `${type}.${field.name}`).toBe(true);
      }
    }
  });

  it("shows every required field, never marked optional", () => {
    for (const type of OTHER_DYNAMIC_TYPES) {
      const shown = new Map(
        DYNAMIC_TYPE_FIELDS[type].map((field) => [field.name, field]),
      );
      for (const field of CONTENT_FIELDS[type]) {
        if (!field.required) continue;
        expect(shown.has(field.name), `${type}.${field.name}`).toBe(true);
        expect(
          shown.get(field.name)?.optional,
          `${type}.${field.name}`,
        ).not.toBe(true);
      }
    }
  });

  it("makes a web address from what its fields hold", () => {
    for (const type of OTHER_DYNAMIC_TYPES) {
      const example = CONTENT_EXAMPLES[type] as Record<string, unknown>;
      const values = emptyContentValues(type);
      for (const name of Object.keys(values)) {
        const value = example[name];
        if (typeof value === "string") values[name] = value;
      }
      const result = dynamicDestination(type, values);
      expect(result.ok, type).toBe(true);
    }
  });

  it("starts every form empty", () => {
    expect(emptyContentValues("whatsapp")).toEqual({
      phoneNumber: "",
      message: "",
    });
    const empty = dynamicDestination(
      "whatsapp",
      emptyContentValues("whatsapp"),
    );
    expect(empty.ok).toBe(false);
  });
});
