// Run: cd apps/docs && npx tsx --test components/landing/custom-css.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scopeCustomCss } from "./custom-css";

const scoped = (css: string) => {
  const result = scopeCustomCss(css, "#p");
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.css;
};
const rejected = (css: string) => {
  const result = scopeCustomCss(css, "#p");
  assert.equal(result.ok, false, `expected "${css}" to be rejected`);
  return result.ok ? "" : result.error;
};

describe("scopeCustomCss", () => {
  it("prefixes every selector with the scope", () => {
    assert.equal(
      scoped("h1, .lp-block > a:hover { color: red; font-weight: 700 }"),
      "#p h1, #p .lp-block > a:hover { color: red; font-weight: 700 }",
    );
  });

  it("keeps sibling combinators inside the scope and nth-child formulas", () => {
    assert.equal(
      scoped("li:nth-child(2n+1) ~ li { opacity: .8 }"),
      "#p li:nth-child(2n+1) ~ li { opacity: .8 }",
    );
  });

  it("scopes rules inside @media and keeps @keyframes", () => {
    assert.equal(
      scoped(
        "@media (max-width: 400px) { a { padding: 0 } } @keyframes pop { from { opacity: 0 } 50% { opacity: .5 } to { opacity: 1 } }",
      ),
      "@media (max-width: 400px) { #p a { padding: 0 } }\n@keyframes pop { from { opacity: 0 } 50% { opacity: .5 } to { opacity: 1 } }",
    );
  });

  it("allows custom properties, !important and strings with semicolons", () => {
    assert.equal(
      scoped('a::after { --x: 2px; content: "a;b" !important }'),
      '#p a::after { --x: 2px; content: "a;b" !important }',
    );
  });

  it("strips comments", () => {
    assert.equal(
      scoped("/* hi */ p { margin: 0 } /* bye"),
      "#p p { margin: 0 }",
    );
  });

  it("rejects HTML breakout, escapes and external resources", () => {
    rejected("</style><script>alert(1)</script>");
    rejected("a { background: url(https://evil.example/x.png) }");
    rejected("a { background: URL ( 'x' ) }");
    rejected('a { background: image-set("x.png" 1x) }');
    rejected("a { b\\61ckground: red }");
    rejected('@import "https://evil.example/x.css";');
    rejected("@font-face { font-family: x; src: local(x) }");
    rejected("a { width: expression(alert(1)) }");
    rejected("a { behavior: x }");
  });

  it("rejects selectors that could reach outside the scope", () => {
    rejected("~ footer { display: none }");
    rejected("+ * { display: none }");
    rejected("a { & ~ b { color: red } }");
    rejected("& footer { display: none }");
  });

  it("rejects unknown at-rules and malformed CSS", () => {
    rejected("@layer x { a { color: red } }");
    rejected("@scope (body) { a { color: red } }");
    rejected("a { color: red");
    rejected("a { color: red } }");
    rejected("color: red;");
    rejected("a { color }");
    rejected('a { content: "unterminated }');
    rejected(`a { color: red }${" ".repeat(10_001)}`);
  });

  it("accepts empty input", () => {
    assert.equal(scoped("   "), "");
  });
});
