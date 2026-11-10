import type { INodeProperties } from "n8n-workflow";
import { CODE_STATUSES } from "../constants";
import { optionsFrom } from "./options";

/** The code a Code or Scan operation acts on: picked from a list or by id. */
export function codeLocator(
  resource: string,
  operations: string[]
): INodeProperties {
  return {
    displayName: "Code",
    name: "codeId",
    type: "resourceLocator",
    default: { mode: "list", value: "" },
    required: true,
    description: "The dynamic QR code",
    displayOptions: { show: { resource: [resource], operation: operations } },
    modes: [
      {
        displayName: "From List",
        name: "list",
        type: "list",
        typeOptions: { searchListMethod: "searchCodes", searchable: true },
      },
      {
        displayName: "ID",
        name: "id",
        type: "string",
        placeholder: "e.g. cm5code0spring0menu00001",
      },
    ],
  };
}

export const codeOperations: INodeProperties[] = [
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: { show: { resource: ["code"] } },
    options: [
      {
        name: "Create",
        value: "create",
        description: "Create a dynamic QR code",
        action: "Create a code",
      },
      {
        name: "Delete",
        value: "delete",
        description: "Delete a code and its scan history for good",
        action: "Delete a code",
      },
      {
        name: "Get",
        value: "get",
        description: "Get a code",
        action: "Get a code",
      },
      {
        name: "Get Many",
        value: "getAll",
        description: "Get many codes, newest first",
        action: "Get many codes",
      },
      {
        name: "Update",
        value: "update",
        description:
          "Change a code's destination, title, design, domain or back-half, or archive it",
        action: "Update a code",
      },
    ],
    default: "create",
  },
];

const STYLE_FIELD: INodeProperties = {
  displayName: "Style (JSON)",
  name: "style",
  type: "json",
  default: "{}",
  description:
    'The design, in the JSON of a saved QRdx theme, e.g. {"fgColor": "#111827", "bodyPattern": "circle"}. Theme → Get returns one.',
};

export const codeFields: INodeProperties[] = [
  // ─── Create ──────────────────────────────────────────────────────────────
  {
    displayName: "Destination URL",
    name: "destinationUrl",
    type: "string",
    required: true,
    default: "",
    placeholder: "https://example.com/menu",
    description:
      "Where a scan sends people: a full http(s) URL. You can change it later; the printed code keeps working.",
    displayOptions: { show: { resource: ["code"], operation: ["create"] } },
  },
  {
    displayName: "Additional Fields",
    name: "additionalFields",
    type: "collection",
    placeholder: "Add Field",
    default: {},
    displayOptions: { show: { resource: ["code"], operation: ["create"] } },
    options: [
      {
        displayName: "Back-Half",
        name: "slug",
        type: "string",
        default: "",
        placeholder: "spring-menu",
        description:
          "A custom back-half for the short link (Pro and Business). Leave it out for a generated one.",
      },
      {
        displayName: "Domain ID",
        name: "domainId",
        type: "string",
        default: "",
        description:
          "A verified custom domain of the workspace (Pro). Leave it out for the default qrdx.dev short link.",
      },
      STYLE_FIELD,
      {
        displayName: "Title",
        name: "title",
        type: "string",
        default: "",
        description: "Name shown in the dashboard, up to 100 characters",
      },
    ],
  },

  // ─── Get, Update, Delete ─────────────────────────────────────────────────
  codeLocator("code", ["get", "update", "delete"]),

  // ─── Update ──────────────────────────────────────────────────────────────
  {
    displayName: "Update Fields",
    name: "updateFields",
    type: "collection",
    placeholder: "Add Field",
    default: {},
    displayOptions: { show: { resource: ["code"], operation: ["update"] } },
    options: [
      {
        displayName: "Archived",
        name: "archived",
        type: "boolean",
        default: false,
        description:
          "Whether the code is archived. Archived codes stop redirecting and free a plan slot; turn it off to restore the code.",
      },
      {
        displayName: "Back-Half",
        name: "slug",
        type: "string",
        default: "",
        description:
          "A new back-half for the short link (Pro and Business). Codes already printed with the old link stop working.",
      },
      {
        displayName: "Destination URL",
        name: "destinationUrl",
        type: "string",
        default: "",
        placeholder: "https://example.com/summer-menu",
        description: "Where a scan sends people from now on",
      },
      {
        displayName: "Domain ID",
        name: "domainId",
        type: "string",
        default: "",
        description:
          "A verified custom domain of the workspace (Pro). Empty moves the code back to the default qrdx.dev short link.",
      },
      STYLE_FIELD,
      {
        displayName: "Title",
        name: "title",
        type: "string",
        default: "",
        description:
          "Name shown in the dashboard, up to 100 characters. Empty removes the title.",
      },
    ],
  },

  // ─── Get Many ────────────────────────────────────────────────────────────
  {
    displayName: "Return All",
    name: "returnAll",
    type: "boolean",
    default: false,
    description: "Whether to return all results or only up to a given limit",
    displayOptions: { show: { resource: ["code"], operation: ["getAll"] } },
  },
  {
    displayName: "Limit",
    name: "limit",
    type: "number",
    typeOptions: { minValue: 1 },
    default: 50,
    description: "Max number of results to return",
    displayOptions: {
      show: { resource: ["code"], operation: ["getAll"], returnAll: [false] },
    },
  },
  {
    displayName: "Filters",
    name: "filters",
    type: "collection",
    placeholder: "Add Filter",
    default: {},
    displayOptions: { show: { resource: ["code"], operation: ["getAll"] } },
    options: [
      {
        displayName: "Search",
        name: "search",
        type: "string",
        default: "",
        description:
          "Codes whose title, destination, notes or tags contain this, or whose back-half or short link it is",
      },
      {
        displayName: "Status",
        name: "status",
        type: "options",
        options: optionsFrom(CODE_STATUSES),
        default: "active",
        description: "Which codes to return",
      },
    ],
  },
];
