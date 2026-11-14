# QRdx agent plugin

Styled, scannable QR codes from your coding agent. This plugin bundles two things:

- **The `generate-qr` skill.** It teaches the agent to make QR codes with the QRdx CLI: URLs, text, Wi-Fi logins and vCards as SVG, PNG, WebP or EPS, with colors, gradients, patterns, frames and a center logo, or one code per row of a CSV file.
- **The QRdx MCP server** at `https://mcp.qrdx.dev/mcp`. Its tools design a code and check how well it scans, build Wi-Fi, contact, email, SMS, location and bank-payment payloads, and draw barcodes (EAN-13, UPC, Code 128, Data Matrix, PDF417, Aztec and more).

No account or API key is needed.

## Install

Claude Code:

```text
/plugin marketplace add qrdxinc/qrdx
/plugin install qrdx@qrdx
```

GitHub Copilot CLI:

```bash
copilot plugin marketplace add qrdxinc/qrdx
copilot plugin install qrdx@qrdx
```

Codex:

```bash
codex plugin marketplace add qrdxinc/qrdx
codex plugin add qrdx@qrdx
```

Gemini CLI installs the repository as an extension with the same MCP server and skill:

```bash
gemini extensions install https://github.com/qrdxinc/qrdx
```

## What it runs and what it sends

- **The skill runs `npx @qrdx/cli@0.0.10`.** npx downloads that exact version of the CLI from the npm registry the first time, and it needs Node.js 22 or later. The code is drawn on your machine and written to the file the agent names. The CLI sends nothing to QRdx. If the agent passes `--logo` with a URL, the CLI fetches that image.
- **The MCP server is remote.** When the agent calls one of its tools, your client sends the tool's arguments, such as the text to encode and the style, to `mcp.qrdx.dev`, which returns the code. The [privacy policy](https://qrdx.dev/legal/privacy-policy) covers that service.
- **No keys or headers are set.** Two tools, `save_template` and `save_barcode`, save to a QRdx workspace and need an API key, which you add in your client's MCP settings yourself ([MCP docs](https://qrdx.dev/docs/developers/mcp)). Everything else works without one.

The plugin has no hooks and no scripts of its own.

## Files

| File | For |
| --- | --- |
| `.claude-plugin/plugin.json` | Claude Code manifest |
| `.mcp.json` | MCP server for Claude Code |
| `plugin.json` | [Agent Plugins](https://github.com/agentplugins/agent-plugins-spec) 1.0.0 manifest, read by Copilot CLI, Cursor and Codex; `extensions.com.openai` holds the OpenAI plugin directory's listing, review cases and release notes |
| `mcp.json` | MCP server in the Agent Plugins format |
| `skills/generate-qr/` | A copy of [`skills/generate-qr`](../../skills/generate-qr) |
| `LICENSE` | MIT |

The marketplaces that list this folder are [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json) (Claude Code) and [`.cursor-plugin/marketplace.json`](../../.cursor-plugin/marketplace.json) (Cursor) at the repository root, and the Gemini CLI manifest is [`gemini-extension.json`](../../gemini-extension.json) next to them. The OpenAI plugin directory takes a ZIP upload of `plugin.json`, `mcp.json`, `skills/` and `assets/` from this folder.

## Changing the plugin

`skills/generate-qr` is the canonical skill. After changing it, copy it here with `bun run sync:agent-plugin` from the repository root; a test fails while the two differ. Raise `version` in `plugin.json`, `.claude-plugin/plugin.json`, `gemini-extension.json` and the entry in `.cursor-plugin/marketplace.json` with every change, because Claude Code keeps people on the version they installed until it changes. For an OpenAI update, also rewrite `release_notes` under `extensions.com.openai.publication` and upload a new ZIP.

## License

MIT, like the other folders under `plugins/` (see [LICENSE](LICENSE)).
