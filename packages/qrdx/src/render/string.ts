import {
  isFragment,
  isQRNode,
  type QRChild,
  type QRNode,
} from "../jsx/runtime";
import {
  escapeText,
  toAttribute,
  VALID_TAG,
  VOID_ELEMENTS,
} from "./attributes";

/**
 * Markup of a tree: byte for byte what React's `renderToStaticMarkup` writes
 * for the same elements (see attributes.ts), with no React. React elements
 * in the tree (a custom template written for React) are drawn the same way.
 */
export function renderToString(node: QRChild): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string") {
    return escapeText(node);
  }
  if (typeof node === "number" || typeof node === "bigint") {
    return `${node}`;
  }
  if (Array.isArray(node)) {
    let out = "";
    for (const child of node) {
      out += renderToString(child);
    }
    return out;
  }
  if (!isQRNode(node)) {
    throw new TypeError("qrdx: can't render this value as SVG markup");
  }
  return renderElement(node);
}

function renderElement(node: QRNode): string {
  const { type, props } = node;
  if (isFragment(type)) {
    return renderToString(props.children);
  }
  if (typeof type === "function") {
    return renderToString(type(props));
  }
  if (!VALID_TAG.test(type)) {
    throw new TypeError(`qrdx: invalid element name: ${type}`);
  }
  let out = `<${type}`;
  for (const prop of Object.keys(props)) {
    const attribute = toAttribute(prop, props[prop]);
    if (attribute) {
      out += ` ${attribute.name}="${escapeText(attribute.value)}"`;
    }
  }
  if (VOID_ELEMENTS.has(type)) {
    return `${out}/>`;
  }
  const html = (props.dangerouslySetInnerHTML as { __html?: unknown } | null)
    ?.__html;
  const inner =
    html === null || html === undefined
      ? renderToString(props.children)
      : `${html}`;
  return `${out}>${inner}</${type}>`;
}
