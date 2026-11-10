# QRdx for Discord

A Discord app that makes QR codes:

- `/qr content:<link or text>` replies with the QR code as an image, with **Download PNG**, **Download SVG** and **Open in editor** buttons. Add `private:True` and only you see it. The optional `look`, `color` and `frame` options style it, and **Look**, **Color**, **Frame** and **Logo** menus under the reply restyle it in place for the person who made it. Every styled code passes the editor's scan check first, and **Open in editor** opens the same design.
- **Apps → Make QR code** on any message makes a code of the first web address in it, or of its text when there's no link.

It works when it's added to a server and when someone adds it to their own account, so it also works in DMs and group DMs. It needs no QRdx account, and QRdx doesn't save the codes it makes. The user guide is [Make QR codes in Discord](https://qrdx.dev/docs/discord-bot).

## How it works

Discord sends each command to the QRdx web app as an HTTP request (an "interaction"). There's no bot process to run and no gateway connection, so it works on serverless hosting.

| File | What it does |
| --- | --- |
| `apps/docs/app/api/integrations/discord/interactions/route.ts` | The Interactions Endpoint URL. Checks Discord's Ed25519 signature on the raw body (401 when it doesn't match), answers PING, rate limits each Discord user and replies within Discord's 3 seconds. A styled code needs its scan check first, so for those the endpoint answers "thinking" and edits the reply in through the interaction's own webhook (`PATCH /webhooks/<application id>/<interaction token>/messages/@original`), which needs no bot token |
| `apps/docs/lib/chat-bots/discord/` | The commands (`commands.json`), the signature check, the replies and the follow-up edit (`followup.ts`) |
| `apps/docs/lib/chat-bots/styles.ts` | Shared with the other chat bots: the looks, colors, frames and logos on offer, and the scan check |
| `apps/docs/lib/chat-bots/qr-reply.ts` | Shared with the other chat bots: reads the content and builds the image and editor links |
| `apps/docs/app/api/integrations/discord/install/route.ts` | **Add to Discord**: redirects to `https://discord.com/oauth2/authorize?client_id=<DISCORD_APPLICATION_ID>` |
| `scripts/register-commands.mjs` | Registers `commands.json` as the app's global commands |

The reply is an embed whose image is a link to the keyless image API (`/v1/qr?data=…&format=png&size=1024`, plus `style` and `logoIcon` for a styled code), which Discord loads itself. A pick in a menu reads the content and design back from that link and the maker's id from the menu, so QRdx doesn't save the code to restyle it. Replies set `allowed_mentions` to nothing, so content can't ping anyone.

The web app needs only the application id and public key. The bot token is used by the registration script and never by the app.

## Set it up

You need a Discord account and a deployed QRdx (qrdx.dev, or your own) that Discord can reach over HTTPS. Do the steps in this order: Discord checks the endpoint as soon as you save it, and the check only passes once the app knows the public key.

1. **Create the app.** Open the [Discord developer portal](https://discord.com/developers/applications), click **New Application** and name it QRdx (or whatever people should see in Discord).
2. **Copy the ids.** On **General Information**, copy the **Application ID** and the **Public Key**. Fill in the description, app icon, and the **Terms of Service URL** and **Privacy Policy URL** (`https://qrdx.dev/legal/terms-of-service` and `https://qrdx.dev/legal/privacy-policy` on qrdx.dev).
3. **Set the environment variables** on the web app and redeploy it. On Vercel, add both to **Production** and **Preview**:

   ```bash
   DISCORD_APPLICATION_ID=<Application ID>
   DISCORD_PUBLIC_KEY=<Public Key>
   ```

   With both set, the bot's endpoint answers, the **Discord bot** entry appears in the integrations directory with **Add to Discord**, and its docs page joins the navigation.
4. **Set the install options.** On **Installation**, tick both **User Install** and **Guild Install**, choose **Discord Provided Link**, and under **Default Install Settings** give both of them the `applications.commands` scope. The app doesn't need the `bot` scope, any permissions or any privileged gateway intents. On **Bot**, leave **Public Bot** on so other people can add it.
5. **Register the commands.** On **Bot**, click **Reset Token** and copy the token. From the repository root, with Node 22:

   ```bash
   DISCORD_APPLICATION_ID=<Application ID> DISCORD_BOT_TOKEN=<token> node plugins/discord/scripts/register-commands.mjs
   ```

   It prints each command it registered. Run it again whenever `apps/docs/lib/chat-bots/discord/commands.json` changes. Keep the token out of the web app's environment and out of git; reset it in the portal if it leaks.
6. **Set the Interactions Endpoint URL.** On **General Information**, set it to `https://<your app host>/api/integrations/discord/interactions` (`https://qrdx.dev/api/integrations/discord/interactions` for qrdx.dev) and save. Discord sends a signed PING and some badly signed requests; the save goes through only when the endpoint answers the PING and refuses the rest.
7. **Try it.** Open `https://<your app host>/api/integrations/discord/install` (or the install link on **Installation**). Add the app to a test server, then add it to your own account too. In each, try `/qr` with a link, `/qr` with text and `private:True`, `/qr` with a `look`, a pick in the menus under a code, and **Apps → Make QR code** on a message with a link and on one without.

If a command doesn't show up straight away, reload Discord (Ctrl+R or Cmd+R).

Once the app is in 75 servers, Discord asks you to verify it before it can join more than 100.

## Remove it

Clear the Interactions Endpoint URL in the developer portal, or delete the app. Unset `DISCORD_APPLICATION_ID` and `DISCORD_PUBLIC_KEY` and redeploy: the endpoint and install link then answer 404, and the directory entry and docs page are hidden again.

## License

MIT, like the other folders under `plugins/` (see [LICENSE](LICENSE)). The web app that answers the commands is under the repository's AGPL-3.0-or-later license.
