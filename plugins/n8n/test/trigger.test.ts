import { createHmac } from "node:crypto";
import type { IDataObject } from "n8n-workflow";
import { describe, expect, it } from "vitest";
import { QrdxTrigger } from "../nodes/Qrdx/QrdxTrigger.node";
import {
  fakeSigningSecret,
  hookContext,
  webhookContext,
} from "./support/fakes";

const trigger = new QrdxTrigger();
const methods = trigger.webhookMethods.default;
const HOOK_URL = "https://n8n.example.com/webhook/abc/webhook";
const SECRET = fakeSigningSecret();

function sign(body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

describe("subscription lifecycle", () => {
  it("create subscribes the webhook URL and keeps the secret", async () => {
    const { context, requests, staticData } = hookContext({
      params: { events: ["form.submitted", "scan.milestone"] },
      respond: () => ({
        statusCode: 201,
        body: {
          id: "hook1",
          target_url: HOOK_URL,
          events: ["form.submitted", "scan.milestone"],
          event: null,
          active: true,
          created_at: "2026-11-10T09:40:00.000Z",
          secret: SECRET,
        },
      }),
    });
    expect(await methods.create.call(context)).toBe(true);
    expect(requests[0]).toMatchObject({
      credentialType: "qrdxApi",
      options: {
        method: "POST",
        url: "https://api.qrdx.dev/v1/hooks",
        body: {
          target_url: HOOK_URL,
          events: ["form.submitted", "scan.milestone"],
        },
      },
    });
    expect(staticData).toEqual({ hookId: "hook1", secret: SECRET });
  });

  it("create shows QRdx's message when the plan has no webhooks", async () => {
    const { context } = hookContext({
      params: { events: ["form.submitted"] },
      respond: () => ({
        statusCode: 402,
        body: {
          code: "PLAN_REQUIRED",
          message: "Webhooks are part of the Business plan.",
          status: 402,
        },
      }),
    });
    await expect(methods.create.call(context)).rejects.toMatchObject({
      message: "Webhooks are part of the Business plan.",
    });
  });

  it("checkExists finds the stored subscription", async () => {
    const { context } = hookContext({
      params: { events: ["code.created"] },
      staticData: { hookId: "hook1", secret: SECRET },
      respond: () => ({
        statusCode: 200,
        body: {
          data: [
            { id: "hook1", target_url: HOOK_URL, events: ["code.created"] },
          ],
        },
      }),
    });
    expect(await methods.checkExists.call(context)).toBe(true);
  });

  it("checkExists drops a subscription whose events changed", async () => {
    const { context, requests, staticData } = hookContext({
      params: { events: ["code.created", "code.updated"] },
      staticData: { hookId: "hook1", secret: SECRET },
      respond: (options) =>
        options.method === "GET"
          ? {
              statusCode: 200,
              body: {
                data: [
                  {
                    id: "hook1",
                    target_url: HOOK_URL,
                    events: ["code.created"],
                  },
                ],
              },
            }
          : { statusCode: 204, body: "" },
    });
    expect(await methods.checkExists.call(context)).toBe(false);
    expect(requests.map((r) => [r.options.method, r.options.url])).toEqual([
      ["GET", "https://api.qrdx.dev/v1/hooks"],
      ["DELETE", "https://api.qrdx.dev/v1/hooks/hook1"],
    ]);
    expect(staticData).toEqual({});
  });

  it("delete unsubscribes, and a hook that's already gone is fine", async () => {
    const { context, requests, staticData } = hookContext({
      params: { events: ["code.created"] },
      staticData: { hookId: "hook1", secret: SECRET },
      respond: () => ({
        statusCode: 404,
        body: { code: "NOT_FOUND", message: "Hook not found", status: 404 },
      }),
    });
    expect(await methods.delete.call(context)).toBe(true);
    expect(requests[0]?.options).toMatchObject({
      method: "DELETE",
      url: "https://api.qrdx.dev/v1/hooks/hook1",
    });
    expect(staticData).toEqual({});
  });

  it("delete reports failure and keeps the state when QRdx errors", async () => {
    const { context, staticData, warnings } = hookContext({
      params: { events: ["code.created"] },
      staticData: { hookId: "hook1", secret: SECRET },
      respond: () => ({
        statusCode: 500,
        body: {
          code: "INTERNAL_ERROR",
          message: "Something broke",
          status: 500,
        },
      }),
    });
    expect(await methods.delete.call(context)).toBe(false);
    expect(staticData).toEqual({ hookId: "hook1", secret: SECRET });
    expect(warnings[0]).toContain("Something broke");
  });
});

describe("deliveries", () => {
  const envelope = {
    id: "evt_1",
    type: "form.submitted",
    created_at: "2026-11-10T09:30:00.000Z",
    data: {
      response_id: "r1",
      fields: [{ name: "email", label: "Email", value: "ada@example.com" }],
    },
  };
  const rawBody = JSON.stringify(envelope);
  const state: IDataObject = { hookId: "hook1", secret: SECRET };

  it("starts the workflow for a signed delivery of a chosen event", async () => {
    const { context, response } = webhookContext({
      params: { events: ["form.submitted"], options: {} },
      staticData: state,
      headers: { "x-qrdx-signature": sign(rawBody) },
      rawBody,
    });
    const result = await trigger.webhook.call(context);
    expect(result.workflowData).toEqual([[{ json: envelope }]]);
    expect(response.status).toBe(0);
  });

  it("answers 401 to a bad signature and starts nothing", async () => {
    const { context, response } = webhookContext({
      params: { events: ["form.submitted"], options: {} },
      staticData: state,
      headers: { "x-qrdx-signature": sign(`${rawBody} `) },
      rawBody,
    });
    const result = await trigger.webhook.call(context);
    expect(result).toEqual({ noWebhookResponse: true });
    expect(response).toMatchObject({ status: 401, ended: true });
  });

  it("answers 401 when the node has no secret", async () => {
    const { context, response } = webhookContext({
      params: { events: ["form.submitted"], options: {} },
      staticData: {},
      headers: { "x-qrdx-signature": sign(rawBody) },
      rawBody,
    });
    await trigger.webhook.call(context);
    expect(response.status).toBe(401);
  });

  it("skips test pings unless Include Test Events is on", async () => {
    const ping = JSON.stringify({
      id: "evt_ping",
      type: "ping",
      created_at: "2026-11-10T09:30:00.000Z",
      data: {},
    });
    const headers = { "x-qrdx-signature": sign(ping) };
    const off = webhookContext({
      params: { events: ["form.submitted"], options: {} },
      staticData: state,
      headers,
      rawBody: ping,
    });
    const skipped = await trigger.webhook.call(off.context);
    expect(skipped.workflowData).toBeUndefined();
    expect(skipped.webhookResponse).toEqual({ received: true });

    const on = webhookContext({
      params: { events: ["form.submitted"], options: { includePings: true } },
      staticData: state,
      headers,
      rawBody: ping,
    });
    expect((await trigger.webhook.call(on.context)).workflowData).toHaveLength(
      1
    );
  });

  it("splits a scan batch when asked", async () => {
    const batch = JSON.stringify({
      id: "evt_2",
      type: "scan.created",
      created_at: "2026-11-10T09:31:00.000Z",
      data: { count: 2, scans: [{ scan_id: "s1" }, { scan_id: "s2" }] },
    });
    const { context } = webhookContext({
      params: { events: ["scan.created"], options: { splitScans: true } },
      staticData: state,
      headers: { "x-qrdx-signature": sign(batch) },
      rawBody: batch,
    });
    const result = await trigger.webhook.call(context);
    expect(result.workflowData?.[0]?.map((item) => item.json.scan_id)).toEqual([
      "s1",
      "s2",
    ]);
  });
});
