import type {
  IDataObject,
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import { hookPath, type JsonRecord } from "./api";
import { PING_EVENT, WEBHOOK_EVENTS, type WebhookEvent } from "./constants";
import {
  CREDENTIAL_NAME,
  qrdxApiRequest,
  requesterFor,
} from "./GenericFunctions";
import {
  eventItems,
  type HookState,
  reconcileHooks,
  verifySignature,
} from "./webhook";

const EVENT_OPTIONS: Record<
  WebhookEvent,
  { name: string; description: string }
> = {
  "scan.created": {
    name: "Scans",
    description:
      "Scans of your dynamic codes, batched: one delivery a minute with up to 100 scans and the exact count",
  },
  "scan.milestone": {
    name: "Scan Milestones",
    description:
      "A code's first scan, then 10, 100, 500, 1,000, 5,000, 10,000 scans and beyond",
  },
  "code.created": {
    name: "New Codes",
    description: "A dynamic code was created",
  },
  "code.updated": {
    name: "Code Changes",
    description: "A code's destination, title, design or domain changed",
  },
  "form.submitted": {
    name: "Form Submissions",
    description: "Someone submitted a form on one of your hosted pages",
  },
};

interface TriggerOptions {
  includePings?: boolean;
  splitScans?: boolean;
}

/** The parts of the HTTP response the trigger writes on a bad signature. */
interface WebhookResponse {
  status(code: number): WebhookResponse;
  json(body: unknown): WebhookResponse;
  end(): void;
}

const hookState = (context: IHookFunctions | IWebhookFunctions) =>
  context.getWorkflowStaticData("node") as HookState;

/**
 * One delivery: checks the signature on the raw body, then starts the
 * workflow for the chosen events (and test pings, when asked).
 */
function handleDelivery(context: IWebhookFunctions): IWebhookResponseData {
  const state = hookState(context);
  const headers = context.getHeaderData() as IDataObject;
  const signature = headers["x-qrdx-signature"];
  const body = context.getBodyData() as JsonRecord;
  const request = context.getRequestObject() as unknown as { rawBody?: Buffer };
  const rawBody = request.rawBody ?? JSON.stringify(body);

  if (
    !state.secret ||
    typeof signature !== "string" ||
    !verifySignature(state.secret, signature, rawBody)
  ) {
    const response = context.getResponseObject() as unknown as WebhookResponse;
    response.status(401).json({ message: "Invalid signature" }).end();
    return { noWebhookResponse: true };
  }

  const events = context.getNodeParameter("events", []) as string[];
  const options = context.getNodeParameter("options", {}) as TriggerOptions;
  const type = typeof body.type === "string" ? body.type : "";
  const wanted =
    type === PING_EVENT ? Boolean(options.includePings) : events.includes(type);
  if (!wanted) return { webhookResponse: { received: true } };

  return {
    workflowData: [
      context.helpers.returnJsonArray(
        eventItems(body, options) as IDataObject[]
      ),
    ],
  };
}

export class QrdxTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "QRdx Trigger",
    name: "qrdxTrigger",
    icon: {
      light: "file:../../icons/qrdx.svg",
      dark: "file:../../icons/qrdx.dark.svg",
    },
    group: ["trigger"],
    version: 1,
    subtitle: '={{$parameter["events"].join(", ")}}',
    description:
      "Starts the workflow when QRdx codes are scanned, created or changed, or a form is submitted",
    defaults: { name: "QRdx Trigger" },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: CREDENTIAL_NAME, required: true }],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "webhook",
      },
    ],
    properties: [
      {
        displayName:
          "QRdx sends events on the Business plan. The API key needs the Manage codes scope, and QRdx only delivers to a public https:// address, so n8n must be reachable at one.",
        name: "notice",
        type: "notice",
        default: "",
      },
      {
        displayName: "Events",
        name: "events",
        type: "multiOptions",
        required: true,
        default: [],
        description: "The QRdx events that start the workflow",
        options: WEBHOOK_EVENTS.map((value) => ({
          ...EVENT_OPTIONS[value],
          value,
        })).sort((a, b) => a.name.localeCompare(b.name)),
      },
      {
        displayName: "Options",
        name: "options",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        options: [
          {
            displayName: "Include Test Events",
            name: "includePings",
            type: "boolean",
            default: false,
            description:
              "Whether to start the workflow for the ping event QRdx sends when you click Send test on the endpoint in Settings → Webhooks",
          },
          {
            displayName: "Output One Item per Scan",
            name: "splitScans",
            type: "boolean",
            default: false,
            description:
              "Whether to turn each scan of a Scans delivery into its own item. A delivery holds up to 100 scans; data.count has the exact number.",
          },
        ],
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const state = hookState(this);
        const webhookUrl = this.getNodeWebhookUrl("default") as string;
        const events = this.getNodeParameter("events", []) as string[];
        const exists = await reconcileHooks(
          requesterFor(this),
          webhookUrl,
          events,
          state
        );
        if (!exists) {
          state.hookId = undefined;
          state.secret = undefined;
        }
        return exists;
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl("default") as string;
        const events = this.getNodeParameter("events", []) as string[];
        if (events.length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            "Pick at least one event."
          );
        }
        const created = (await qrdxApiRequest.call(this, {
          method: "POST",
          path: "/hooks",
          body: { target_url: webhookUrl, events },
        })) as JsonRecord | undefined;
        if (
          typeof created?.id !== "string" ||
          typeof created.secret !== "string"
        ) {
          throw new NodeOperationError(
            this.getNode(),
            "QRdx didn't return a subscription id and signing secret."
          );
        }
        const state = hookState(this);
        state.hookId = created.id;
        state.secret = created.secret;
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const state = hookState(this);
        if (state.hookId) {
          try {
            await qrdxApiRequest.call(this, {
              method: "DELETE",
              path: hookPath(state.hookId),
              allowNotFound: true,
            });
          } catch (error) {
            this.logger.warn(
              `QRdx Trigger couldn't unsubscribe: ${(error as Error).message}`
            );
            return false;
          }
        }
        state.hookId = undefined;
        state.secret = undefined;
        return true;
      },
    },
  };

  webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    return Promise.resolve(handleDelivery(this));
  }
}
