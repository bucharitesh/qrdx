# Third-party notices

Some code in this repository comes from other projects under the MIT License, which asks that their copyright and permission notices travel with it. This file carries those notices. Each project's license text is reproduced exactly as it appears upstream.

Third-party code that already carries its own notice where it lives, such as a license header or a LICENSE or CREDITS file next to it, isn't repeated here.

## next-forge

- Source: [vercel/next-forge](https://github.com/vercel/next-forge), version 5.2.1 (commit `049d689`).
- What came from it: the repository's starting point. Parts of it remain in:
  - the root configuration: `package.json`, `turbo.json`, `tsconfig.json`, `biome.jsonc`, `tsup.config.ts`, `.gitignore`, `.vscode/` and `.github/pull_request_template.md`;
  - `packages/typescript-config` and `packages/next-config`;
  - `packages/design-system`: `components.json`, `postcss.config.mjs`, `styles/globals.css` and `components/ui`.

```text
MIT License

Copyright (c) 2025 Vercel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## shadcn/ui

- Source: [shadcn-ui/ui](https://github.com/shadcn-ui/ui), registry as of commit `4f617d5` (26 October 2025).
- What came from it: the components in `packages/design-system/components/ui`, except `revola.tsx`. They have been changed since.

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
