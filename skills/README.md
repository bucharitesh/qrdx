# Agent Skills

Skills for AI coding agents that work with QRdx. A skill is a set of instructions an agent loads when a task needs it. These follow the [Agent Skills](https://agentskills.io/) format.

## generate-qr

Generates styled, scannable QR codes with the QRdx CLI, [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli). It works for URLs, plain text, Wi-Fi credentials, vCards and any other string, and can make one code per row of a CSV file.

Agents pick it up for requests like:

- "Create a QR code for this URL"
- "Generate a Wi-Fi QR code"
- "Make a QR for my contact card"
- "Build a branded QR with our colors and logo"
- "Add a Scan me frame"
- "Make QR codes for every row of this CSV"
- QR generation in a CI/CD or content pipeline

What it covers:

- SVG, PNG, WebP and EPS output
- Every body, eye and corner dot pattern of the pinned CLI, listed in [`SKILL.md`](generate-qr/SKILL.md)
- Solid colors and linear, radial or angular gradients, with separate eye and dot colors
- Call-to-action frames with a label of up to 24 characters
- Decorative templates: `Arrow`, `StandardBox`, `SquareBorder`, `StrikedBox`, `Halloween`
- A center logo, with the modules behind it cleared
- Error correction levels L, M, Q and H
- The `batch` command: a code for every row of a CSV, with failed rows listed in `errors.csv`
- Non-interactive runs that are safe in scripts; invalid flags exit with code 1

### Install

```bash
# With the skills CLI (asks which of your agents to add it to)
npx skills add qrdxinc/qrdx --skill generate-qr

# Claude Code, by hand
cp -r skills/generate-qr ~/.claude/skills/

# claude.ai
# Upload generate-qr.zip as a custom skill in settings, or paste SKILL.md into the conversation
```

The skill also ships in the QRdx plugin, together with the [MCP server](https://qrdx.dev/docs/developers/mcp). Install the plugin instead of the bare skill to get both:

```bash
# Claude Code (inside a session)
/plugin marketplace add qrdxinc/qrdx
/plugin install qrdx@qrdx

# GitHub Copilot CLI
copilot plugin marketplace add qrdxinc/qrdx
copilot plugin install qrdx@qrdx

# Codex
codex plugin marketplace add qrdxinc/qrdx
codex plugin add qrdx@qrdx

# Gemini CLI
gemini extensions install https://github.com/qrdxinc/qrdx
```

The plugin is in [`plugins/agent`](../plugins/agent), and its [README](../plugins/agent/README.md) says what it runs and sends.

The skill runs `npx @qrdx/cli@0.0.10`, which downloads that exact version from npm on first use and needs Node.js 22 or later. The version is pinned on purpose so agents never run an unreviewed release; [`AGENTS.md`](AGENTS.md) says how to move it. Codes are rendered locally and nothing is uploaded.

For styles the CLI doesn't have, an agent can use the keyless [image API](https://qrdx.dev/docs/developers/image-api) or the [MCP server](https://qrdx.dev/docs/developers/mcp) instead.

## Skill structure

Each skill has:

- `SKILL.md`: the instructions for the agent, with spec frontmatter
- `LICENSE`: the skill's license
- `{skill-name}.zip` next to the folder: the same files packaged for claude.ai

## License

The `generate-qr` skill is [MIT](generate-qr/LICENSE), like the CLI it runs. The rest of this folder is [AGPL-3.0-or-later](../LICENSE), like the rest of this repository outside the folders listed in [LICENSING.md](../LICENSING.md).
