// Compilers fall back to `createElement` from the JSX import source for a
// `key` placed after a spread (`<g {...props} key={k} />`).
export { h as createElement } from "./runtime";
