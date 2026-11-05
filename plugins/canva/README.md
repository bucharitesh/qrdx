# QRdx for Canva

A [Canva app](https://www.canva.dev/docs/apps/) that adds a styled QR code to your design, built with the [`qrdx`](../../packages/qrdx) library. It isn't in Canva's app marketplace, so you run it from source as a development app.

Enter a URL or text, pick a template, dot, eye and eye-dot patterns, colors, an error correction level and an optional logo URL, then click **Add to Design**. The code goes into the design as a PNG image with alt text. **More options in the QRdx playground** opens the full editor at qrdx.dev with your link filled in, after Canva asks you to confirm.

## Run from source

You need Node.js 22, pnpm 10 and a Canva account.

1. From the root of this repository, install and build the engine, which the app imports from `packages/qrdx/dist`:

   ```bash
   pnpm install
   pnpm --filter qrdx build:inplace
   ```

2. Create an app in Canva's Developer Portal and set its development URL to `http://localhost:8080`. Canva's [quickstart](https://www.canva.dev/docs/apps/quickstart/) shows where.
3. Start the development server, which serves the app bundle on port 8080:

   ```bash
   pnpm --filter @qrdx/canva-plugin start
   ```

4. Preview the app from the Developer Portal.

`pnpm --filter @qrdx/canva-plugin build` writes the production bundle to `plugins/canva/dist/app.js`, a single file as Canva requires.

## License

[MIT](LICENSE)
