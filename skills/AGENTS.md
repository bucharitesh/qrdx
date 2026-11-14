# AGENTS.md

Guidance for coding agents working in `skills/`. The repository-wide rules are in [`../AGENTS.md`](../AGENTS.md).

## What lives here

Agent Skills for QRdx, in the open [Agent Skills](https://agentskills.io/specification) format. A skill is a folder with a `SKILL.md`: YAML frontmatter that tells an agent when to load it, then the instructions it follows. Skill indexes such as skills.sh and SkillsMP read these folders straight from GitHub, so whatever is merged here is what they list.

```
skills/
  {skill-name}/       # kebab-case, same as the name in the frontmatter
    SKILL.md          # required
    LICENSE           # the skill's license
  {skill-name}.zip    # the folder, packaged for claude.ai uploads
```

## Frontmatter

Use only the keys the spec allows: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Validators reject anything else.

- `name`: the folder name, lowercase letters, numbers and hyphens.
- `description`: what the skill does and when to use it, with trigger phrases. Say "QRdx" in it so keyword searches find it. At most 1024 characters.
- `license`: `MIT`, with the full text in the folder's `LICENSE`.
- `compatibility`: what the skill needs to run, such as the Node.js version and network access.
- `metadata`: string values only. The skill's own version goes here as `version: "x.y.z"`; bump it when the skill changes.

Check a skill with the reference validator:

```bash
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" skills-ref validate skills/generate-qr
```

## Rules

- **Pin the CLI version.** Every command runs `npx @qrdx/cli@<version>`, never a bare `npx @qrdx/cli` or `@latest`. Security scanners and directories fail unpinned launchers. To move the pin, run `npm view @qrdx/cli version`, check every flag and value list in `SKILL.md` against that version's `--help` (and by generating a code), then change the version in every command here and in `README.md`.
- **Only document what the pinned version does.** Flags and values that exist in `packages/cli/src` but aren't published yet don't belong in the skill.
- **No secrets in examples.** Use placeholders such as `<password>` for Wi-Fi passwords, tokens and keys, and tell the agent not to repeat secrets back to the user.
- **No helper scripts that write outside the output file.** The skill runs the CLI directly.
- **Rebuild the zip whenever a skill changes**, from inside `skills/`, without macOS metadata:

  ```bash
  cd skills && rm -f generate-qr.zip && zip -r -X generate-qr.zip generate-qr -x '*.DS_Store'
  ```

- **Resync the agent plugin's copy whenever `generate-qr` changes.** `plugins/agent/skills/generate-qr` is a real copy, because plugin directories refuse symlinks. This folder stays the source, since the skill indexes link to it. From the repository root, run `bun run sync:agent-plugin` (`scripts/sync-agent-plugin.mjs`); `apps/app/tests/repo/agent-plugin.test.ts` fails while the copy differs. Then raise `version` in `plugins/agent/plugin.json`, `plugins/agent/.claude-plugin/plugin.json`, `gemini-extension.json` and the plugin entry in `.cursor-plugin/marketplace.json`, so installed plugins pick up the change.
