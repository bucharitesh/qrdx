import type {
  IExecuteFunctions,
  IHookFunctions,
  IHttpRequestOptions,
  ILoadOptionsFunctions,
  IN8nHttpFullResponse,
  INode,
  JsonObject,
} from "n8n-workflow";
import { NodeApiError } from "n8n-workflow";
import {
  type ApiRequest,
  type ApiRequester,
  apiErrorDetails,
  normalizeBaseUrl,
} from "./api";

// The n8n side of api.ts: requests through n8n's HTTP helpers, and QRdx
// errors as NodeApiError with QRdx's own message.

export const CREDENTIAL_NAME = "qrdxApi";

export interface QrdxCredentials {
  apiKey: string;
  baseUrl: string;
}

type RequestContext =
  | IExecuteFunctions
  | IHookFunctions
  | ILoadOptionsFunctions;

/** A response body that may be JSON text or bytes (image requests). */
function decodeBody(body: unknown): unknown {
  let text: string | undefined;
  if (Buffer.isBuffer(body)) text = body.toString("utf8");
  else if (body instanceof ArrayBuffer)
    text = Buffer.from(body).toString("utf8");
  else if (typeof body === "string") text = body;
  if (text === undefined) return body;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** A QRdx error response as a NodeApiError with QRdx's message. */
function apiError(
  node: INode,
  response: Pick<IN8nHttpFullResponse, "statusCode" | "body">,
  itemIndex?: number
): NodeApiError {
  const body = decodeBody(response.body);
  const { message, description } = apiErrorDetails(response.statusCode, body);
  const errorBody =
    typeof body === "object" && body !== null
      ? (body as JsonObject)
      : { message };
  return new NodeApiError(node, errorBody, {
    message,
    description: description || undefined,
    httpCode: String(response.statusCode),
    itemIndex,
  });
}

/** One authenticated request to the QRdx API; resolves with the JSON body. */
export async function qrdxApiRequest(
  this: RequestContext,
  request: ApiRequest,
  itemIndex?: number
): Promise<unknown> {
  const credentials =
    await this.getCredentials<QrdxCredentials>(CREDENTIAL_NAME);
  const options: IHttpRequestOptions = {
    method: request.method,
    url: `${normalizeBaseUrl(credentials.baseUrl)}${request.path}`,
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  };
  if (request.qs) options.qs = request.qs;
  if (request.body) options.body = request.body;
  const response = (await this.helpers.httpRequestWithAuthentication.call(
    this,
    CREDENTIAL_NAME,
    options
  )) as IN8nHttpFullResponse;
  if (request.allowNotFound && response.statusCode === 404) return undefined;
  if (response.statusCode >= 400) {
    throw apiError(this.getNode(), response, itemIndex);
  }
  return response.body;
}

/** api.ts requester bound to a node context. */
export function requesterFor(
  context: RequestContext,
  itemIndex?: number
): ApiRequester {
  return (request) => qrdxApiRequest.call(context, request, itemIndex);
}

/** GET /qr: keyless, so no credential. Resolves with the image bytes. */
export async function qrImageRequest(
  this: IExecuteFunctions,
  baseUrl: string,
  query: Record<string, string>,
  itemIndex: number
): Promise<Buffer> {
  const response = (await this.helpers.httpRequest({
    method: "GET",
    url: `${baseUrl}/qr`,
    qs: query,
    encoding: "arraybuffer",
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  })) as IN8nHttpFullResponse;
  if (response.statusCode >= 400) {
    throw apiError(this.getNode(), response, itemIndex);
  }
  const body = response.body as unknown;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(String(body), "utf8");
}
