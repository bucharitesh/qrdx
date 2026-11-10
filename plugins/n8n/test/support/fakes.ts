import { randomBytes } from "node:crypto";
import type {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  IHttpRequestOptions,
  INode,
  IWebhookFunctions,
} from "n8n-workflow";

// Minimal stand-ins for the n8n contexts the nodes use. They record every
// HTTP request; nothing touches the network.

export interface FakeResponse {
  statusCode: number;
  body: unknown;
}

export interface RecordedRequest {
  credentialType?: string;
  options: IHttpRequestOptions;
}

const NODE: INode = {
  id: "node-1",
  name: "QRdx",
  type: "n8n-nodes-qrdx.qrdx",
  typeVersion: 1,
  position: [0, 0],
  parameters: {},
};

/** A made-up key in the qrdx_ format, new for every run. */
export const CREDENTIALS = {
  apiKey: `qrdx_${randomBytes(20).toString("hex")}`,
  baseUrl: "https://api.qrdx.dev/v1",
};

/** A made-up signing secret in QRdx's whsec_ format. */
export const fakeSigningSecret = () =>
  `whsec_${randomBytes(24).toString("base64url")}`;

type Respond = (options: IHttpRequestOptions) => FakeResponse;

function parameterGetter(params: Record<string, unknown>) {
  return (
    name: string,
    _itemIndex?: number | unknown,
    fallback?: unknown,
    options?: { extractValue?: boolean }
  ) => {
    const value = params[name];
    if (value === undefined) {
      if (fallback !== undefined) return fallback;
      throw new Error(`No parameter "${name}" in the fake context`);
    }
    if (
      options?.extractValue &&
      typeof value === "object" &&
      value !== null &&
      "value" in value
    ) {
      return (value as { value: unknown }).value;
    }
    return value;
  };
}

function httpHelpers(
  respond: Respond,
  requests: RecordedRequest[],
  credentials: Record<string, unknown>
) {
  return {
    httpRequest: (options: IHttpRequestOptions) => {
      requests.push({ options });
      return Promise.resolve({
        headers: {},
        statusMessage: "",
        ...respond(options),
      });
    },
    httpRequestWithAuthentication: (
      credentialType: string,
      options: IHttpRequestOptions
    ) => {
      // What the credential's `authenticate` adds.
      const authenticated = {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${credentials.apiKey}`,
        },
      };
      requests.push({ credentialType, options: authenticated });
      return Promise.resolve({
        headers: {},
        statusMessage: "",
        ...respond(authenticated),
      });
    },
    returnJsonArray: (data: IDataObject | IDataObject[]) =>
      (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
  };
}

export function executeContext({
  params,
  respond = () => ({ statusCode: 200, body: {} }),
  credentials = CREDENTIALS,
  continueOnFail = false,
  items = 1,
}: {
  params:
    | Record<string, unknown>
    | ((itemIndex: number) => Record<string, unknown>);
  respond?: Respond;
  credentials?: Record<string, unknown>;
  continueOnFail?: boolean;
  items?: number;
}) {
  const requests: RecordedRequest[] = [];
  let credentialReads = 0;
  const helpers = httpHelpers(respond, requests, credentials);
  const context = {
    getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
    getNodeParameter: (
      name: string,
      itemIndex: number,
      fallback?: unknown,
      options?: { extractValue?: boolean }
    ) =>
      parameterGetter(
        typeof params === "function" ? params(itemIndex) : params
      )(name, itemIndex, fallback, options),
    getNode: () => NODE,
    continueOnFail: () => continueOnFail,
    getCredentials: () => {
      credentialReads++;
      return Promise.resolve(credentials);
    },
    helpers: {
      ...helpers,
      prepareBinaryData: async (
        data: Buffer,
        fileName: string,
        mimeType: string
      ) => ({
        data: data.toString("base64"),
        fileName,
        mimeType,
        fileSize: String(data.length),
      }),
    },
  };
  return {
    context: context as unknown as IExecuteFunctions,
    requests,
    credentialReads: () => credentialReads,
  };
}

export function hookContext({
  params,
  staticData = {},
  respond,
  webhookUrl = "https://n8n.example.com/webhook/abc/webhook",
}: {
  params: Record<string, unknown>;
  staticData?: IDataObject;
  respond: Respond;
  webhookUrl?: string;
}) {
  const requests: RecordedRequest[] = [];
  const warnings: string[] = [];
  const context = {
    getWorkflowStaticData: () => staticData,
    getNodeWebhookUrl: () => webhookUrl,
    getNodeParameter: (name: string, fallback?: unknown) =>
      parameterGetter(params)(name, undefined, fallback),
    getNode: () => NODE,
    getCredentials: async () => CREDENTIALS,
    logger: { warn: (message: string) => warnings.push(message) },
    helpers: httpHelpers(respond, requests, CREDENTIALS),
  };
  return {
    context: context as unknown as IHookFunctions,
    requests,
    staticData,
    warnings,
  };
}

export function webhookContext({
  params,
  staticData,
  headers,
  rawBody,
}: {
  params: Record<string, unknown>;
  staticData: IDataObject;
  headers: IDataObject;
  rawBody: string;
}) {
  const response = { status: 0, body: undefined as unknown, ended: false };
  const res = {
    status(code: number) {
      response.status = code;
      return res;
    },
    json(body: unknown) {
      response.body = body;
      return res;
    },
    end() {
      response.ended = true;
    },
  };
  const context = {
    getWorkflowStaticData: () => staticData,
    getHeaderData: () => headers,
    getBodyData: () => JSON.parse(rawBody) as IDataObject,
    getRequestObject: () => ({ rawBody: Buffer.from(rawBody) }),
    getResponseObject: () => res,
    getNodeParameter: (name: string, fallback?: unknown) =>
      parameterGetter(params)(name, undefined, fallback),
    getNode: () => NODE,
    helpers: httpHelpers(
      () => ({ statusCode: 500, body: {} }),
      [],
      CREDENTIALS
    ),
  };
  return { context: context as unknown as IWebhookFunctions, response };
}
