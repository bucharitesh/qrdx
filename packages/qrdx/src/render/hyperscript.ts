import { isFragment, isQRNode } from "../jsx/runtime";
import { toAttribute } from "./attributes";

/** A framework's element factory, called with DOM attribute names. */
export type CreateElement<T> = (
  type: string,
  attributes: Record<string, string>,
  children: (T | string)[],
  key: string | null
) => T;

/**
 * A tree as another framework's elements (Vue's `h`, Preact's `h`…):
 * fragments flattened, components called, attributes named and valued as
 * `renderToString` writes them (`fill-rule`, `class`, CSS text), so every
 * framework draws the same SVG.
 */
export function toHyperscript<T>(
  node: unknown,
  create: CreateElement<T>
): (T | string)[] {
  const out: (T | string)[] = [];
  const visit = (child: unknown) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return;
    }
    if (
      typeof child === "string" ||
      typeof child === "number" ||
      typeof child === "bigint"
    ) {
      out.push(`${child}`);
      return;
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        visit(item);
      }
      return;
    }
    if (!isQRNode(child)) {
      throw new TypeError("qrdx: can't render this value");
    }
    const { type, props, key } = child;
    if (isFragment(type)) {
      visit(props.children);
      return;
    }
    if (typeof type === "function") {
      visit(type(props));
      return;
    }
    const attributes: Record<string, string> = {};
    for (const prop of Object.keys(props)) {
      const attribute = toAttribute(prop, props[prop]);
      if (attribute) {
        attributes[attribute.name] = attribute.value;
      }
    }
    out.push(
      create(type, attributes, toHyperscript(props.children, create), key)
    );
  };
  visit(node);
  return out;
}
