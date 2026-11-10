import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ICredentialType,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { describe, expect, it } from "vitest";
import { QrdxApi } from "../credentials/QrdxApi.credentials";
import { Qrdx } from "../nodes/Qrdx/Qrdx.node";
import { QrdxTrigger } from "../nodes/Qrdx/QrdxTrigger.node";

// What n8n's loader expects of the package: each `n8n` entry is a file whose
// exported class has the file's name, the icons exist, and the nodes refer
// to the credential the package ships.

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
  files: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  keywords: string[];
  n8n: { credentials: string[]; nodes: string[] };
};

const CLASSES: Record<string, new () => INodeType | ICredentialType> = {
  QrdxApi,
  Qrdx,
  QrdxTrigger,
};

/** dist/nodes/Qrdx/Qrdx.node.js → nodes/Qrdx/Qrdx.node.ts */
const sourceOf = (entry: string) =>
  entry.replace(/^dist\//, "").replace(/\.js$/, ".ts");

function iconFiles(icon: unknown, sourceFile: string): string[] {
  const values =
    typeof icon === "string"
      ? [icon]
      : Object.values(icon as Record<string, string>);
  return values.map((value) =>
    join(root, dirname(sourceFile), value.replace(/^file:/, ""))
  );
}

describe("package.json", () => {
  it("is the publishable n8n community package", () => {
    expect(pkg.name).toBe("@qrdx/n8n-nodes-qrdx");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.keywords).toContain("n8n-community-node-package");
    expect(pkg.files).toEqual(["dist"]);
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies).toEqual({ "n8n-workflow": "*" });
  });

  it("lists files whose class has the file's name", () => {
    const entries = [...pkg.n8n.credentials, ...pkg.n8n.nodes];
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      const source = sourceOf(entry);
      expect(existsSync(join(root, source)), source).toBe(true);
      const className = source.split("/").at(-1)?.split(".")[0] ?? "";
      expect(CLASSES[className], className).toBeDefined();
    }
  });
});

describe("node and credential descriptions", () => {
  const credential = new QrdxApi();
  const nodes: [string, INodeTypeDescription][] = [
    ["nodes/Qrdx/Qrdx.node.ts", new Qrdx().description],
    ["nodes/Qrdx/QrdxTrigger.node.ts", new QrdxTrigger().description],
  ];

  it("point at icons that exist", () => {
    for (const file of iconFiles(
      credential.icon,
      "credentials/QrdxApi.credentials.ts"
    )) {
      expect(existsSync(file), file).toBe(true);
    }
    for (const [source, description] of nodes) {
      for (const file of iconFiles(description.icon, source)) {
        expect(existsSync(file), file).toBe(true);
      }
    }
  });

  it("use the package's credential", () => {
    for (const [, description] of nodes) {
      expect(description.credentials?.map((c) => c.name)).toEqual([
        credential.name,
      ]);
    }
  });

  it("mark the API key as a password and test it with GET /me", () => {
    const apiKey = credential.properties.find((p) => p.name === "apiKey");
    expect(apiKey?.typeOptions?.password).toBe(true);
    expect(credential.test.request).toMatchObject({ url: "/me" });
  });

  it("make the action node usable as an AI tool", () => {
    expect(new Qrdx().description.usableAsTool).toBe(true);
  });

  it("keep QR images keyless: no credential for that resource", () => {
    const [entry] = new Qrdx().description.credentials ?? [];
    expect(entry?.displayOptions?.show?.resource).not.toContain("qrImage");
  });
});
