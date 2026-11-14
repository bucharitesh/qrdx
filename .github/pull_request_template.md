<!--
Target the `staging` branch, not `main`. Changes collect on staging, and a
release pull request from staging to main ships them to qrdx.dev.
-->

Closes #

<!-- The issue this closes, for example "Closes #123". Delete the line if there isn't one. -->

## What changes and why
<!-- 2-4 lines: what this PR changes and the problem it solves. -->

## How it was tested
<!-- Commands you ran, pages you checked, and what you saw. -->

## Breaking changes
<!-- Anything that changes the public API of `qrdx` or `@qrdx/cli`, the REST API, the database schema or the self-hosting setup, with migration steps. Write "None" if there aren't any. -->

## Screenshots
<!--
For UI changes: before and after at 1440 px and 390 px wide, in light and dark
mode. Delete this section if the PR doesn't change the UI.
Keep secrets out of screenshots and logs: no tokens, cookies, `.env` values or
private codes (anyone can scan a QR code in a screenshot).
-->

| | Before | After |
| --- | --- | --- |
| 1440, light | | |
| 1440, dark | | |
| 390, light | | |
| 390, dark | | |

## Checklist
- [ ] This PR targets `staging`
- [ ] `bun run typecheck` and `bun run typecheck:app` pass
- [ ] `bun run prepush` passes (it also runs on `git push`)
- [ ] `bun x ultracite check <files>` is clean for the files I changed
- [ ] Docs or READMEs are updated if behavior or public APIs changed
- [ ] Schema changes, if any, are additive: new columns are nullable or have a default, nothing is dropped or renamed
- [ ] No secrets, tokens, cookies or `.env` values in the code, screenshots or logs
