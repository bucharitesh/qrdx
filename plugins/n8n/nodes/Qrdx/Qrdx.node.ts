import type {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeListSearchResult,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import {
  NodeApiError,
  NodeConnectionTypes,
  NodeOperationError,
} from "n8n-workflow";
import {
  type CodeFields,
  codeCreateBody,
  codePath,
  codeUpdateBody,
  collectCodes,
  collectScans,
  type JsonRecord,
  normalizeBaseUrl,
  unwrapData,
  unwrapList,
} from "./api";
import { CODES_PAGE_SIZE } from "./constants";
import { codeFields, codeOperations } from "./descriptions/CodeDescription";
import {
  qrImageFields,
  qrImageOperations,
} from "./descriptions/QrImageDescription";
import { scanFields, scanOperations } from "./descriptions/ScanDescription";
import { themeFields, themeOperations } from "./descriptions/ThemeDescription";
import {
  CREDENTIAL_NAME,
  qrdxApiRequest,
  qrImageRequest,
  requesterFor,
} from "./GenericFunctions";
import {
  buildQrImageQuery,
  isQrImageFormat,
  type QrImageOptions,
  qrImageFile,
  qrImageUrl,
} from "./qr-image";

type Resource = "qrImage" | "code" | "scan" | "theme";

/** The id of the Code resource locator (list or ID mode). */
function codeIdParameter(context: IExecuteFunctions, itemIndex: number) {
  const value = context.getNodeParameter("codeId", itemIndex, "", {
    extractValue: true,
  }) as string;
  if (!value.trim()) {
    throw new NodeOperationError(context.getNode(), "Choose a code.", {
      itemIndex,
    });
  }
  return value.trim();
}

const toItems = (records: JsonRecord[], itemIndex: number) =>
  records.map(
    (json): INodeExecutionData => ({
      json: json as IDataObject,
      pairedItem: { item: itemIndex },
    })
  );

async function generateQrImage(
  this: IExecuteFunctions,
  itemIndex: number
): Promise<INodeExecutionData[]> {
  const data = this.getNodeParameter("data", itemIndex) as string;
  const format = this.getNodeParameter("format", itemIndex) as string;
  const binaryPropertyName = this.getNodeParameter(
    "binaryPropertyName",
    itemIndex
  ) as string;
  const options = this.getNodeParameter(
    "options",
    itemIndex,
    {}
  ) as QrImageOptions;
  if (!isQrImageFormat(format)) {
    throw new NodeOperationError(
      this.getNode(),
      `"${format}" isn't a format QRdx makes.`,
      { itemIndex }
    );
  }
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const query = buildQrImageQuery(data, format, options);
  const image = await qrImageRequest.call(this, baseUrl, query, itemIndex);
  const file = qrImageFile(format, options.fileName);
  const binary = await this.helpers.prepareBinaryData(
    image,
    file.fileName,
    file.mimeType
  );
  return [
    {
      json: {
        data,
        format,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: image.length,
        url: qrImageUrl(baseUrl, query),
      },
      binary: { [binaryPropertyName]: binary },
      pairedItem: { item: itemIndex },
    },
  ];
}

async function runCode(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number
): Promise<JsonRecord[]> {
  const request = requesterFor(this, itemIndex);
  switch (operation) {
    case "create": {
      const destinationUrl = this.getNodeParameter(
        "destinationUrl",
        itemIndex
      ) as string;
      const fields = this.getNodeParameter(
        "additionalFields",
        itemIndex,
        {}
      ) as CodeFields;
      const response = await request({
        method: "POST",
        path: "/codes",
        body: codeCreateBody(destinationUrl, fields),
      });
      return [unwrapData(response)];
    }
    case "get": {
      const response = await request({
        method: "GET",
        path: codePath(codeIdParameter(this, itemIndex)),
      });
      return [unwrapData(response)];
    }
    case "getAll": {
      const returnAll = this.getNodeParameter(
        "returnAll",
        itemIndex
      ) as boolean;
      const limit = returnAll
        ? 0
        : (this.getNodeParameter("limit", itemIndex) as number);
      const filters = this.getNodeParameter("filters", itemIndex, {}) as {
        status?: string;
        search?: string;
      };
      return await collectCodes(request, { returnAll, limit }, filters);
    }
    case "update": {
      const fields = this.getNodeParameter(
        "updateFields",
        itemIndex,
        {}
      ) as CodeFields & { destinationUrl?: string };
      const response = await request({
        method: "PATCH",
        path: codePath(codeIdParameter(this, itemIndex)),
        body: codeUpdateBody(fields),
      });
      return [unwrapData(response)];
    }
    case "delete": {
      const response = await request({
        method: "DELETE",
        path: codePath(codeIdParameter(this, itemIndex)),
      });
      return [unwrapData(response)];
    }
    default:
      throw new NodeOperationError(
        this.getNode(),
        `The operation "${operation}" isn't supported for codes.`,
        { itemIndex }
      );
  }
}

async function runScan(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number
): Promise<JsonRecord[]> {
  const request = requesterFor(this, itemIndex);
  const codeId = codeIdParameter(this, itemIndex);
  switch (operation) {
    case "getAll": {
      const returnAll = this.getNodeParameter(
        "returnAll",
        itemIndex
      ) as boolean;
      const limit = returnAll
        ? 0
        : (this.getNodeParameter("limit", itemIndex) as number);
      const filters = this.getNodeParameter("filters", itemIndex, {}) as {
        range?: string;
        before?: string;
      };
      return await collectScans(request, codeId, { returnAll, limit }, filters);
    }
    case "getSummary": {
      const options = this.getNodeParameter("options", itemIndex, {}) as {
        range?: string;
      };
      const response = await request({
        method: "GET",
        path: codePath(codeId, "/scans"),
        qs: options.range ? { range: options.range } : {},
      });
      return [unwrapData(response)];
    }
    default:
      throw new NodeOperationError(
        this.getNode(),
        `The operation "${operation}" isn't supported for scans.`,
        { itemIndex }
      );
  }
}

async function runTheme(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number
): Promise<JsonRecord[]> {
  const request = requesterFor(this, itemIndex);
  switch (operation) {
    case "get": {
      const themeId = (
        this.getNodeParameter("themeId", itemIndex) as string
      ).trim();
      if (!themeId) {
        throw new NodeOperationError(this.getNode(), "Enter a theme ID.", {
          itemIndex,
        });
      }
      const response = await request({
        method: "GET",
        path: `/themes/${encodeURIComponent(themeId)}`,
      });
      return [unwrapData(response)];
    }
    case "getAll": {
      const returnAll = this.getNodeParameter(
        "returnAll",
        itemIndex
      ) as boolean;
      const themes = unwrapList(
        await request({ method: "GET", path: "/themes" })
      );
      if (returnAll) return themes;
      return themes.slice(
        0,
        this.getNodeParameter("limit", itemIndex) as number
      );
    }
    default:
      throw new NodeOperationError(
        this.getNode(),
        `The operation "${operation}" isn't supported for themes.`,
        { itemIndex }
      );
  }
}

export class Qrdx implements INodeType {
  description: INodeTypeDescription = {
    displayName: "QRdx",
    name: "qrdx",
    icon: {
      light: "file:../../icons/qrdx.svg",
      dark: "file:../../icons/qrdx.dark.svg",
    },
    group: ["output"],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description:
      "Make QR code images, manage dynamic QR codes and read their scans with QRdx",
    defaults: { name: "QRdx" },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: CREDENTIAL_NAME,
        required: true,
        displayOptions: { show: { resource: ["code", "scan", "theme"] } },
      },
    ],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Code",
            value: "code",
            description:
              "Dynamic QR codes: a short link you can repoint after printing",
          },
          {
            name: "QR Image",
            value: "qrImage",
            description: "A QR code image, with no account or API key",
          },
          {
            name: "Scan",
            value: "scan",
            description: "Scans of a dynamic QR code",
          },
          {
            name: "Theme",
            value: "theme",
            description: "Saved QR code designs",
          },
        ],
        default: "qrImage",
      },
      ...qrImageOperations,
      ...qrImageFields,
      ...codeOperations,
      ...codeFields,
      ...scanOperations,
      ...scanFields,
      ...themeOperations,
      ...themeFields,
    ],
  };

  methods = {
    listSearch: {
      async searchCodes(
        this: ILoadOptionsFunctions,
        filter?: string,
        paginationToken?: string
      ): Promise<INodeListSearchResult> {
        const offset = Number(paginationToken) || 0;
        const page = (await qrdxApiRequest.call(this, {
          method: "GET",
          path: "/codes",
          qs: {
            status: "all",
            limit: CODES_PAGE_SIZE,
            offset,
            ...(filter ? { q: filter } : {}),
          },
        })) as { data?: JsonRecord[]; pagination?: { total?: number } };
        const codes = Array.isArray(page?.data) ? page.data : [];
        const next = offset + codes.length;
        const total = page?.pagination?.total ?? next;
        return {
          // No `url`: opening a short link would count as a scan.
          results: codes.map((code) => ({
            name: String(code.title || code.shortLink || code.slug || code.id),
            value: String(code.id),
          })),
          paginationToken:
            codes.length > 0 && next < total ? String(next) : undefined,
        };
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const resource = this.getNodeParameter(
          "resource",
          itemIndex
        ) as Resource;
        const operation = this.getNodeParameter(
          "operation",
          itemIndex
        ) as string;
        if (resource === "qrImage") {
          if (operation !== "generate") {
            throw new NodeOperationError(
              this.getNode(),
              `The operation "${operation}" isn't supported for QR images.`,
              { itemIndex }
            );
          }
          returnData.push(...(await generateQrImage.call(this, itemIndex)));
          continue;
        }
        const run =
          resource === "code"
            ? runCode
            : resource === "scan"
              ? runScan
              : resource === "theme"
                ? runTheme
                : undefined;
        if (!run) {
          throw new NodeOperationError(
            this.getNode(),
            `The resource "${resource}" isn't supported.`,
            { itemIndex }
          );
        }
        returnData.push(
          ...toItems(await run.call(this, operation, itemIndex), itemIndex)
        );
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: itemIndex },
          });
          continue;
        }
        // QRdx's own errors keep their message; anything else is wrapped.
        const nodeError =
          error instanceof NodeApiError || error instanceof NodeOperationError
            ? error
            : new NodeOperationError(this.getNode(), error as Error, {
                itemIndex,
              });
        throw nodeError;
      }
    }
    return [returnData];
  }
}
