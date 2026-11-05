# Agent Skills

Skills for AI coding agents that work with QRdx. A skill is a set of instructions and scripts an agent loads when a task needs it. These follow the [Agent Skills](https://agentskills.io/) format.

## generate-qr

Generates styled, scannable QR codes as SVG or PNG with [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli). It works for URLs, plain text, Wi-Fi credentials, vCards and any other string.

Agents pick it up for requests like:

- "Create a QR code for this URL"
- "Generate a Wi-Fi QR code"
- "Make a QR for my contact card"
- "Build a branded QR with our colors and logo"
- "Batch generate QR codes for these links"
- QR generation in a CI/CD or content pipeline

What it covers:

- SVG and PNG output
- The body, eye and corner dot patterns of the CLI on npm, listed in [`SKILL.md`](generate-qr/SKILL.md)
- Solid colors and linear or radial gradients, with separate eye and dot colors
- Decorative templates: `Arrow`, `StandardBox`, `SquareBorder`, `StrikedBox`, `Halloween`
- A center logo, with the modules behind it cleared
- Error correction levels L, M, Q and H
- Non-interactive runs that are safe in scripts; invalid flags exit with code 1

### Install

```bash
# Claude Code
cp -r skills/generate-qr ~/.claude/skills/

# claude.ai
# Add generate-qr.zip as a project attachment, or paste SKILL.md into the conversation
```

The skill runs `npx @qrdx/cli`, which installs the CLI from npm on first use. npm has 0.0.4 today, which needs Node.js 18 or later. The repo's 0.0.5 (EPS output, frames and every current pattern) isn't published yet, so the skill sticks to what 0.0.4 does.

For styles the CLI on npm doesn't have yet, an agent can use the keyless [image API](https://qrdx.dev/docs/developers/image-api) or the [MCP server](https://qrdx.dev/docs/developers/mcp) instead.

## Skill structure

Each skill has:

- `SKILL.md`: the instructions for the agent
- `scripts/`: helper scripts (optional)

## License

[AGPL-3.0-or-later](../LICENSE), like the rest of this repository outside the MIT folders listed in [LICENSING.md](../LICENSING.md).
