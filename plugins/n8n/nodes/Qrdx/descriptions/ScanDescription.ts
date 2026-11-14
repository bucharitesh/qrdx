import type { INodeProperties } from "n8n-workflow";
import { SCAN_RANGES } from "../constants";
import { codeLocator } from "./CodeDescription";

const RANGE_LABELS: Record<(typeof SCAN_RANGES)[number], string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
  "365d": "Last Year",
  "1095d": "Last 3 Years",
  all: "All Time",
};

const rangeField = (description: string): INodeProperties => ({
  displayName: "Range",
  name: "range",
  type: "options",
  // In range order, not alphabetical.
  options: SCAN_RANGES.map((value) => ({ name: RANGE_LABELS[value], value })),
  default: "30d",
  description,
});

export const scanOperations: INodeProperties[] = [
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: { show: { resource: ["scan"] } },
    options: [
      {
        name: "Get Many",
        value: "getAll",
        description: "Get a code's individual scans, newest first",
        action: "Get many scans",
      },
      {
        name: "Get Summary",
        value: "getSummary",
        description:
          "Get a code's scan totals, daily counts and top countries, cities, devices, browsers and referrers",
        action: "Get a scan summary",
      },
    ],
    default: "getAll",
  },
];

export const scanFields: INodeProperties[] = [
  codeLocator("scan", ["getAll", "getSummary"]),

  // ─── Get Many ────────────────────────────────────────────────────────────
  {
    displayName: "Return All",
    name: "returnAll",
    type: "boolean",
    default: false,
    description: "Whether to return all results or only up to a given limit",
    displayOptions: { show: { resource: ["scan"], operation: ["getAll"] } },
  },
  {
    displayName: "Limit",
    name: "limit",
    type: "number",
    typeOptions: { minValue: 1 },
    default: 50,
    description: "Max number of results to return",
    displayOptions: {
      show: { resource: ["scan"], operation: ["getAll"], returnAll: [false] },
    },
  },
  {
    displayName: "Filters",
    name: "filters",
    type: "collection",
    placeholder: "Add Filter",
    default: {},
    displayOptions: { show: { resource: ["scan"], operation: ["getAll"] } },
    options: [
      {
        displayName: "Before",
        name: "before",
        type: "dateTime",
        default: "",
        description: "Only scans before this time",
      },
      rangeField(
        "How far back to look. If the plan doesn't keep analytics that long, QRdx uses 30 days."
      ),
    ],
  },

  // ─── Get Summary ─────────────────────────────────────────────────────────
  {
    displayName: "Options",
    name: "options",
    type: "collection",
    placeholder: "Add Option",
    default: {},
    displayOptions: { show: { resource: ["scan"], operation: ["getSummary"] } },
    options: [
      rangeField(
        "Days to cover. If the plan doesn't keep analytics that long, QRdx uses 30 days."
      ),
    ],
  },
];
