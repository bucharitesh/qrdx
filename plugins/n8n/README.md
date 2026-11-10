# @qrdx/n8n-nodes-qrdx

n8n nodes for [QRdx](https://qrdx.dev). The **QRdx** node makes QR code images, creates and edits dynamic QR codes, and reads their scans. The **QRdx Trigger** node starts a workflow when a code is scanned, created or changed, or when someone submits a form on a hosted page. Both work in self-hosted n8n, and the QRdx node can also be a tool for an n8n AI Agent.

Install it from npm: in n8n, open **Settings → Community Nodes**, click **Install** and enter `@qrdx/n8n-nodes-qrdx`. From the command line, run `npm install @qrdx/n8n-nodes-qrdx` in the `nodes` folder of your n8n user folder (`~/.n8n/nodes`) and restart n8n. To build it from this repository instead, see [Install from source](#install-from-source).

## Credentials

Create an API key in QRdx under **Settings → API keys & apps** ([how](https://qrdx.dev/docs/developers/api-keys)). In n8n, add a **QRdx API** credential:

| Field | Value |
| --- | --- |
| API Key | The key, starting with `qrdx_` |
| Base URL | `https://api.qrdx.dev/v1`. For a self-hosted copy of QRdx, your address followed by `/api/v1` |

The key acts on the workspace it was created in. n8n tests the credential with `GET /me`, which needs the Profile scope, so a key with full access is simplest. The operations need these scopes:

| Operations | Scope |
| --- | --- |
| Code → Get, Get Many; Scan → Get Many, Get Summary | Read codes (`codes:read`) |
| Code → Create, Update, Delete; QRdx Trigger | Manage codes (`codes:write`) |
| Theme → Get, Get Many | Themes (`themes:read`) |

QR Image → Generate needs no credential at all.

## QRdx node

| Resource | Operation | API call |
| --- | --- | --- |
| QR Image | Generate | `GET /qr`, no key |
| Code | Create | `POST /codes` |
| Code | Get | `GET /codes/{id}` |
| Code | Get Many | `GET /codes`, paged with `limit` and `offset` |
| Code | Update | `PATCH /codes/{id}` |
| Code | Delete | `DELETE /codes/{id}` |
| Scan | Get Many | `GET /codes/{id}/scans`, paged with `nextBefore` |
| Scan | Get Summary | `GET /codes/{id}/scans` without individual scans |
| Theme | Get | `GET /themes/{id}` |
| Theme | Get Many | `GET /themes` |

**QR Image → Generate** returns the image as binary data (PNG, WebP, SVG or EPS) in the field you name, `data` by default, so you can attach it to an email or upload it somewhere. Its options cover size, foreground, background, eye and eye dot colors, body, eye and eye dot shapes, error correction, margin, a call-to-action frame with its label, and a center logo icon. The item's JSON also has `url`: the same image as a keyless link you can put in an `<img>` tag.

**Code → Create** makes a dynamic code: a short link that redirects to the destination URL. Point it somewhere else later with **Update** and printed codes keep working. Update also archives and restores codes. Some fields depend on the plan: a custom back-half needs Pro or Business, and a custom domain needs Pro. When the plan doesn't include a field, QRdx refuses the request and the node shows QRdx's message.

**Get Many** operations have **Return All** and **Limit**, and page through the API for you. **Scan → Get Many** returns one item per scan, newest first, with its time, country, region, city, device type, OS, browser and referrer. How far back it goes depends on how long the plan keeps analytics.

Errors from QRdx come through with QRdx's own message, and the description lists the field problems, the error code and a link to the docs page about it. The full list of codes is at [qrdx.dev/docs/developers/errors](https://qrdx.dev/docs/developers/errors).

## Trigger

**QRdx Trigger** subscribes to QRdx's REST hooks when you activate the workflow (`POST /hooks`) and unsubscribes when you deactivate it (`DELETE /hooks/{id}`). The subscription also shows in QRdx under **Settings → Webhooks**.

| Event | When |
| --- | --- |
| Scans (`scan.created`) | Codes are scanned. Deliveries are batched: one a minute with up to 100 scans and the exact `count` |
| Scan Milestones (`scan.milestone`) | A code's first scan, then 10, 100, 500, 1,000, 5,000, 10,000 scans and beyond |
| New Codes (`code.created`) | A dynamic code is created |
| Code Changes (`code.updated`) | A code's destination, title, design or domain changes |
| Form Submissions (`form.submitted`) | Someone submits a form on a hosted page |

Every delivery is checked against its `X-QRdx-Signature` header with the signing secret QRdx returned when the node subscribed. Deliveries with a missing or wrong signature, or a timestamp more than five minutes off, get `401` and don't start the workflow.

Options:

- **Output One Item per Scan** splits a Scans delivery into one item per scan.
- **Include Test Events** starts the workflow for the `ping` QRdx sends when you click **Send test** on the endpoint in Settings → Webhooks.

Webhooks are part of QRdx's Business plan; on other plans activating the trigger fails with QRdx's `PLAN_REQUIRED` message. QRdx only delivers to public `https://` addresses, so n8n must be reachable at one (set `WEBHOOK_URL` if n8n runs behind a proxy). The test URL n8n uses while you click **Listen for test event** has to be public too.

If you'd rather not install a package, point an n8n Webhook node at a QRdx webhook endpoint instead: [qrdx.dev/docs/webhooks](https://qrdx.dev/docs/webhooks).

## Install from source

You need Node.js 22 and [Bun](https://bun.com/docs/installation). In a clone of this repository:

```bash
bun install
bun run --filter @qrdx/n8n-nodes-qrdx build
cd plugins/n8n
bun pm pack
```

That writes `qrdx-n8n-nodes-qrdx-0.1.1.tgz`. Install it in the `nodes` folder of your n8n user folder and restart n8n:

```bash
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install /path/to/qrdx-n8n-nodes-qrdx-0.1.1.tgz
```

With Docker, copy the file into the container and run the same commands inside it (`docker exec -it n8n sh`). Search for **QRdx** in the nodes panel.

n8n Cloud only runs community nodes that n8n has verified, and this one isn't verified yet.

## Development

```bash
bun run --filter @qrdx/n8n-nodes-qrdx build       # tsc to dist/, then copies the icons
bun run --filter @qrdx/n8n-nodes-qrdx lint        # n8n's community node lint rules
bun run --filter @qrdx/n8n-nodes-qrdx test        # lint, then the unit tests
bun run --filter @qrdx/n8n-nodes-qrdx typecheck
```

The tests use fake n8n contexts and never call the network. The lint config is the one `n8n-node lint` from [`@n8n/node-cli`](https://www.npmjs.com/package/@n8n/node-cli) uses, written out in `eslint.config.mjs` so the monorepo doesn't install the whole CLI (about 550 MB of packages). The package keeps the CLI's layout, so its commands work here too.

To try changes in a real n8n, run `npx @n8n/node-cli dev` in this folder. It compiles in watch mode, links the package into its own n8n user folder and starts n8n at `http://localhost:5678` (it needs Docker or Podman for that). To use an n8n you already run, pass `--external-n8n --custom-user-folder <the folder that holds .n8n>` and start that n8n with `N8N_DEV_RELOAD=true`.

The dropdown values (shapes, frames, events, scan ranges) are copied from QRdx's OpenAPI document. `apps/docs/tests/plugins/n8n-node.test.ts` fails when they drift from the API.

## Publishing

For the maintainer:

1. `.github/workflows/publish.yml` publishes this package from `main` with npm Trusted Publishing and a provenance statement, in its own job, whenever the `version` in `package.json` isn't on npm yet. A failed n8n publish never blocks `qrdx` or `@qrdx/cli`; re-run the workflow (it can be started by hand) once the cause is fixed.
2. One-time setup on npmjs.com: on `@qrdx/n8n-nodes-qrdx` → Settings → Trusted publishing, add GitHub Actions with user `bucharitesh`, repository `qrdx` and workflow `publish.yml`. The package has to exist first, so its first version (0.1.0) was published by hand.
3. Submit a version that CI published in the [n8n Creator Portal](https://creators.n8n.io/nodes). n8n only verifies versions published from GitHub Actions with provenance, and checks them with `npx @n8n/scan-community-package @qrdx/n8n-nodes-qrdx`, which you can run yourself first.

The package was first published unscoped as `n8n-nodes-qrdx` 0.1.0. Use `@qrdx/n8n-nodes-qrdx` instead; the unscoped name gets no new versions.

Bump `version` in `package.json` and add a line to `CHANGELOG.md` for each release.

## License

MIT, see [LICENSE](LICENSE). QRdx itself is AGPL-3.0; the QRdx name and logo are trademarks ([TRADEMARK.md](../../TRADEMARK.md)).
