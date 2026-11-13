# Framework adapters: how to build on `qrdx/core`

For whoever adds a wrapper for another framework (Vue, a web component, Angular, Solid, Preact, Svelte…). `qrdx/core` is the React-free engine; every adapter is a thin layer over it.

## Where an adapter lives

- Source in `src/<name>.ts` (plus its own modules if it needs any). Import the engine only from `"./core"`, never from engine modules such as `"./utils"` or `"./frame"`.
- A tsup entry built with `sharedCore(extension, [<own modules>])` (see `qrdx/vanilla` in `tsup.config.ts`). It turns `"./core"` into an import of `dist/core.mjs` / `dist/core.js`, so the app loads one engine however many entries it uses, and it fails the build if the adapter imports an engine module directly.
- An `exports` entry (`"./<name>"`, types from `dist/src/<name>.d.ts`), and the framework as an optional peer dependency in `peerDependenciesMeta`.
- Add the built files to `tests/core-bundles.test.ts` (no `react`, imports only `./core.*` and its framework).

## Which functions

| Need | Use |
| --- | --- |
| The code as a tree | `createQRCodeTree(props)`: plain `{ type, props, key }` nodes (`QRNode`), with React's prop names (`className`, `fillRule`, style objects) |
| SSR markup | `toSVGString(props)`, or `renderToString(tree)`: byte for byte what `<QRCodeSVG>` renders with React |
| DOM nodes | `toSVGElement(props, document)`, or `renderToDOM(tree, document)`: built with `createElementNS`, no HTML parsing (works under Trusted Types) |
| Virtual DOM elements | `toHyperscript(tree, create)`: calls `create(type, attributes, children, key)` with DOM attribute names (`fill-rule`, `class`, CSS text for `style`), fragments flattened |
| `<QRCode>`'s logo API | `resolveQRCodeProps(props)` turns `logo`, `logoOptions`, `hideLogo` and `scale` into the props above |
| Exports | `getQRCodeDataUrl`, `downloadQRCode`, `getQRAsSVGDataUri`, `getSVGString`, `copyQRCodeToClipboard`, `getQRAsPrintPDF`, `getQRAsEPS`, `getScanScore`: all take the same props |
| Types | `QRSVGOptions` (props plus root attributes), `QRProps`, `QRCodeProps`, `QRNode` |

`qrdx/vanilla`'s `createQRCode` (`src/vanilla-api.ts`) is a working example of the DOM route.

Don't use `withElementFactory`. It's internal: the React components use it to build React elements directly, and it relies on React's prop names.

## Updating efficiently

- Building the tree is the cost: about 1.5–2 ms for a styled, framed code (logo, gradient, frame). Turning it into markup or DOM nodes is a small share of that. Rebuild only when the props change.
- The markup is a pure function of the props. Comparing `renderToString(tree)` with the last one is a cheap way to skip DOM work when nothing visible changed (`createQRCode` does this).
- Replace the whole `<svg>` when it changes. There is no stable node identity between two trees to patch against. Gradient, pattern and logo clip-path ids are hashes of their content (templates use fixed ids), so a replaced element never points at another code's `url(#…)` with different content.
- A virtual-DOM adapter can let its framework diff the `toHyperscript` output instead. Lists carry keys (the fourth argument to `create`).

## SSR and hydration

- `createQRCodeTree`, `toSVGString` and `renderToString` need no DOM: they run in Node, edge runtimes and workers.
- Output is deterministic: no random ids and no time-dependent values. Server markup and the client's first render are identical, so hydration doesn't mismatch.
- `toSVGElement`, `renderToDOM` and `createQRCode` need a `document`; call them only on the client.
- PNG, JPG and WebP export, the clipboard and the scan score need a browser canvas. `getQRAsSVGDataUri` works anywhere when logos are data URLs; it loads other logo URLs through an `Image`, so only in a browser. On a server, PNG comes from `qrdx/node` (`getQRAsPNG`).

## Attributes and events

- Root attributes go in the props with React's names (`className`, `aria-label`, `style` as an object, `data-*`). `class` and a CSS string for `style` also work in the core.
- Event handlers and other functions in the props are dropped, as React drops them from markup. Attach events to the adapter's own element.
- With a `frame`, root attributes go on the frame's outer `<svg>`, as in React.

## Templates

A custom template's `wrapper` receives the drawn code and returns the wrapped one. With the core it receives `QRNode`s. A wrapper written with React's JSX still renders through the core, as long as it uses no hooks (React elements are read as nodes). `h(type, props, ...children)` writes one without JSX for both. Import `h` from the entry that draws the code: `qrdx` for the React components, `qrdx/core` otherwise.

## Known limits

- The React entry (`qrdx`) bundles its own copy of the engine, because the React components use engine internals that aren't part of the public API. An app that imports both `qrdx` and `qrdx/core` (or an adapter) in one bundle loads the engine twice. Adapters and `qrdx/vanilla` share one copy.
- The no-bundler file (`dist/vanilla.browser.mjs`) leaves out the official frame library's data, which ships next to it as `dist/frames-official.mjs` and `dist/frames-index.mjs`.
