import { describe, expect, it } from "vitest";
import type { IntegrationApiError } from "../src/core/http-client";
import {
  createGoogleSheetsClient,
  revokeGoogleToken,
} from "../src/integrations/google-sheets/client";
import {
  responsesTable,
  scanRow,
} from "../src/integrations/google-sheets/rows";
import { appendScansToSheet } from "../src/integrations/google-sheets/sink";
import {
  createHubSpotClient,
  revokeHubSpotToken,
} from "../src/integrations/hubspot/client";
import {
  hubSpotInputs,
  upsertResponsesToHubSpot,
} from "../src/integrations/hubspot/sink";
import {
  createMailchimpClient,
  subscriberHash,
} from "../src/integrations/mailchimp/client";
import {
  mailchimpMembers,
  mailchimpTargets,
  syncResponsesToMailchimp,
} from "../src/integrations/mailchimp/sink";
import {
  readSlackInstall,
  revokeSlackToken,
} from "../src/integrations/slack/client";
import type { SinkFormResponse, SinkScan } from "../src/sinks/types";
import { bodyOf, json, mockFetch } from "./helpers";

const SHEET = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

const scan = (n: number): SinkScan => ({
  id: `scan_${n}`,
  scannedAt: `2026-10-31T09:0${n}:00.000Z`,
  code: { id: "c1", slug: "aB3dE5f", title: "Spring menu" },
  country: "DE",
  city: "Berlin",
  deviceType: "mobile",
  os: "iOS",
  browser: "Safari",
  referer: null,
  language: "de-de",
});

const answer = (
  id: string,
  type: string,
  value: string | boolean | number,
  label = id
) => ({
  id,
  label,
  type,
  value,
  text: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value),
});

const response = (
  id: string,
  answers: SinkFormResponse["answers"],
  pageId = "p1"
): SinkFormResponse => ({
  id,
  createdAt: `2026-10-31T10:00:0${id.slice(-1)}.000Z`,
  pageId,
  pageTitle: "Spring",
  formId: "f1",
  codeSlug: "aB3dE5f",
  answers,
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as IntegrationApiError;
  }
  throw new Error("expected a rejection");
}

describe("Google Sheets", () => {
  it("creates a spreadsheet with a frozen, bold header", async () => {
    const { calls } = mockFetch(
      json({
        spreadsheetId: SHEET,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET}`,
        sheets: [{ properties: { sheetId: 7, title: "Scans" } }],
      })
    );
    const created = await createGoogleSheetsClient("g-token").createSpreadsheet(
      { title: "QRdx scans", sheetTitle: "Scans", header: ["Time", "Code"] }
    );
    expect(calls[0]?.url).toBe("https://sheets.googleapis.com/v4/spreadsheets");
    expect(calls[0]?.headers.authorization).toBe("Bearer g-token");
    const body = bodyOf(calls[0]) as {
      sheets: Array<{
        properties: { gridProperties: { frozenRowCount: number } };
        data: Array<{ rowData: Array<{ values: unknown[] }> }>;
      }>;
    };
    expect(body.sheets[0]?.properties.gridProperties.frozenRowCount).toBe(1);
    expect(body.sheets[0]?.data[0]?.rowData[0]?.values).toHaveLength(2);
    expect(created.sheetId).toBe(7);
  });

  it("appends RAW rows (visitor text never becomes a formula), in chunks", async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => [
      `=HYPERLINK("x${i}")`,
    ]);
    const { calls } = mockFetch(json({}), json({}));
    const result = await createGoogleSheetsClient("t").appendRows(
      SHEET,
      "'Scans'!A:J",
      rows
    );
    expect(result.appended).toBe(5001);
    expect(calls).toHaveLength(2);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("valueInputOption")).toBe("RAW");
    expect(url.searchParams.get("insertDataOption")).toBe("INSERT_ROWS");
    expect(url.pathname).toContain(encodeURIComponent("'Scans'!A:J"));
    expect((bodyOf(calls[1]) as { values: unknown[] }).values).toHaveLength(1);
  });

  it("scan rows have the documented columns, id last", () => {
    expect(scanRow(scan(1))).toEqual([
      "2026-10-31 09:01:00",
      "Spring menu (aB3dE5f)",
      "DE",
      "Berlin",
      "mobile",
      "iOS",
      "Safari",
      "",
      "de-de",
      "scan_1",
    ]);
  });

  it("a retry skips scans a lost response already wrote (no duplicate rows)", async () => {
    const { calls } = mockFetch(
      json({ values: [["scan_1"], ["scan_2"]] }),
      json({})
    );
    const target = {
      spreadsheetId: SHEET,
      spreadsheetUrl: "u",
      sheetTitle: "Scans",
      codeId: null,
      rowsWritten: 10,
    };
    const result = await appendScansToSheet(
      createGoogleSheetsClient("t"),
      target,
      [scan(1), scan(2), scan(3)],
      { isRetry: true }
    );
    expect(new URL(calls[0]?.url ?? "").pathname).toContain(
      encodeURIComponent("'Scans'!J2:J64")
    );
    expect(
      (bodyOf(calls[1]) as { values: string[][] }).values.map((row) =>
        row.at(-1)
      )
    ).toEqual(["scan_3"]);
    expect(result).toMatchObject({
      delivered: 1,
      skipped: 2,
      rowsWritten: 13,
      cursor: { at: scan(3).scannedAt, id: "scan_3" },
    });
  });

  it("first attempts append without reading back", async () => {
    const { calls } = mockFetch(json({}));
    const target = {
      spreadsheetId: SHEET,
      spreadsheetUrl: "u",
      sheetTitle: "Scans",
      codeId: null,
      rowsWritten: 0,
    };
    const result = await appendScansToSheet(
      createGoogleSheetsClient("t"),
      target,
      [scan(1), scan(1)]
    );
    expect(calls).toHaveLength(1);
    expect(result.delivered).toBe(1);
  });

  it("maps 401/403/429/5xx and never echoes cell contents", async () => {
    mockFetch(
      json({ error: { status: "UNAUTHENTICATED", message: "x" } }, 401),
      json(
        { error: { status: "PERMISSION_DENIED", message: "ada@example.com" } },
        403
      ),
      json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429),
      json({ error: { status: "INTERNAL" } }, 500)
    );
    const client = createGoogleSheetsClient("t");
    expect(
      (await rejection(client.appendRows(SHEET, "A:A", [["x"]]))).code
    ).toBe("unauthorized");
    const forbidden = await rejection(client.appendRows(SHEET, "A:A", [["x"]]));
    expect(forbidden.code).toBe("forbidden");
    expect(forbidden.message).not.toContain("ada@");
    expect(
      (await rejection(client.appendRows(SHEET, "A:A", [["x"]]))).code
    ).toBe("rate_limited");
    expect(
      (await rejection(client.appendRows(SHEET, "A:A", [["x"]]))).code
    ).toBe("server");
    expect(
      (await rejection(client.appendRows("../x", "A:A", [["x"]]))).code
    ).toBe("bad_request");
  });

  it("revokes the grant", async () => {
    const { calls } = mockFetch(json({}));
    await revokeGoogleToken("refresh-1");
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/revoke");
    expect(calls[0]?.body).toBe("token=refresh-1");
  });

  it("responses table: one column per question, numbers for ratings", () => {
    const table = responsesTable(
      [
        response("r1", [
          answer("q1", "text", "Ada"),
          answer("q2", "stars", 4),
          answer("old", "text", "kept"),
        ]),
      ],
      [
        {
          id: "f1",
          title: "Form",
          fields: [
            { id: "q1", label: "Name" },
            { id: "q2", label: "Rating" },
          ],
        },
      ]
    );
    expect(table.header).toEqual([
      "Submitted (UTC)",
      "Code",
      "Name",
      "Rating",
      "old",
      "Response ID",
    ]);
    expect(table.rows[0]).toEqual([
      "2026-10-31 10:00:01",
      "aB3dE5f",
      "Ada",
      4,
      "kept",
      "r1",
    ]);
  });
});

describe("HubSpot", () => {
  const settings = { pageIds: null, forms: {} };

  it("suggests email, name and phone, splits full names, dedupes by email", () => {
    const { inputs, skipped } = hubSpotInputs(
      [
        response("r1", [
          answer("n", "text", "Ada King Lovelace", "Your name"),
          answer("e", "email", "ADA@example.com", "Email"),
          answer("p", "phone", "+49 30 123", "Phone"),
        ]),
        response("r2", [answer("n", "text", "No Email", "Name")]),
        response("r3", [
          answer("e", "email", "ada@example.com", "Email"),
          answer("c", "text", "Analytical Engines", "Company"),
        ]),
      ],
      settings
    );
    expect(skipped).toBe(2); // r2 has no email; r1 superseded by r3
    expect(inputs).toEqual([
      {
        idProperty: "email",
        id: "ada@example.com",
        properties: { email: "ada@example.com", company: "Analytical Engines" },
      },
    ]);
    const [single] = hubSpotInputs(
      [
        response("r1", [
          answer("n", "text", "Ada King Lovelace", "Your name"),
          answer("e", "email", "ada@example.com", "Email"),
          answer("p", "phone", "+49 30 123", "Phone"),
        ]),
      ],
      settings
    ).inputs;
    expect(single?.properties).toEqual({
      email: "ada@example.com",
      firstname: "Ada",
      lastname: "King Lovelace",
      phone: "+49 30 123",
    });
  });

  it("uses a saved mapping, sends only mapped answers, respects the page filter", () => {
    const { inputs, skipped } = hubSpotInputs(
      [
        response("r1", [
          answer("e", "email", "a@b.co"),
          answer("secret", "text", "do not send"),
        ]),
        response("r2", [answer("e", "email", "c@d.co")], "p2"),
      ],
      {
        pageIds: ["p1"],
        forms: { "p1:f1": { fields: { e: "email", secret: "" } } },
      }
    );
    expect(inputs).toEqual([
      { idProperty: "email", id: "a@b.co", properties: { email: "a@b.co" } },
    ]);
    expect(skipped).toBe(1);
  });

  it("batch-upserts by email in batches of 100", async () => {
    const responses = Array.from({ length: 150 }, (_, i) =>
      response(`r${i}`, [answer("e", "email", `p${i}@x.co`, "Email")])
    );
    const { calls } = mockFetch(
      json({ status: "COMPLETE", results: [] }),
      json({ status: "COMPLETE", results: [] })
    );
    const result = await upsertResponsesToHubSpot(
      createHubSpotClient("hs-token"),
      settings,
      responses
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe(
      "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert"
    );
    expect(calls[0]?.headers.authorization).toBe("Bearer hs-token");
    expect((bodyOf(calls[0]) as { inputs: unknown[] }).inputs).toHaveLength(
      100
    );
    expect(result.delivered).toBe(150);
    expect(result.cursor?.id).toBe("r149");
  });

  it("maps errors by category and never echoes the email", async () => {
    mockFetch(
      json(
        {
          category: "VALIDATION_ERROR",
          message: "Property values were not valid: ada@example.com",
        },
        400
      ),
      json({ category: "EXPIRED_AUTHENTICATION" }, 401),
      json({ category: "RATE_LIMITS" }, 429, { "retry-after": "10" })
    );
    const client = createHubSpotClient("t");
    const input = [
      { idProperty: "email" as const, id: "ada@example.com", properties: {} },
    ];
    const bad = await rejection(client.batchUpsertContacts(input));
    expect(bad.code).toBe("bad_request");
    expect(bad.message).not.toContain("ada@");
    expect((await rejection(client.batchUpsertContacts(input))).code).toBe(
      "unauthorized"
    );
    const limited = await rejection(client.batchUpsertContacts(input));
    expect(limited.retryAfterSeconds).toBe(10);
  });

  it("revokes the refresh token", async () => {
    const { calls } = mockFetch(json({}));
    await revokeHubSpotToken({
      token: "rt",
      clientId: "cid",
      clientSecret: "cs",
    });
    expect(
      Object.fromEntries(new URLSearchParams(calls[0]?.body))
    ).toMatchObject({ token: "rt", token_type_hint: "refresh_token" });
  });
});

describe("Mailchimp", () => {
  const targets = mailchimpTargets([
    { tag: "FNAME", name: "First Name", type: "text" },
    { tag: "LNAME", name: "Last Name", type: "text" },
    { tag: "PHONE", name: "Phone Number", type: "phone" },
    { tag: "ADDRESS", name: "Address", type: "address" },
  ]);
  const base = {
    audienceId: "abc123",
    tags: ["qr"],
    withoutConsent: "pending" as const,
    pageIds: null,
    forms: {},
  };

  it("subscribes only people who ticked the consent box", () => {
    const { members, skipped } = mailchimpMembers(
      [
        response("r1", [
          answer("n", "text", "Ada Lovelace", "Name"),
          answer("e", "email", "ada@x.co", "Email"),
          answer("ok", "consent", true, "News"),
        ]),
        response("r2", [
          answer("e", "email", "bob@x.co", "Email"),
          answer("ok", "consent", false, "News"),
        ]),
      ],
      base,
      targets
    );
    expect(members).toEqual([
      {
        email: "ada@x.co",
        statusIfNew: "subscribed",
        mergeFields: { FNAME: "Ada", LNAME: "Lovelace" },
      },
    ]);
    expect(skipped).toBe(1);
  });

  it("without a consent box: double opt-in (pending) or skipped", () => {
    const responses = [
      response("r1", [
        answer("e", "email", "ada@x.co", "Email"),
        answer("p", "phone", "+1 555", "Phone"),
      ]),
    ];
    expect(mailchimpMembers(responses, base, targets).members[0]).toEqual({
      email: "ada@x.co",
      statusIfNew: "pending",
      mergeFields: { PHONE: "+1 555" },
    });
    expect(
      mailchimpMembers(responses, { ...base, withoutConsent: "skip" }, targets)
        .members
    ).toHaveLength(0);
  });

  it("only sends merge fields the audience has (no ADDRESS objects)", () => {
    expect(targets.map((target) => target.id)).not.toContain("ADDRESS");
  });

  it("PUTs by subscriber hash with status_if_new, then tags", async () => {
    const { calls } = mockFetch(
      json({ id: "m" }),
      new Response(null, { status: 204 })
    );
    await syncResponsesToMailchimp(
      createMailchimpClient("mc-token", "us21"),
      base,
      targets,
      [
        response("r1", [
          answer("e", "email", "Ada@X.co", "Email"),
          answer("ok", "consent", true, "News"),
        ]),
      ]
    );
    const hash = subscriberHash("ada@x.co");
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/abc123/members/${hash}`
    );
    expect(calls[0]?.headers.authorization).toBe("Bearer mc-token");
    expect(bodyOf(calls[0])).toEqual({
      email_address: "ada@x.co",
      status_if_new: "subscribed",
    });
    expect(calls[1]?.url).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/abc123/members/${hash}/tags`
    );
    expect(bodyOf(calls[1])).toEqual({
      tags: [{ name: "qr", status: "active" }],
    });
  });

  it("hashes the lowercased email (md5)", () => {
    expect(subscriberHash(" Urist.McVankab@freddiesjokes.com ")).toBe(
      "62eeb292278cc15f5817cb78f7790b08"
    );
  });

  it("keeps the member's email out of error messages; rejects bad data centers", async () => {
    mockFetch(
      json(
        {
          title: "Member Exists",
          detail: "ada@x.co is already a list member.",
        },
        400
      ),
      json({ title: "API Key Invalid" }, 401)
    );
    const client = createMailchimpClient("t", "us21");
    const error = await rejection(
      client.upsertMember("abc123", {
        email: "ada@x.co",
        statusIfNew: "pending",
        mergeFields: {},
      })
    );
    expect(error.message).toContain("Member Exists");
    expect(error.message).not.toContain("ada@");
    expect(
      (await rejection(client.addTags("abc123", "ada@x.co", ["t"]))).code
    ).toBe("unauthorized");
    expect(() => createMailchimpClient("t", "evil.com/")).toThrow();
  });
});

describe("Slack (Add to Slack)", () => {
  it("reads the channel webhook from oauth.v2.access", () => {
    expect(
      readSlackInstall({
        ok: true,
        access_token: "xoxb-1",
        team: { id: "T1", name: "Corner Café" },
        incoming_webhook: {
          channel: "#scans",
          channel_id: "C1",
          configuration_url: "https://corner.slack.com/services/B1",
          url: "https://hooks.slack.com/services/T1/B1/abcdefghij",
        },
      })
    ).toEqual({
      webhookUrl: "https://hooks.slack.com/services/T1/B1/abcdefghij",
      channel: "#scans",
      channelId: "C1",
      teamId: "T1",
      teamName: "Corner Café",
      configurationUrl: "https://corner.slack.com/services/B1",
    });
  });

  it("rejects ok:false and webhooks on other hosts", () => {
    expect(() =>
      readSlackInstall({ ok: false, error: "invalid_code" })
    ).toThrow("invalid_code");
    expect(() =>
      readSlackInstall({
        ok: true,
        incoming_webhook: { url: "https://evil.example/services/x" },
      })
    ).toThrow();
  });

  it("revokes the token and tolerates an already revoked one", async () => {
    const { calls } = mockFetch(
      json({ ok: true }),
      json({ ok: false, error: "token_revoked" }),
      json({ ok: false, error: "ratelimited" })
    );
    await revokeSlackToken("xoxb-1");
    expect(calls[0]?.url).toBe("https://slack.com/api/auth.revoke");
    expect(calls[0]?.headers.authorization).toBe("Bearer xoxb-1");
    await revokeSlackToken("xoxb-1");
    await expect(revokeSlackToken("xoxb-1")).rejects.toThrow("ratelimited");
  });
});
