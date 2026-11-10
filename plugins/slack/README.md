# QRdx for Slack

The Slack app behind two QRdx features:

- **The QRdx bot.** `/qr` with a link or any text posts a QR code image in the channel, with buttons for the PNG, the SVG and the QRdx editor. Mentioning the bot answers in the thread, a direct message answers in the DM, and the **Make a QR code** message shortcut answers in the message's thread. People who link their QRdx account (`/qr link`) can make tracked (dynamic) codes with `/qr track <link>`, in the QRdx workspace they picked and under their own role and plan.
- **Alerts in a channel.** "Add to Slack" in Settings → Integrations → Slack posts scan milestones, form responses and code changes to a channel through an incoming webhook (Business plan).

Both use one Slack app, described by [`manifest.json`](manifest.json). The code is in the QRdx app: `apps/docs/lib/slack-bot` and the routes under `apps/docs/app/api/integrations/slack`. User docs: `apps/docs/content/docs/slack-bot.mdx`.

This folder holds no code to build. It isn't a pnpm package (there is no `package.json`), so pnpm, Turborepo and knip skip it.

## What the bot can see

The bot asks Slack for `commands`, `app_mentions:read`, `chat:write` and `im:history`. It reads messages only when someone runs `/qr`, mentions it, messages it directly or uses the shortcut on a message, and it never stores message text. For each Slack workspace QRdx keeps the workspace id and name, the bot's user id and its token (encrypted), and who added it. For each linked person it keeps their Slack user id, the QRdx account and the QRdx workspace. Removing the app from a Slack workspace deletes both.

QR code images come from the QRdx image API (`/v1/qr`), which Slack fetches from the link in the message; nothing is uploaded.

## Set it up (qrdx.dev)

1. Open the existing Slack app at [api.slack.com/apps](https://api.slack.com/apps) (the one whose client id and secret are in `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`), go to **App Manifest**, paste [`manifest.json`](manifest.json) and save. Slack checks the event and interactivity URLs when you save, which works once the code is deployed with the variables below.
2. Copy **Basic Information → App Credentials → Signing Secret**.
3. On Vercel, set `SLACK_SIGNING_SECRET` for Production and Preview. `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `INTEGRATION_ENCRYPTION_KEY` are already set for "Add to Slack"; the bot needs all four, and stays off (its routes answer 404) until they are set.
4. Apply `packages/database/manual-sql/2026-11-10-slack-bot.sql` to the database.
5. Redeploy, then in Settings → Integrations → Slack click **Add the bot to Slack** and pick a test workspace.
6. In that workspace try `/qr https://qrdx.dev`, a mention of the bot, a direct message, **Make a QR code** on a message, `/qr link`, and `/qr track` with a link.

Slack workspaces that added the app before the bot existed keep their alerts. The bot's commands appear there once someone adds the bot (step 5).

## Self-hosting

1. At [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App → From an app manifest**, pick a workspace and paste [`manifest.json`](manifest.json) with every `https://qrdx.dev` replaced by your app's URL (`NEXT_PUBLIC_APP_URL`). The four request URLs must be reachable from the internet over HTTPS.
2. From **Basic Information → App Credentials**, set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_SIGNING_SECRET` in your environment. In production also set `INTEGRATION_ENCRYPTION_KEY` (32 characters or more), which encrypts the bot tokens.
3. Apply `packages/database/manual-sql/2026-11-10-slack-bot.sql`, or run `pnpm db:push` against your own database.
4. Restart the app, sign in, and add the bot from Settings → Integrations → Slack.

If you change the app's scopes, events or URLs later, add the bot to Slack again from the same page so Slack applies them.

## License

[MIT](LICENSE).
