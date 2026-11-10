import type { INodeProperties } from "n8n-workflow";

export const themeOperations: INodeProperties[] = [
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: { show: { resource: ["theme"] } },
    options: [
      {
        name: "Get",
        value: "get",
        description: "Get a saved theme and its design",
        action: "Get a theme",
      },
      {
        name: "Get Many",
        value: "getAll",
        description: "Get the workspace's saved themes",
        action: "Get many themes",
      },
    ],
    default: "getAll",
  },
];

export const themeFields: INodeProperties[] = [
  {
    displayName: "Theme ID",
    name: "themeId",
    type: "string",
    required: true,
    default: "",
    description: "The theme's ID, from Theme → Get Many",
    displayOptions: { show: { resource: ["theme"], operation: ["get"] } },
  },
  {
    displayName: "Return All",
    name: "returnAll",
    type: "boolean",
    default: false,
    description: "Whether to return all results or only up to a given limit",
    displayOptions: { show: { resource: ["theme"], operation: ["getAll"] } },
  },
  {
    displayName: "Limit",
    name: "limit",
    type: "number",
    typeOptions: { minValue: 1 },
    default: 50,
    description: "Max number of results to return",
    displayOptions: {
      show: { resource: ["theme"], operation: ["getAll"], returnAll: [false] },
    },
  },
];
