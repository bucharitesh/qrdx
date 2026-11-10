# QRdx for Slack

The Slack app behind two QRdx features:

- **The QRdx bot.** `/qr` with a link or any text posts a QR code image in the channel, with buttons for the PNG, the SVG and the QRdx editor. Mentioning the bot answers in the thread, a direct message answers in the DM, and the **Make a QR code** message shortcut answers in the message's thread. People who link their QRdx account (`/qr link`) can make tracked (dynamic) codes with `/qr track <link>`, in the QRdx workspace they picked and under their own role and plan.
- **Alerts in a channel.** "Add to Slack" in Settings → Integrations → Slack posts scan milestones, form responses and code changes to a channel through an incoming webhook (Business plan).

Both use one Slack app, described by [`manifest.json`](manifest.json). The code is in the QRdx app: `apps/docs/lib/slack-bot` and the routes under `apps/docs/app/api/integrations/slack`. User docs: `apps/docs/content/docs/slack-bot.mdx`.

This folder holds no code to build. It isn't a pnpm package (there is no `package.json`), so pnpm, Turborepo and knip skip it.

## What the bot can see

The bot asks Slack for `commands`, `app_mentions:read`, `chat:write` and `im:history`. It reads messages only when someone runs `/qr`, mentions it, messages it directly or uses the shortcut on a message, and it never stores message text. For each Slack workspace QRdx keeps the workspace id and name, the bot's user id and its token (encrypted), and who added it. For each linked person it keeps their Slack user id, the QRdx account and the QRdx workspace. Removing the app from a Slack workspace deletes both.

QR code images come from the QRdx image API (`/v1/qr`), which Slack fetches from the link in the message; nothing is uploaded.

## Set it up

The order matters: Slack checks the Events URL when the manifest is saved, and that URL only answers once the app's signing secret is set. So the app is created first, the variables go in, and the manifest comes last.

1. At [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App → From scratch**, name it QRdx and pick a workspace. (If you already have a QRdx app for "Add to Slack" alerts, use that one instead.)
2. From **Basic Information → App Credentials**, set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_SIGNING_SECRET` in your environment (on Vercel: Production and Preview). In production also set `INTEGRATION_ENCRYPTION_KEY` (32 characters or more), which encrypts the bot tokens. The bot stays off, and its routes answer 404, until all of them are set.
3. Apply `packages/database/manual-sql/2026-11-10-slack-bot.sql` to the database, or run `pnpm db:push` against your own database.
4. Deploy (or restart) so the new variables are live.
5. Open **App Manifest**, paste [`manifest.json`](manifest.json) and save. When self-hosting, first replace every `https://qrdx.dev` in it with your app's URL (`NEXT_PUBLIC_APP_URL`); the request URLs must be reachable over HTTPS. If Slack says the Events URL isn't verified, open **Event Subscriptions** and click **Retry**.
6. To let other Slack workspaces add the app, open **Manage Distribution** and click **Activate Public Distribution**.
7. Sign in to QRdx and click **Add the bot to Slack** in Settings → Integrations → Slack, then try `/qr https://qrdx.dev`, a mention of the bot, a direct message, **Make a QR code** on a message, `/qr link`, and `/qr track` with a link.

Slack workspaces that added the app for alerts before the bot existed keep their alerts; the bot's commands appear there once someone adds the bot. If you change the app's scopes, events or URLs later, add the bot to Slack again from the same page so Slack applies them.

## License

[MIT](LICENSE).
