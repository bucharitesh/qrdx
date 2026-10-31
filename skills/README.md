# Agent Skills

Skills for AI coding agents that work with QRdx. Skills are packaged instructions and scripts that extend agent capabilities.

Skills follow the [Agent Skills](https://agentskills.io/) format.

## Available Skills

### generate-qr

Generate styled, scannable QR codes as SVG or PNG using [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli). Supports URLs, plain text, Wi-Fi credentials, vCards, and any string payload.

**Use when:**
- "Create a QR code for this URL"
- "Generate a Wi-Fi QR code"
- "Make a QR for my contact card"
- "Build a branded QR with our colors and logo"
- "Batch generate QR codes for these links"
- Automating QR generation in a CI/CD or content pipeline

**Features:**
- SVG (vector, scalable) and PNG (raster) output
- 9 body dot patterns, 9 corner eye patterns, 11 corner dot patterns
- Solid colors and linear/radial gradients (foreground, background, eye and dot overrides)
- Decorative templates: `Arrow`, `StandardBox`, `SquareBorder`, `StrikedBox`, `Halloween`
- Center logo support with module excavation
- Error correction levels L / M / Q / H
- Fully non-interactive — safe for scripts and agent workflows; invalid flags fail fast with exit code 1

**Installation:**

```bash
# Claude Code
cp -r skills/generate-qr ~/.claude/skills/

# claude.ai
# Add generate-qr.zip as a project attachment, or paste SKILL.md into the conversation
```

The skill runs `npx @qrdx/cli`, so it needs Node.js 18+ and network access to npm on first use.

## Skill Structure

Each skill contains:
- `SKILL.md` - Instructions for the agent
- `scripts/` - Helper scripts for automation (optional)

## License

[AGPL-3.0-or-later](../license.md), same as the rest of this repository.
