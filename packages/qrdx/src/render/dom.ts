import { isFragment, isQRNode, type QRChild } from "../jsx/runtime";
import { toAttribute, VALID_TAG } from "./attributes";

const SVG_NS = "http://www.w3.org/2000/svg";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

function setAttribute(element: Element, name: string, value: string) {
  if (name === "xmlns" || name.startsWith("xmlns:")) {
    element.setAttributeNS(XMLNS_NS, name, value);
  } else if (name.startsWith("xlink:")) {
    element.setAttributeNS(XLINK_NS, name, value);
  } else if (name.startsWith("xml:")) {
    element.setAttributeNS(XML_NS, name, value);
  } else {
    element.setAttribute(name, value);
  }
}

function append(
  parent: Node,
  node: QRChild,
  namespace: string,
  doc: Document
): void {
  if (node === null || node === undefined || typeof node === "boolean") {
    return;
  }
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "bigint"
  ) {
    parent.appendChild(doc.createTextNode(`${node}`));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      append(parent, child, namespace, doc);
    }
    return;
  }
  if (!isQRNode(node)) {
    throw new TypeError("qrdx: can't render this value as DOM nodes");
  }
  const { type, props } = node;
  if (isFragment(type)) {
    append(parent, props.children, namespace, doc);
    return;
  }
  if (typeof type === "function") {
    append(parent, type(props), namespace, doc);
    return;
  }
  if (!VALID_TAG.test(type)) {
    throw new TypeError(`qrdx: invalid element name: ${type}`);
  }
  const ns = type === "svg" ? SVG_NS : namespace;
  const element = doc.createElementNS(ns, type);
  for (const prop of Object.keys(props)) {
    const attribute = toAttribute(prop, props[prop]);
    if (attribute) {
      setAttribute(element, attribute.name, attribute.value);
    }
  }
  // foreignObject holds HTML again
  append(
    element,
    props.children,
    ns === SVG_NS && type === "foreignObject" ? HTML_NS : ns,
    doc
  );
  parent.appendChild(element);
}

/**
 * DOM nodes for a tree: the elements and attributes `renderToString` writes,
 * built with `createElementNS` (no HTML is parsed, so it works under a
 * Trusted Types policy).
 */
export function renderToDOM(
  node: QRChild,
  doc: Document = document
): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  append(fragment, node, HTML_NS, doc);
  return fragment;
}
