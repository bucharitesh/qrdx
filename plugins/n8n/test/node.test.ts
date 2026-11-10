import type { ILoadOptionsFunctions } from "n8n-workflow";
import { NodeApiError } from "n8n-workflow";
import { describe, expect, it } from "vitest";
import { Qrdx } from "../nodes/Qrdx/Qrdx.node";
import { CREDENTIALS, executeContext } from "./support/fakes";

const node = new Qrdx();
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const qrParams = (options: Record<string, unknown> = {}) => ({
  resource: "qrImage",
  operation: "generate",
  data: "https://qrdx.dev",
  format: "png",
  binaryPropertyName: "qr",
  options,
});

describe("QR Image → Generate", () => {
  it("calls GET /qr without a key and outputs the image as binary", async () => {
    const { context, requests, credentialReads } = executeContext({
      params: qrParams({ size: 256, foregroundColor: "#111827" }),
      respond: () => ({ statusCode: 200, body: PNG_BYTES }),
    });
    const [items] = await node.execute.call(context);

    expect(requests).toHaveLength(1);
    const { credentialType, options } = requests[0] ?? {};
    expect(credentialType).toBeUndefined();
    expect(credentialReads()).toBe(0);
    expect(options).toMatchObject({
      method: "GET",
      url: "https://api.qrdx.dev/v1/qr",
      qs: {
        data: "https://qrdx.dev",
        format: "png",
        size: "256",
        fg: "111827",
      },
      encoding: "arraybuffer",
    });
    expect(options?.headers).toBeUndefined();

    expect(items).toHaveLength(1);
    const item = items?.[0];
    expect(item?.pairedItem).toEqual({ item: 0 });
    expect(item?.binary?.qr).toEqual({
      data: PNG_BYTES.toString("base64"),
      fileName: "qr-code.png",
      mimeType: "image/png",
      fileSize: String(PNG_BYTES.length),
    });
    expect(item?.json).toEqual({
      data: "https://qrdx.dev",
      format: "png",
      fileName: "qr-code.png",
      mimeType: "image/png",
      fileSize: PNG_BYTES.length,
      url: "https://api.qrdx.dev/v1/qr?data=https%3A%2F%2Fqrdx.dev&format=png&size=256&fg=111827",
    });
  });

  it("uses a self-hosted base URL from the options", async () => {
    const { context, requests } = executeContext({
      params: qrParams({ baseUrl: "https://qr.example.com/api/v1/" }),
      respond: () => ({ statusCode: 200, body: Buffer.from("<svg/>") }),
    });
    await node.execute.call(context);
    expect(requests[0]?.options.url).toBe("https://qr.example.com/api/v1/qr");
  });

  it("turns a QRdx error (sent as bytes) into a NodeApiError", async () => {
    const error = {
      code: "VALIDATION_ERROR",
      message: "Invalid query parameters",
      status: 400,
      data: { details: [{ param: "body", message: "Invalid option" }] },
    };
    const { context } = executeContext({
      params: qrParams({ bodyShape: "triangle" }),
      respond: () => ({
        statusCode: 400,
        body: Buffer.from(JSON.stringify(error)),
      }),
    });
    const failure = await node.execute.call(context).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(NodeApiError);
    expect((failure as NodeApiError).message).toBe("Invalid query parameters");
    expect((failure as NodeApiError).description).toContain(
      "body: Invalid option"
    );
    expect((failure as NodeApiError).httpCode).toBe("400");
  });

  it("puts the error on the item with Continue On Fail", async () => {
    const { context } = executeContext({
      params: qrParams({ foregroundColor: "red" }),
      continueOnFail: true,
    });
    const [items] = await node.execute.call(context);
    expect(items?.[0]?.json.error).toMatch(/hex color/);
    expect(items?.[0]?.pairedItem).toEqual({ item: 0 });
  });
});

describe("Code", () => {
  it("Get Many pages through every code with the credential", async () => {
    const all = Array.from({ length: 150 }, (_, i) => ({ id: `code${i}` }));
    const { context, requests } = executeContext({
      params: {
        resource: "code",
        operation: "getAll",
        returnAll: true,
        filters: { status: "archived" },
      },
      credentials: {
        ...CREDENTIALS,
        baseUrl: "https://qr.example.com/api/v1/",
      },
      respond: (options) => {
        const qs = options.qs as { limit: number; offset: number };
        return {
          statusCode: 200,
          body: {
            data: all.slice(qs.offset, qs.offset + qs.limit),
            pagination: {
              total: all.length,
              limit: qs.limit,
              offset: qs.offset,
            },
          },
        };
      },
    });
    const [items] = await node.execute.call(context);
    expect(items).toHaveLength(150);
    expect(
      items?.every((item) => (item.pairedItem as { item: number }).item === 0)
    ).toBe(true);
    expect(
      requests.map((r) => [r.credentialType, r.options.url, r.options.qs])
    ).toEqual([
      [
        "qrdxApi",
        "https://qr.example.com/api/v1/codes",
        { limit: 100, offset: 0, status: "archived" },
      ],
      [
        "qrdxApi",
        "https://qr.example.com/api/v1/codes",
        { limit: 100, offset: 100, status: "archived" },
      ],
    ]);
    expect(requests[0]?.options.headers).toEqual({
      Authorization: `Bearer ${CREDENTIALS.apiKey}`,
    });
  });

  it("Create posts the body and returns the code", async () => {
    const created = { id: "code1", shortLink: "https://qrdx.dev/q/aB3dE5f" };
    const { context, requests } = executeContext({
      params: {
        resource: "code",
        operation: "create",
        destinationUrl: "https://example.com/menu",
        additionalFields: { title: "Spring menu" },
      },
      respond: () => ({ statusCode: 201, body: { data: created } }),
    });
    const [items] = await node.execute.call(context);
    expect(requests[0]?.options).toMatchObject({
      method: "POST",
      url: "https://api.qrdx.dev/v1/codes",
      body: {
        destinationUrl: "https://example.com/menu",
        title: "Spring menu",
      },
      json: true,
    });
    expect(items?.[0]?.json).toEqual(created);
  });

  it("Update, Get and Delete use the code from the locator", async () => {
    const { context, requests } = executeContext({
      items: 3,
      params: (itemIndex) =>
        [
          {
            resource: "code",
            operation: "update",
            codeId: { mode: "id", value: "code1" },
            updateFields: { archived: true },
          },
          {
            resource: "code",
            operation: "get",
            codeId: { mode: "list", value: "code2" },
          },
          {
            resource: "code",
            operation: "delete",
            codeId: { mode: "id", value: "code3" },
          },
        ][itemIndex] ?? {},
      respond: (options) => ({
        statusCode: 200,
        body: { data: { url: options.url, method: options.method } },
      }),
    });
    const [items] = await node.execute.call(context);
    expect(
      requests.map((r) => [r.options.method, r.options.url, r.options.body])
    ).toEqual([
      ["PATCH", "https://api.qrdx.dev/v1/codes/code1", { archived: true }],
      ["GET", "https://api.qrdx.dev/v1/codes/code2", undefined],
      ["DELETE", "https://api.qrdx.dev/v1/codes/code3", undefined],
    ]);
    expect(items?.map((item) => item.pairedItem)).toEqual([
      { item: 0 },
      { item: 1 },
      { item: 2 },
    ]);
  });

  it("shows QRdx's message when the plan doesn't allow something", async () => {
    const { context } = executeContext({
      params: {
        resource: "code",
        operation: "create",
        destinationUrl: "https://example.com",
        additionalFields: { slug: "spring-menu" },
      },
      respond: () => ({
        statusCode: 402,
        body: {
          code: "PLAN_REQUIRED",
          message: "Custom back-halves are part of Pro and Business.",
          status: 402,
        },
      }),
    });
    await expect(node.execute.call(context)).rejects.toMatchObject({
      message: "Custom back-halves are part of Pro and Business.",
      httpCode: "402",
    });
  });
});

describe("Scan and Theme", () => {
  it("Scan → Get Summary asks for the range without individual scans", async () => {
    const { context, requests } = executeContext({
      params: {
        resource: "scan",
        operation: "getSummary",
        codeId: { mode: "id", value: "code1" },
        options: { range: "7d" },
      },
      respond: () => ({
        statusCode: 200,
        body: { data: { codeId: "code1", total: 42, range: "7d" } },
      }),
    });
    const [items] = await node.execute.call(context);
    expect(requests[0]?.options).toMatchObject({
      url: "https://api.qrdx.dev/v1/codes/code1/scans",
      qs: { range: "7d" },
    });
    expect(items?.[0]?.json).toEqual({
      codeId: "code1",
      total: 42,
      range: "7d",
    });
  });

  it("Scan → Get Many returns one item per scan", async () => {
    const { context } = executeContext({
      params: {
        resource: "scan",
        operation: "getAll",
        codeId: { mode: "id", value: "code1" },
        returnAll: false,
        limit: 2,
        filters: {},
      },
      respond: () => ({
        statusCode: 200,
        body: {
          data: {
            codeId: "code1",
            events: [{ country: "DE" }, { country: "FR" }],
            nextBefore: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
    });
    const [items] = await node.execute.call(context);
    expect(items?.map((item) => item.json)).toEqual([
      { codeId: "code1", country: "DE" },
      { codeId: "code1", country: "FR" },
    ]);
  });

  it("Theme → Get Many applies the limit", async () => {
    const { context, requests } = executeContext({
      params: {
        resource: "theme",
        operation: "getAll",
        returnAll: false,
        limit: 1,
      },
      respond: () => ({
        statusCode: 200,
        body: { data: [{ id: "t1" }, { id: "t2" }] },
      }),
    });
    const [items] = await node.execute.call(context);
    expect(requests[0]?.options.url).toBe("https://api.qrdx.dev/v1/themes");
    expect(items?.map((item) => item.json)).toEqual([{ id: "t1" }]);
  });
});

describe("Code list search", () => {
  it("searches every code by title or link and pages with a token", async () => {
    const { context, requests } = executeContext({
      params: {},
      respond: (options) => {
        const qs = options.qs as { offset: number };
        return {
          statusCode: 200,
          body: {
            data:
              qs.offset === 0
                ? [
                    { id: "code1", title: "Spring menu", slug: "aB3dE5f" },
                    {
                      id: "code2",
                      title: null,
                      shortLink: "https://qrdx.dev/q/x",
                    },
                  ]
                : [],
            pagination: { total: 150, limit: 100, offset: qs.offset },
          },
        };
      },
    });
    const search = node.methods.listSearch.searchCodes.bind(
      context as unknown as ILoadOptionsFunctions
    );
    const page = await search("menu");
    expect(requests[0]?.options.qs).toEqual({
      status: "all",
      limit: 100,
      offset: 0,
      q: "menu",
    });
    expect(page.results).toEqual([
      { name: "Spring menu", value: "code1" },
      { name: "https://qrdx.dev/q/x", value: "code2" },
    ]);
    expect(page.paginationToken).toBe("2");
  });
});
