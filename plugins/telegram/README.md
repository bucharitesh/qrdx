# QRdx Telegram bot

The QRdx bot makes QR codes in Telegram. People send it a link or text in a private chat, call it inline from any chat by typing its username, or send `/qr` in a group. No QRdx account is needed and nothing is stored.

The bot runs inside the QRdx app (`apps/docs`), so there's nothing to deploy from this folder. It holds the setup script that registers the bot with Telegram. The user guide is the [Telegram bot docs page](https://qrdx.dev/docs/telegram-bot).

## How it works

- Telegram sends each update to `POST /api/integrations/telegram/webhook` with the webhook's secret in the `X-Telegram-Bot-Api-Secret-Token` header. The app compares it in constant time before it reads the body, answers `200` straight away, and sends its reply through the Bot API after that.
- A reply in a chat is a photo from the image API (`/v1/qr`, PNG) with buttons to download the PNG or SVG and to open the editor.
- An inline result is a photo too, but the Bot API only accepts JPEG there, so it comes from `GET /api/integrations/telegram/photo`, which serves the same code as a JPEG.
- Each person can send the bot 20 messages a minute and 60 inline queries a minute. Past that, the bot asks them to wait (once a minute in chats). These limits use the app's Upstash rate limiting, so they only apply where Upstash is configured.
- The code lives in `apps/docs/lib/chat-bots/telegram/` and `apps/docs/app/api/integrations/telegram/`.

## Set up a bot

You need Node.js 22 and a QRdx server that Telegram can reach over HTTPS. The same steps work for qrdx.dev and for a self-hosted server.

1. **Create the bot.** In Telegram, open [@BotFather](https://t.me/BotFather) and send `/newbot`. Give it a display name, then a username ending in `bot`. BotFather replies with the bot's token. Keep it secret: anyone with it controls the bot.
2. **Set the variables on the server** and redeploy. On Vercel, add them under Settings → Environment Variables for Production and Preview.

   | Variable | Value |
   | --- | --- |
   | `TELEGRAM_BOT_TOKEN` | The token from BotFather |
   | `TELEGRAM_WEBHOOK_SECRET` | A random string of `A-Z a-z 0-9 _ -`, for example from `openssl rand -hex 32` |
   | `TELEGRAM_BOT_USERNAME` | The username you picked, without the `@` |

   The bot is off until all three are set: its routes answer 404 and the site doesn't list it.
3. **Run the setup script** with the same three values. Keep them in a file outside the repository, or export them in your shell, and pass your server's address:

   ```bash
   node --env-file=/path/to/telegram.env plugins/telegram/scripts/setup.mjs --app-url https://qrdx.dev
   ```

   The script checks that the token belongs to `TELEGRAM_BOT_USERNAME`. Then it points the webhook at `<app url>/api/integrations/telegram/webhook` with the secret, asks only for `message` and `inline_query` updates and drops any that were waiting. It also sets the command menu (`/qr`, `/help`, `/start`) and the bot's descriptions. It never prints the token or the secret.
4. **Finish in BotFather.** The script lists what the Bot API can't change:
   - `/setinline`, pick the bot, and send the placeholder `link or text`. This turns on inline mode.
   - `/setinlinefeedback`, pick the bot, and choose Disabled.
   - Leave privacy mode on (`/setprivacy`, Enabled, the default), so in groups the bot only gets commands meant for it.
   - Optionally, `/setuserpic` for the profile photo.
5. **Try it.** Send the bot a link in a private chat. In another chat, type `@`, the bot's username and a link, then tap the result. Add the bot to a test group and send `/qr@` with its username and some text.

## Change or remove it

- **New webhook secret:** change `TELEGRAM_WEBHOOK_SECRET`, redeploy, and run the setup script again right away. Until it runs, Telegram's calls carry the old secret and get `401`, and Telegram sends them again later.
- **New token:** send `/revoke` to BotFather, put the new token in `TELEGRAM_BOT_TOKEN`, redeploy, and run the setup script.
- **Turn the bot off:** run the script with `--remove` to delete the webhook, then remove the three variables and redeploy. `/deletebot` in BotFather deletes the bot itself.

  ```bash
  node --env-file=/path/to/telegram.env plugins/telegram/scripts/setup.mjs --remove
  ```

## Limits to know about

Telegram fetches every image from QRdx, so all the bot's users share the per-IP budgets of the image API (300 requests a minute) and the JPEG route (300 a minute). Both mark their images as cacheable for good, so a CDN in front of QRdx (Vercel's, on qrdx.dev) serves a repeated image without drawing it again.

## License

MIT, like the other plugins (see [LICENSE](LICENSE)). The QRdx app the bot runs in is AGPL-3.0-or-later.
