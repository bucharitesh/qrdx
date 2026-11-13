// A DOM tree as text, for comparing what an adapter put on the page with the
// core's DOM: element namespaces, attributes in order, text. A `style`
// attribute is compared as the browser reads it, since a framework may set it
// through the CSSOM (`width:100%` reads back as `width: 100%;`).

const escapeText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

function cssText(value: string): string {
  const probe = document.createElement("div");
  probe.setAttribute("style", value);
  return probe.style.cssText;
}

export function domSnapshot(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    return escapeText((node as Text).data);
  }
  if (node.nodeType !== node.ELEMENT_NODE) {
    return [...node.childNodes].map(domSnapshot).join("");
  }
  const element = node as Element;
  const attributes = [...element.attributes]
    .map(
      ({ name, value }) =>
        ` ${name}="${name === "style" ? cssText(value) : value}"`
    )
    .join("");
  return `<${element.namespaceURI}|${element.localName}${attributes}>${[
    ...element.childNodes,
  ]
    .map(domSnapshot)
    .join("")}</${element.localName}>`;
}
