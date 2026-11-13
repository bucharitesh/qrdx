/**
 * The element runtime of the SVG renderer. The renderer's .tsx files compile
 * their JSX against this folder (`/** @jsxImportSource ./jsx *\/`), so they
 * need no framework: by default an element is a plain `QRNode`
 * (`{ type, props, key }`) that `renderToString`, `renderToDOM` and
 * `toHyperscript` turn into markup, DOM nodes or another framework's
 * elements.
 *
 * The React components draw through the same code with React's own element
 * functions plugged in (`withElementFactory`), so they build exactly the
 * React elements they always have, with no conversion step.
 */

/** A component: a function from props to a tree. */
export type QRComponent = (props: any) => QRChild;

/** A node of the tree the renderer builds without a framework. */
export interface QRNode {
  /** An element name ("svg", "path"…), `Fragment`, or a component */
  type: string | QRComponent;
  /** Attributes with React's names (`fillRule`, `className`), plus `children` */
  props: QRNodeProps;
  /** Like React's: a string, or null when none was given */
  key: string | null;
}

export interface QRNodeProps {
  children?: QRChild;
  [name: string]: unknown;
}

/** Anything that can sit in a tree. Booleans, null and undefined draw nothing. */
export type QRChild =
  | QRNode
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly QRChild[];

/** Groups children without adding an element. */
export function Fragment(props: { children?: QRChild }): QRChild {
  return props.children;
}

type Key = string | number | bigint | null | undefined;

/**
 * The element functions the renderer calls. `QRNode`s by default; the React
 * entry plugs in React's (see `withElementFactory`).
 */
export interface ElementFactory {
  jsx(type: unknown, props: object | null, key?: Key): unknown;
  jsxs(type: unknown, props: object | null, key?: Key): unknown;
  createElement(
    type: unknown,
    props: object | null,
    ...children: unknown[]
  ): unknown;
  cloneElement(element: unknown, props?: object | null): unknown;
  Fragment: unknown;
}

const toKey = (key: Key): string | null =>
  key === undefined || key === null ? null : `${key}`;

/** Builds a node; a `key` among the props wins and is taken out, as in React. */
function node(type: unknown, props: object | null, key?: Key): QRNode {
  let ownProps = (props ?? {}) as QRNodeProps;
  let ownKey = key;
  if ("key" in ownProps) {
    const { key: propKey, ...rest } = ownProps;
    if (propKey !== undefined) {
      ownKey = propKey as Key;
    }
    ownProps = rest;
  }
  return { type: type as QRNode["type"], props: ownProps, key: toKey(ownKey) };
}

/**
 * A copy of `element` with `props` merged over its own, like React's
 * `cloneElement` (the key is kept). Works on React elements too (a custom
 * template written for React, drawn without React).
 */
function cloneNode(element: unknown, props?: object | null): QRNode {
  const source = element as QRNode;
  return {
    type: source.type,
    props: { ...source.props, ...props },
    key: source.key ?? null,
  };
}

/** `createElement(type, props, ...children)`, the classic signature. */
function createNode(
  type: unknown,
  config: object | null,
  ...children: unknown[]
): QRNode {
  const props: Record<string, unknown> = { ...config };
  if (children.length > 0) {
    props.children = children.length === 1 ? children[0] : children;
  }
  return node(type, props);
}

const NODE_FACTORY: ElementFactory = {
  jsx: node,
  jsxs: node,
  createElement: createNode,
  cloneElement: cloneNode,
  Fragment,
};

let factory: ElementFactory = NODE_FACTORY;

/**
 * Runs `render` with another framework's element functions: the React
 * components call the renderer through this, so it builds React elements.
 * Rendering is synchronous, so nothing else runs while the factory is set.
 */
export function withElementFactory<T>(
  elements: ElementFactory,
  render: () => T
): T {
  const previous = factory;
  factory = elements;
  try {
    return render();
  } finally {
    factory = previous;
  }
}

const typeOf = (type: unknown) => (type === Fragment ? factory.Fragment : type);

/** Builds an element (what compiled JSX calls). */
export function jsx(type: unknown, props: object | null, key?: Key): QRNode {
  return factory.jsx(typeOf(type), props, key) as QRNode;
}

/** Builds an element with children written out (what compiled JSX calls). */
export function jsxs(type: unknown, props: object | null, key?: Key): QRNode {
  return factory.jsxs(typeOf(type), props, key) as QRNode;
}

/**
 * Hyperscript: `h("path", { d: "M0 0h1v1H0z" })`, children last. For custom
 * templates written without JSX; it builds whatever the code is drawn with
 * (React elements inside the React components, `QRNode`s otherwise).
 */
export function h(
  type: string | QRComponent,
  props?: Record<string, unknown> | null,
  ...children: QRChild[]
): QRNode {
  return factory.createElement(
    typeOf(type),
    props ?? null,
    ...children
  ) as QRNode;
}

/** `cloneElement` for the current factory. */
export function cloneElement(element: unknown, props?: object | null): QRNode {
  return factory.cloneElement(element, props) as QRNode;
}

const REACT_ELEMENT_TYPES = new Set<unknown>([
  Symbol.for("react.element"),
  Symbol.for("react.transitional.element"),
]);
const REACT_FRAGMENT = Symbol.for("react.fragment");

/**
 * A node of this tree, or a React element (a custom template written for
 * React can still be drawn without React: a React element has the same
 * type, props and key).
 */
export function isQRNode(value: unknown): value is QRNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as {
    type?: unknown;
    props?: unknown;
    $$typeof?: unknown;
  };
  if (
    candidate.$$typeof !== undefined &&
    !REACT_ELEMENT_TYPES.has(candidate.$$typeof)
  ) {
    return false;
  }
  return (
    (typeof candidate.type === "string" ||
      typeof candidate.type === "function" ||
      candidate.type === REACT_FRAGMENT) &&
    typeof candidate.props === "object" &&
    candidate.props !== null
  );
}

/** True for this runtime's Fragment and React's. */
export const isFragment = (type: unknown): boolean =>
  type === Fragment || type === REACT_FRAGMENT;
