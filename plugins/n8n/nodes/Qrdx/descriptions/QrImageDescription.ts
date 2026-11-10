import type { INodeProperties } from "n8n-workflow";
import {
  BODY_SHAPES,
  DATA_MAX_LENGTH,
  DEFAULT_BASE_URL,
  EYE_DOT_SHAPES,
  EYE_SHAPES,
  FRAME_TEXT_MAX_LENGTH,
  FRAMES,
  LOGO_ICONS,
  QR_MARGIN,
  QR_SIZE,
} from "../constants";
import { optionsFrom } from "./options";

const show = { resource: ["qrImage"], operation: ["generate"] };

export const qrImageOperations: INodeProperties[] = [
  {
    displayName: "Operation",
    name: "operation",
    type: "options",
    noDataExpression: true,
    displayOptions: { show: { resource: ["qrImage"] } },
    options: [
      {
        name: "Generate",
        value: "generate",
        description:
          "Make a QR code image as PNG, SVG or EPS. Needs no API key.",
        action: "Generate a QR code image",
      },
    ],
    default: "generate",
  },
];

export const qrImageFields: INodeProperties[] = [
  {
    displayName: "Data",
    name: "data",
    type: "string",
    required: true,
    default: "",
    placeholder: "https://example.com",
    description: `The text or URL to encode, up to ${DATA_MAX_LENGTH.toLocaleString("en-US")} characters`,
    displayOptions: { show },
  },
  {
    displayName: "Format",
    name: "format",
    type: "options",
    options: [
      {
        name: "EPS",
        value: "eps",
        description: "Vector PostScript for print",
      },
      {
        name: "PNG",
        value: "png",
        description: "An image for email, chat and documents",
      },
      {
        name: "SVG",
        value: "svg",
        description: "Vector image for the web and design tools",
      },
      {
        name: "WebP",
        value: "webp",
        description: "The same image as PNG in a smaller file, for the web",
      },
    ],
    default: "png",
    displayOptions: { show },
  },
  {
    displayName: "Put Output File in Field",
    name: "binaryPropertyName",
    type: "string",
    required: true,
    default: "data",
    hint: "The name of the output binary field to put the file in",
    displayOptions: { show },
  },
  {
    displayName: "Options",
    name: "options",
    type: "collection",
    placeholder: "Add Option",
    default: {},
    displayOptions: { show },
    options: [
      {
        displayName: "Background Color",
        name: "backgroundColor",
        type: "color",
        default: "#ffffff",
      },
      {
        displayName: "Base URL",
        name: "baseUrl",
        type: "string",
        default: DEFAULT_BASE_URL,
        description:
          "The QRdx API that draws the image. Change it only for a self-hosted copy of QRdx.",
      },
      {
        displayName: "Body Shape",
        name: "bodyShape",
        type: "options",
        options: optionsFrom(BODY_SHAPES),
        default: "square",
        description: "Shape of the data modules",
      },
      {
        displayName: "Error Correction",
        name: "errorCorrection",
        type: "options",
        options: [
          { name: "High (30%)", value: "H" },
          { name: "Low (7%)", value: "L" },
          { name: "Medium (15%)", value: "M" },
          { name: "Quartile (25%)", value: "Q" },
        ],
        default: "Q",
        description:
          "How much of the code can be damaged or covered and still scan",
      },
      {
        displayName: "Eye Color",
        name: "eyeColor",
        type: "color",
        default: "#000000",
        description: "Color of the three corner eyes",
      },
      {
        displayName: "Eye Dot Color",
        name: "dotColor",
        type: "color",
        default: "#000000",
        description: "Color of the dot inside each corner eye",
      },
      {
        displayName: "Eye Dot Shape",
        name: "eyeDotShape",
        type: "options",
        options: optionsFrom(EYE_DOT_SHAPES),
        default: "square",
        description: "Shape of the dot inside each corner eye",
      },
      {
        displayName: "Eye Shape",
        name: "eyeShape",
        type: "options",
        options: optionsFrom(EYE_SHAPES),
        default: "square",
        description: "Shape of the three corner eye frames",
      },
      {
        displayName: "File Name",
        name: "fileName",
        type: "string",
        default: "qr-code",
        description: "Name of the output file; the format's extension is added",
      },
      {
        displayName: "Foreground Color",
        name: "foregroundColor",
        type: "color",
        default: "#000000",
        description: "Color of the modules",
      },
      {
        displayName: "Frame",
        name: "frame",
        type: "options",
        options: optionsFrom(FRAMES),
        default: "banner-bottom",
        description:
          "A call-to-action frame around the code. With a frame, Size is the code's width and the frame adds to it.",
      },
      {
        displayName: "Frame Text",
        name: "frameText",
        type: "string",
        default: "Scan me",
        description: `The frame's label, up to ${FRAME_TEXT_MAX_LENGTH} characters. Leave it empty to hide the label.`,
      },
      {
        displayName: "Logo Icon",
        name: "logoIcon",
        type: "options",
        options: optionsFrom(LOGO_ICONS, {
          whatsapp: "WhatsApp",
        }),
        default: "link",
        description: "An icon QRdx draws in the center of the code",
      },
      {
        displayName: "Margin",
        name: "margin",
        type: "number",
        typeOptions: { minValue: QR_MARGIN.min, maxValue: QR_MARGIN.max },
        default: 4,
        description: "Quiet zone around the code, in modules",
      },
      {
        displayName: "Size",
        name: "size",
        type: "number",
        typeOptions: { minValue: QR_SIZE.min, maxValue: QR_SIZE.max },
        default: 512,
        description: "Width and height in pixels",
      },
    ],
  },
];
