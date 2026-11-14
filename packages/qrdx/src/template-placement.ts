// Where a template draws the code in its artwork. A template wraps the code
// (a 300 × 300 drawing) in artwork of its own and usually draws it smaller
// than the whole, so the scan score measures the code's share of the
// artwork to test the code at its real size.
import type { QRProps } from "../types";
import { getTemplate } from "./templates";
import {
  applyMatrix,
  IDENTITY,
  type Matrix,
  multiply,
  parseNumbers,
  parseTransform,
} from "./utils/svg-geometry";

/** The code's own drawing size inside a template (see utils.tsx). */
const TEMPLATE_CODE_SIZE = 300;

interface ElementLike {
  type?: unknown;
  props?: Record<string, unknown>;
}

const toNumber = (value: unknown): number | undefined => {
  const number =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(number) ? number : undefined;
};

/** A nested `<svg>`'s mapping from its viewBox into its parent's units. */
function viewportMatrix(props: Record<string, unknown>): Matrix {
  const x = toNumber(props.x) ?? 0;
  const y = toNumber(props.y) ?? 0;
  const viewBox = parseNumbers(
    typeof props.viewBox === "string" ? props.viewBox : undefined
  );
  const width = toNumber(props.width);
  const height = toNumber(props.height);
  if (viewBox.length !== 4 || !(viewBox[2] && viewBox[3] && width && height)) {
    return [1, 0, 0, 1, x, y];
  }
  const [vbX, vbY, vbWidth, vbHeight] = viewBox as [
    number,
    number,
    number,
    number,
  ];
  // preserveAspectRatio's default (xMidYMid meet)
  const scale = Math.min(width / vbWidth, height / vbHeight);
  return [
    scale,
    0,
    0,
    scale,
    x + (width - vbWidth * scale) / 2 - vbX * scale,
    y + (height - vbHeight * scale) / 2 - vbY * scale,
  ];
}

/** The transform from `target`'s parent into the root's units, or null. */
function locate(
  node: unknown,
  target: object,
  matrix: Matrix,
  isRoot: boolean
): Matrix | null {
  if (node === target) {
    return matrix;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = locate(child, target, matrix, false);
      if (found) {
        return found;
      }
    }
    return null;
  }
  const element = node as ElementLike | null;
  if (!element || typeof element !== "object" || !element.props) {
    return null;
  }
  const { props } = element;
  let inner = multiply(
    matrix,
    parseTransform(
      typeof props.transform === "string" ? props.transform : undefined
    )
  );
  if (element.type === "svg" && !isRoot) {
    inner = multiply(inner, viewportMatrix(props));
  }
  return locate(props.children, target, inner, false);
}

/**
 * The code's width as a share of the artwork `props` draws: below 1 when a
 * template draws it smaller than its artwork, 1 without a template (or when
 * the template's wrapper doesn't place the code it is given).
 */
export function getTemplateCodeShare(props: QRProps): number {
  const template =
    props.customTemplate ||
    (props.templateId ? getTemplate(props.templateId) : undefined);
  if (!template) {
    return 1;
  }
  const marker = {
    type: "svg",
    props: {
      height: TEMPLATE_CODE_SIZE,
      viewBox: `0 0 ${TEMPLATE_CODE_SIZE} ${TEMPLATE_CODE_SIZE}`,
      width: TEMPLATE_CODE_SIZE,
    },
    key: null,
  };
  let root: ElementLike | null;
  try {
    root = template.wrapper(
      marker,
      {
        fgColor: typeof props.fgColor === "string" ? props.fgColor : undefined,
        bgColor: typeof props.bgColor === "string" ? props.bgColor : undefined,
        ...(props.customProps ?? {}),
      },
      { pixelSize: 10, url: props.value }
    ) as ElementLike | null;
  } catch {
    return 1;
  }
  const rootProps = root?.props;
  if (!rootProps) {
    return 1;
  }
  const viewBox = parseNumbers(
    typeof rootProps.viewBox === "string" ? rootProps.viewBox : undefined
  );
  const artworkWidth =
    viewBox.length === 4 ? viewBox[2] : toNumber(rootProps.width);
  const matrix = locate(root, marker, IDENTITY, true);
  if (!(matrix && artworkWidth)) {
    return 1;
  }
  const [x0, y0] = applyMatrix(matrix, 0, 0);
  const [x1, y1] = applyMatrix(matrix, TEMPLATE_CODE_SIZE, TEMPLATE_CODE_SIZE);
  const width = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const share = width / artworkWidth;
  return share > 0 && share <= 1 ? share : 1;
}
