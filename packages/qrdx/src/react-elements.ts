// React's element functions, plugged into the renderer (jsx/runtime.ts) when
// a React component draws the code, so it builds React elements directly.
import { cloneElement, createElement, Fragment } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import type { ElementFactory } from "./jsx/runtime";

export const REACT_ELEMENTS: ElementFactory = {
  jsx,
  jsxs,
  createElement,
  cloneElement: cloneElement as ElementFactory["cloneElement"],
  Fragment,
};
