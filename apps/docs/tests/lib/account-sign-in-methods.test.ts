import { describe, expect, it } from "vitest";
import {
  type LinkedAccount,
  linkableProviders,
  linkErrorMessage,
  toSignInMethods,
  UNLINK_BLOCK_MESSAGES,
  unlinkBlockReason,
} from "@/lib/account/sign-in-methods";

const google: LinkedAccount = {
  id: "acc_google",
  providerId: "google",
  createdAt: new Date("2026-10-01T00:00:00Z"),
};
const github: LinkedAccount = {
  id: "acc_github",
  providerId: "github",
  createdAt: "2026-10-05T00:00:00.000Z",
};
const formatDate = (date: Date) => date.toISOString().slice(0, 10);

describe("unlinkBlockReason", () => {
  it("allows unlinking while another linked account remains", () => {
    expect(unlinkBlockReason([google, github], "acc_google")).toBeNull();
    expect(unlinkBlockReason([google, github], "acc_github")).toBeNull();
  });

  it("never unlinks the last linked account", () => {
    expect(unlinkBlockReason([google], "acc_google")).toBe("last-method");
  });

  it("refuses accounts that aren't the user's", () => {
    expect(unlinkBlockReason([google, github], "acc_someone_else")).toBe(
      "not-found",
    );
    expect(unlinkBlockReason([], "acc_google")).toBe("not-found");
  });

  it("refuses non-social rows (e.g. a password credential)", () => {
    const credential = {
      id: "acc_pw",
      providerId: "credential",
      createdAt: new Date(),
    };
    expect(unlinkBlockReason([google, credential], "acc_pw")).toBe(
      "unsupported",
    );
  });
});

describe("toSignInMethods", () => {
  it("lists linked providers in a fixed order, then email codes", () => {
    const methods = toSignInMethods([github, google], formatDate);
    expect(methods.map((method) => method.kind)).toEqual([
      "google",
      "github",
      "email",
    ]);
    expect(methods[0]).toMatchObject({
      id: "acc_google",
      label: "Google",
      linkedAt: "2026-10-01",
      unlinkBlocked: null,
    });
    expect(methods[1].linkedAt).toBe("2026-10-05");
  });

  it("explains why the only linked provider can't be removed", () => {
    const [onlyGoogle] = toSignInMethods([google], formatDate);
    expect(onlyGoogle.unlinkBlocked).toBe(UNLINK_BLOCK_MESSAGES["last-method"]);
  });

  it("always shows email codes, which can't be removed", () => {
    const methods = toSignInMethods([], formatDate);
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({ kind: "email", id: "email" });
    expect(methods[0].unlinkBlocked).not.toBeNull();
  });
});

describe("linkableProviders", () => {
  it("offers configured providers that aren't linked yet", () => {
    expect(linkableProviders([google], ["google", "github"])).toEqual([
      "github",
    ]);
    expect(linkableProviders([], ["github"])).toEqual(["github"]);
    expect(linkableProviders([google, github], ["google", "github"])).toEqual(
      [],
    );
  });
});

describe("linkErrorMessage", () => {
  it("explains Better Auth's link errors", () => {
    expect(linkErrorMessage("email_does_not_match")).toMatch(
      /different email address/,
    );
    expect(
      linkErrorMessage("account_already_linked_to_different_user"),
    ).toMatch(/different QRdx account/);
    expect(linkErrorMessage("anything_else")).toMatch(/couldn't link/);
  });
});
