// Run: cd apps/docs && npx tsx --test app/api/forms/_lib/forms.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { responsesToCsv } from "./csv";
import { submissionSchema } from "./submission";
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from "./turnstile";

const reply = (body: unknown, status = 200) =>
  (async () => Response.json(body, { status })) as unknown as typeof fetch;

describe("turnstile", () => {
  it("posts the secret, token and IP to siteverify", async () => {
    let seen: { url: string; body: URLSearchParams } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, body: init.body as URLSearchParams };
      return Response.json({ success: true });
    }) as unknown as typeof fetch;
    const result = await verifyTurnstile({
      token: "tok",
      secret: "sec",
      ip: "203.0.113.7",
      fetchImpl,
    });
    assert.deepEqual(result, { ok: true });
    assert.ok(seen);
    const { url, body } = seen as { url: string; body: URLSearchParams };
    assert.equal(url, TURNSTILE_VERIFY_URL);
    assert.equal(body.get("secret"), "sec");
    assert.equal(body.get("response"), "tok");
    assert.equal(body.get("remoteip"), "203.0.113.7");
  });

  it("rejects missing and failed tokens", async () => {
    assert.deepEqual(
      await verifyTurnstile({
        token: null,
        secret: "s",
        ip: "x",
        fetchImpl: reply({}),
      }),
      { ok: false, reason: "missing-token" },
    );
    assert.deepEqual(
      await verifyTurnstile({
        token: "t",
        secret: "s",
        ip: "x",
        fetchImpl: reply({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
      }),
      { ok: false, reason: "rejected" },
    );
  });

  it("reports outages and bad secrets as unavailable", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      assert.equal(
        (
          await verifyTurnstile({
            token: "t",
            secret: "s",
            ip: "x",
            fetchImpl: reply({}, 503),
          })
        ).ok,
        false,
      );
      assert.deepEqual(
        await verifyTurnstile({
          token: "t",
          secret: "s",
          ip: "x",
          fetchImpl: reply({
            success: false,
            "error-codes": ["invalid-input-secret"],
          }),
        }),
        { ok: false, reason: "unavailable" },
      );
      const offline = (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch;
      assert.deepEqual(
        await verifyTurnstile({
          token: "t",
          secret: "s",
          ip: "x",
          fetchImpl: offline,
        }),
        { ok: false, reason: "unavailable" },
      );
    } finally {
      console.error = original;
    }
  });
});

describe("submission body", () => {
  it("accepts the form client's payload", () => {
    const parsed = submissionSchema.parse({
      block: "abc_123",
      qrCodeId: null,
      answers: { rating: 5, comments: "Great" },
      token: null,
      hp: "",
    });
    assert.equal(parsed.block, "abc_123");
  });

  it("rejects malformed ids", () => {
    assert.equal(
      submissionSchema.safeParse({ block: "../x", answers: {} }).success,
      false,
    );
    assert.equal(
      submissionSchema.safeParse({ block: "a", qrCodeId: "a b", answers: {} })
        .success,
      false,
    );
  });
});

describe("responses CSV", () => {
  const forms = [
    {
      id: "form1",
      title: "Feedback",
      fields: [
        { id: "rating", label: "Rating" },
        { id: "comments", label: "Comments" },
      ],
    },
  ];

  it("has a column per question, current ones first, then removed ones", () => {
    const csv = responsesToCsv(
      [
        {
          createdAt: new Date("2026-10-02T10:00:00Z"),
          codeSlug: "aB3dE5f",
          data: {
            block: "form1",
            answers: [
              { id: "rating", label: "Old label", type: "stars", value: 4 },
              {
                id: "comments",
                label: "Comments",
                type: "text",
                value: 'Said "hi",\nthen left',
              },
            ],
          },
        },
        {
          createdAt: new Date("2026-10-01T10:00:00Z"),
          codeSlug: null,
          data: {
            block: "form1",
            answers: [
              { id: "rating", label: "Rating", type: "stars", value: 2 },
              { id: "email", label: "Email", type: "email", value: "a@b.co" },
              { id: "tags", label: "Tags", type: "choice", value: ["A", "B"] },
            ],
          },
        },
      ],
      forms,
    );
    const lines = csv.split("\r\n");
    assert.equal(lines[0], "submitted_at,code,Rating,Comments,Email,Tags");
    assert.equal(
      lines[1],
      '2026-10-02T10:00:00.000Z,aB3dE5f,4,"Said ""hi"",\nthen left",,',
    );
    assert.equal(lines[2], '2026-10-01T10:00:00.000Z,,2,,a@b.co,"A, B"');
    assert.ok(csv.endsWith("\r\n"));
  });

  it("neutralizes spreadsheet formulas and adds a form column for several forms", () => {
    const csv = responsesToCsv(
      [
        {
          createdAt: new Date("2026-10-01T00:00:00Z"),
          codeSlug: null,
          data: {
            block: "form2",
            answers: [
              {
                id: "comments",
                label: "Comments",
                type: "text",
                value: "=HYPERLINK(1)",
              },
            ],
          },
        },
      ],
      [...forms, { id: "form2", title: "Survey", fields: [] }],
    );
    const [header, row] = csv.split("\r\n");
    assert.equal(header, "submitted_at,form,code,Rating,Comments");
    assert.equal(row, "2026-10-01T00:00:00.000Z,Survey,,,'=HYPERLINK(1)");
  });
});
