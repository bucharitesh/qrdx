// "Download my data": the ZIP builder (lib/account/export/archive.ts) and the
// queries behind it (lib/account/export/queries.ts). The queries are checked
// through the SQL drizzle generates, so nothing connects to a database.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  csvCell,
  type ExportEntry,
  exportArchiveStream,
  isSecretKey,
  renderReadme,
  stripSecrets,
} from "@/lib/account/export/archive";
import { exportQueries } from "@/lib/account/export/queries";

const GENERATED_AT = new Date("2026-11-01T12:00:00Z");

async function readZip(stream: ReadableStream<Uint8Array>) {
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const files = unzipSync(bytes);
  return Object.fromEntries(
    Object.entries(files).map(([path, data]) => [path, strFromU8(data)]),
  );
}

async function* pagesOf<T>(...pages: T[][]) {
  for (const page of pages) yield page;
}

describe("exportArchiveStream", () => {
  it("writes every entry plus a README that explains each file", async () => {
    const entries: ExportEntry[] = [
      {
        kind: "json",
        path: "profile.json",
        title: "Profile",
        description: "Your name and email address.",
        load: async () => ({ name: "Ada", createdAt: GENERATED_AT }),
      },
      {
        kind: "json",
        path: "codes.json",
        title: "Codes",
        description: "Your codes.",
        load: async () => [{ slug: "menu" }, { slug: "wifi" }],
      },
      {
        kind: "csv",
        path: "scans.csv",
        title: "Scans",
        description: "One row per scan.",
        columns: ["code", "at"],
        pages: () => pagesOf([{ code: "menu", at: GENERATED_AT }]),
        maxRows: 10,
      },
    ];
    const files = await readZip(
      exportArchiveStream({
        entries,
        intro: "QRdx export",
        generatedAt: GENERATED_AT,
      }),
    );

    expect(Object.keys(files)).toEqual([
      "profile.json",
      "codes.json",
      "scans.csv",
      "README.txt",
    ]);
    expect(JSON.parse(files["profile.json"])).toEqual({
      name: "Ada",
      createdAt: "2026-11-01T12:00:00.000Z",
    });
    expect(files["scans.csv"]).toBe(
      "code,at\r\nmenu,2026-11-01T12:00:00.000Z\r\n",
    );
    const readme = files["README.txt"];
    expect(readme).toContain("QRdx export");
    expect(readme).toContain("Generated: 2026-11-01T12:00:00.000Z");
    for (const entry of entries) {
      expect(readme).toContain(`${entry.path} - ${entry.title}`);
      expect(readme).toContain(entry.description);
    }
    expect(readme).toContain("2 records.");
    expect(readme).toContain("Secrets are never exported");
  });

  it("never writes secret keys, at any depth", async () => {
    const files = await readZip(
      exportArchiveStream({
        entries: [
          {
            kind: "json",
            path: "codes.json",
            title: "Codes",
            description: "Codes.",
            load: async () => [
              {
                slug: "menu",
                passwordHash: "$2b$10$hash",
                snapshot: {
                  destinationUrl: "https://a.example",
                  password_hash: "x",
                },
                webhook: { url: "https://hooks.example", secret: "whsec_1" },
                tokens: [{ access_token: "ya29", refreshToken: "1//r" }],
              },
            ],
          },
        ],
        intro: "QRdx export",
        generatedAt: GENERATED_AT,
      }),
    );
    const text = files["codes.json"];
    for (const leaked of ["$2b$10$hash", "whsec_1", "ya29", "1//r", '"x"']) {
      expect(text).not.toContain(leaked);
    }
    expect(JSON.parse(text)).toEqual([
      {
        slug: "menu",
        snapshot: { destinationUrl: "https://a.example" },
        webhook: { url: "https://hooks.example" },
        tokens: [{}],
      },
    ]);
  });

  it("stops a CSV at its row limit and says so in the README", async () => {
    const files = await readZip(
      exportArchiveStream({
        entries: [
          {
            kind: "csv",
            path: "scans.csv",
            title: "Scans",
            description: "Scans.",
            columns: ["n"],
            pages: () => pagesOf([{ n: 1 }, { n: 2 }], [{ n: 3 }, { n: 4 }]),
            maxRows: 3,
            truncatedNote: "Only the first 3 scans are here.",
          },
        ],
        intro: "QRdx export",
        generatedAt: GENERATED_AT,
      }),
    );
    expect(files["scans.csv"]).toBe("n\r\n1\r\n2\r\n3\r\n");
    expect(files["README.txt"]).toContain("3 records (limit reached).");
    expect(files["README.txt"]).toContain("Only the first 3 scans are here.");
  });

  it("does not call a file cut short when it ends exactly at the limit", async () => {
    const files = await readZip(
      exportArchiveStream({
        entries: [
          {
            kind: "csv",
            path: "scans.csv",
            title: "Scans",
            description: "Scans.",
            columns: ["n"],
            pages: () => pagesOf([{ n: 1 }, { n: 2 }]),
            maxRows: 2,
          },
        ],
        intro: "QRdx export",
        generatedAt: GENERATED_AT,
      }),
    );
    expect(files["README.txt"]).toContain("2 records.");
    expect(files["README.txt"]).not.toContain("limit reached");
  });

  it("reads pages lazily, as the stream is consumed", async () => {
    // Hard-to-compress rows, so the deflate stream emits as it goes.
    let seed = 7;
    const noise = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed.toString(36);
    };
    let pagesRead = 0;
    async function* pages() {
      for (let page = 0; page < 100; page++) {
        pagesRead++;
        yield Array.from({ length: 500 }, () => ({ n: noise() + noise() }));
      }
    }
    const stream = exportArchiveStream({
      entries: [
        {
          kind: "csv",
          path: "big.csv",
          title: "Big",
          description: "Big.",
          columns: ["n"],
          pages,
          maxRows: 100_000,
        },
      ],
      intro: "QRdx export",
      generatedAt: GENERATED_AT,
    });
    const reader = stream.getReader();
    await reader.read();
    expect(pagesRead).toBeLessThan(100);
    await reader.cancel();
  });
});

describe("csvCell", () => {
  it("quotes separators and neutralises spreadsheet formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell(-1)).toBe("-1");
    expect(csvCell(null)).toBe("");
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe("stripSecrets", () => {
  it("matches secret keys in any casing or separator style", () => {
    for (const key of [
      "secret",
      "passwordHash",
      "password_hash",
      "accessToken",
      "access_token",
      "client-secret-hash",
      "refreshTokenHash",
    ]) {
      expect(isSecretKey(key)).toBe(true);
    }
    for (const key of [
      "visitorHash",
      "sha256",
      "tokenCount",
      "events",
      "url",
    ]) {
      expect(isSecretKey(key)).toBe(false);
    }
  });

  it("keeps everything else, turning dates into ISO strings", () => {
    expect(stripSecrets({ at: GENERATED_AT, list: [1, "a", null] })).toEqual({
      at: "2026-11-01T12:00:00.000Z",
      list: [1, "a", null],
    });
  });
});

describe("renderReadme", () => {
  it("lists single objects without a record count", () => {
    const readme = renderReadme({
      intro: "Intro",
      generatedAt: GENERATED_AT,
      files: [
        {
          path: "profile.json",
          title: "Profile",
          description: "You.",
          records: null,
          truncated: false,
        },
      ],
    });
    expect(readme).toContain("profile.json - Profile\n  You.\n");
    expect(readme).not.toContain("record");
  });
});

describe("exportQueries", () => {
  const USER = "user_test_123";
  const OTHER_CURSOR = new Date("2026-10-01T00:00:00Z");
  const queries = exportQueries(USER);
  const built = Object.entries(queries).map(([name, query]) => {
    const target =
      name === "scanPage"
        ? (query as typeof queries.scanPage)("code_1", {
            scannedAt: OTHER_CURSOR,
            id: "scan_1",
          })
        : name === "formResponsePage"
          ? (query as typeof queries.formResponsePage)({
              createdAt: OTHER_CURSOR,
              id: "resp_1",
            })
          : (query as { toSQL: () => { sql: string; params: unknown[] } });
    return { name, ...target.toSQL() };
  });

  // Columns that hold credentials, anywhere in the schema.
  const SECRET_COLUMNS = [
    '"token"',
    '"access_token"',
    '"refresh_token"',
    '"id_token"',
    '"password"',
    '"secret"',
    '"client_secret_hash"',
    '"access_token_hash"',
    '"refresh_token_hash"',
    '"metadata"."access',
  ];

  it("covers every section of the export", () => {
    expect(built.map((query) => query.name).sort()).toEqual(
      [
        "aiUsage",
        "brandKits",
        "codeTags",
        "codeVersions",
        "codes",
        "communityThemes",
        "conversions",
        "domains",
        "files",
        "folders",
        "formResponsePage",
        "integrations",
        "notificationSettings",
        "oauthApps",
        "pageVersions",
        "pages",
        "profile",
        "scanPage",
        "scannedCodes",
        "scansDaily",
        "sessions",
        "signInMethods",
        "subscriptions",
        "tags",
        "teams",
        "themeLikes",
        "themes",
        "webhooks",
      ].sort(),
    );
  });

  it.each(built)("$name is scoped to the user", ({ name, sql, params }) => {
    expect(params).toContain(USER);
    // The user id is compared with the owner column: the user row's own id,
    // an app's owner, or user_id (directly or in the codes/pages subquery).
    const column =
      name === "profile"
        ? "id"
        : name === "oauthApps"
          ? "owner_user_id"
          : "user_id";
    const placeholder = `\\$${params.indexOf(USER) + 1}`;
    expect(sql).toMatch(new RegExp(`"${column}" = ${placeholder}(?!\\d)`));
  });

  it.each(built)("$name selects no secrets", ({ sql }) => {
    const selected = sql.slice(0, sql.indexOf(" from "));
    for (const column of SECRET_COLUMNS) {
      expect(selected).not.toContain(column);
    }
    // The code password only appears as "is it set".
    expect(selected.replace(/"password_hash" is not null/g, "")).not.toContain(
      "password_hash",
    );
    // Notification targets are exported for email only (webhook URLs are secret).
    expect(
      selected.replace(
        /case when ("notification_setting"\.)?"channel" = 'email' then ("notification_setting"\.)?"target" else null end/g,
        "",
      ),
    ).not.toContain('"target"');
  });

  it("scopes scans and form responses through the user's own codes and pages", () => {
    const scanPage = built.find((query) => query.name === "scanPage");
    expect(scanPage?.sql).toContain(
      '"qr_scan"."qr_code_id" in (select "id" from "qr_code" where "qr_code"."user_id" = $',
    );
    const responses = built.find((query) => query.name === "formResponsePage");
    expect(responses?.sql).toContain(
      '"form_response"."page_id" in (select "id" from "landing_page" where "landing_page"."user_id" = $',
    );
  });
});
