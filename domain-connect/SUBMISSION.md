# One-click DNS setup: what the owner needs to do

The Domains page can show a **Set up with Cloudflare** button (named after whichever DNS provider hosts the customer's domain) for a domain that's waiting for DNS. It uses [Domain Connect](https://www.domainconnect.org), the open standard Cloudflare, GoDaddy, IONOS and others implement: the customer approves the change at their provider, the provider adds the records, and QRdx checks DNS when they come back.

The code is built and tested. The button stays hidden until every step below is done. The app checks each piece itself (signing key published, template enabled at the provider), so there's nothing to switch off in the meantime and no button that leads to an error.

Files in this folder:

| File | What it is |
| --- | --- |
| `qrdx.dev.qrdx.json` | The template: provider id `qrdx.dev`, service id `qrdx` |
| `keys.mjs` | Generates the signing key, prints its DNS records, checks them, makes signed test links |
| `logo.svg` | The QRdx mark, for Cloudflare's consent screen |

Order: **1 → 2 → 3 → 4 → 5**. Step 3 (the pull request) can start right away; Cloudflare only onboards merged templates.

## 1. Generate the signing key

Cloudflare only accepts signed requests. From the repository root:

```bash
node --experimental-strip-types domain-connect/keys.mjs generate ~/qrdx-domain-connect.pem
```

This writes a new RSA 2048 private key to that file (it refuses to write inside the repository) and prints the TXT records for step 2. Store the file in your password manager. It's the only copy, and anyone holding it can sign setup links as QRdx.

## 2. Publish the public key on qrdx.dev

In the Cloudflare dashboard, open **qrdx.dev → DNS → Records** and add one **TXT** record per line that step 1 printed:

- **Name:** `_dck1`
- **Content:** the whole line, starting with `p=1,a=RS256,d=` (then `p=2,…` as a second record)
- **TTL:** Auto

The template says `syncPubKeyDomain: qrdx.dev` and the app signs with `key=_dck1`, so providers look for the key at `_dck1.qrdx.dev`. The `*` wildcard record doesn't get in the way: an explicit record always wins. Check it:

```bash
node --experimental-strip-types domain-connect/keys.mjs check ~/qrdx-domain-connect.pem
# The key published at _dck1.qrdx.dev matches /Users/you/qrdx-domain-connect.pem.
```

## 3. Open the pull request to Domain-Connect/Templates

Rules: the repository's [README](https://github.com/Domain-Connect/Templates/blob/master/README.md) and [PR template](https://github.com/Domain-Connect/Templates/blob/master/.github/pull_request_template.md).

1. Fork <https://github.com/Domain-Connect/Templates> and add `qrdx.dev.qrdx.json` at the root, unchanged (the file name must be `providerId.serviceId.json`).
2. **Test it in the Online Editor (required: PRs without editor links aren't reviewed):** <https://domainconnect.paulonet.eu/dc/free/templateedit>. Paste the template, click **Check template**, then run **Test apply template** three times with domain `example.com` and host `go`:
   - group `route`, `target` = `cname.vercel-dns.com`
   - groups `route,vercel`, `target` = `cname.vercel-dns.com`, `vercel` = `go.example.com,abc123`
   - groups `route,qrdx`, `target` = `qr.example.org`, `token` = `0123456789abcdef0123456789abcdef`

   After each, click **Copy Markdown** and keep the link. No apex test is needed: the template sets `hostRequired`, which the PR template names as the exception.
3. Commit with the message `add QRdx, QRdx custom domain` (their format: `add <providerName>, <serviceName>`).
4. Open the PR with the description below. Paste your three editor links where it says so. Don't open it without them.

The linter checks are already done (dc-template-linter version 131, run on this exact file):

| Check | Command | Result |
| --- | --- | --- |
| Full check (CI must pass) | `dc-template-linter -tolerate warn qrdx.dev.qrdx.json` | exit 0, no findings |
| Fast track (automerge label) | `dc-template-linter -merge-or-fail qrdx.dev.qrdx.json` | exit 0, no findings |
| Cloudflare rules | `dc-template-linter -cloudflare qrdx.dev.qrdx.json` | exit 0; 7 info notes, all about fields Cloudflare ignores (see step 4) |
| Logo reachable | `dc-template-linter -logos qrdx.dev.qrdx.json` | exit 0 |
| JSON schema | `template.schema` from Domain-Connect/spec | valid |

Passing `-merge-or-fail` means the PR should get the `automerge-possible` label, which the README says gets PRs "approved and merged much faster". No timeline is published. If you change the template, re-run the linter (`go install github.com/Domain-Connect/dc-template-linter@latest`) and the app's tests, and raise `version` once it has been merged.

### PR description (copy this)

```markdown
# Description

QRdx (https://qrdx.dev) is an open-source QR code platform. Customers serve their dynamic QR codes' short links from their own subdomain, for example go.example.com. This template points that subdomain at QRdx and adds the ownership TXT record when one is needed:

- group `route`: CNAME on the host to `%target%`
- group `vercel`: Vercel's ownership TXT, `_vercel` on the zone apex, only when Vercel asks for one
- group `qrdx`: `_qrdx-challenge` TXT used by self-hosted QRdx

Requests are signed (`syncPubKeyDomain` qrdx.dev, key `_dck1`).

## Type of change

- [x] New template
- [ ] Bug fix (non-breaking change which fixes an issue in the template)
- [ ] New feature (non-breaking change which adds functionality to the template)
- [ ] Breaking change (fix or feature that would cause existing template behavior to be not backward compatible)

# How Has This Been Tested?

- [x] Template functionality checked using [Online Editor](https://domainconnect.paulonet.eu/dc/free/templateedit)
- [x] Template file name follows the pattern `<providerId>.<serviceId>.json`
- [x] resource URL provided with `logoUrl` is actually served by a webserver

`dc-template-linter -merge-or-fail` and `dc-template-linter -tolerate warn` both exit 0 with no findings.

# Checklist of common problems

- [x] `syncPubKeyDomain` is set
- [x] `warnPhishing` is **not** set alongside `syncPubKeyDomain`
- [x] `syncRedirectDomain` is set whenever the template uses `redirect_uri` in the synchronous flow
- [x] no TXT record contains SPF content
- [x] `txtConflictMatchingMode` is set on every TXT record that must be unique per label or content prefix: `_qrdx-challenge` uses `Prefix` with `qrdx-verify=`. `_vercel` is deliberately left at the default (None), because one zone can hold several Vercel verification values, one per subdomain.
- [x] no variable is used as a bare full record value, except `pointsTo: "%target%"` (justified below)
- [x] no bare variable is used as the full `host` label
- [x] no variable is used in the `host` field to create a subdomain: the template is applied with the `host` parameter
- [x] `%host%` does not appear explicitly in any `host` attribute
- [x] `essential` is set to `OnApply` on both TXT records: they're only needed until the domain is verified, so users may remove them later

**Why `pointsTo` is a bare `%target%`:** Vercel gives each project its own CNAME target (`cname.vercel-dns.com` or a project-specific `<id>.vercel-dns-0NN.com`), and self-hosted QRdx points at the operator's own server, so the target has no fixed suffix. Every request is signed with the key at `_dck1.qrdx.dev`, so only QRdx can produce a link with a given target.

**Why one host is absolute (`_vercel.%domain%.`):** Vercel checks ownership with a TXT record at `_vercel` on the zone apex, not under the subdomain, and its value names the subdomain (`vc-domain-verify=go.example.com,<code>`). The trailing dot writes it at the apex while the CNAME stays on the host. It's only applied with `groupId=vercel`, when Vercel asks for it.

## Online Editor test results

**Editor test link(s):**

(Paste the three "Copy Markdown" links from step 2 here: groups route; route,vercel; route,qrdx. hostRequired is true, so there is no apex test.)
```

## 4. Email Cloudflare

Once the PR is merged, write to `domain-connect@cloudflare.com` ([Cloudflare's instructions](https://developers.cloudflare.com/dns/reference/domain-connect/)). Attach `domain-connect/logo.svg`.

> **Subject:** Domain Connect onboarding: QRdx (qrdx.dev)
>
> Hello,
>
> We'd like to onboard our Domain Connect template for the synchronous flow.
>
> 1. Template: qrdx.dev / qrdx, https://github.com/Domain-Connect/Templates/blob/master/qrdx.dev.qrdx.json
> 2. syncPubKeyDomain TXT records: `_dck1.qrdx.dev` (requests use `key=_dck1`)
> 3. Logo: attached (SVG), also served at https://qrdx.dev/favicon.svg
> 4. Default proxy status: **DNS only (not proxied)** for the CNAME. The domain is served by Vercel, which issues its TLS certificate.
> 5. Test account: (your Cloudflare account ID, from the dashboard's account home). We discover DNS providers automatically, so please expose the template to that account first; we'll confirm once it works.
>
> Thank you,
> Ritesh, QRdx

What Cloudflare does with the template, from their docs: only the synchronous flow; the signature is required and must be the last query parameter (the app does that); `state`, `syncRedirectDomain`, `hostRequired`, `essential` and TXT conflict matching are ignored (those are the seven linter notes; the generic rules still want them set). Cloudflare publishes no onboarding time. After onboarding, template changes are picked up automatically, usually within eight hours.

## 5. Set the environment variables

In Vercel, **qrdx → Settings → Environment Variables**, Production:

| Variable | Value |
| --- | --- |
| `DOMAIN_CONNECT_PROVIDER_ID` | `qrdx.dev` |
| `DOMAIN_CONNECT_SERVICE_ID` | `qrdx` |
| `DOMAIN_CONNECT_PRIVATE_KEY` | The whole PEM file from step 1, `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----`. Mark it Sensitive. Line breaks may be real newlines or `\n`. |

Then redeploy: availability is read when the app starts, and the docs section appears on the next deploy.

- The button also needs custom domains to work on Vercel (`VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID`), which still wait on the Vercel API token.
- Setting the variables before Cloudflare onboards is safe: until Cloudflare's API reports the template as supported, no button appears.
- If the key in DNS and the variable don't match, no button appears and the logs say `The Domain Connect public key at _dck1.qrdx.dev doesn't match DOMAIN_CONNECT_PRIVATE_KEY`. `keys.mjs check` tells you which side is wrong.
- The admin health page (`/admin/health`, configuration) lists "One-click DNS setup (Domain Connect)", whether it's on and which variables it reads.

## Testing while Cloudflare limits the template to your account

The app shows the button only once Cloudflare's discovery API lists the template, which may not happen while it's limited to your test account. To test before that, add a subdomain of a zone in that account on the Domains page, then make a signed link from the records it shows:

```bash
node --experimental-strip-types domain-connect/keys.mjs url ~/qrdx-domain-connect.pem \
  --domain yourzone.com --host go --target cname.vercel-dns.com
# add --vercel "go.yourzone.com,<code>" when the page also shows a _vercel TXT record
# (the value after vc-domain-verify=)
```

Open the link while signed in to Cloudflare and approve. Cloudflare sends you back to the Domains page; click **Verify**. Links from the page itself include the domain, so they verify on their own.

## Other DNS providers (later, optional)

The app needs no change for more providers: discovery finds each domain's provider from its `_domainconnect` record, and the button appears once that provider's API says the template is enabled. Each provider onboards separately. These are listed on [domainconnect.org](https://www.domainconnect.org/dns-providers/) with their contacts: IONOS (`domain_connect_admin@domain.ionos.com`), GoDaddy (`domainconnect@godaddy.com`), NameSilo (`domainconnect@namesilo.com`), Plesk (`domainconnect@plesk.com`), Vercel (`domainconnect@vercel.com`), WordPress.com (`registrar@automattic.com`), FENO (`kontakt@feno.no`), Glauca Digital (`hello@glauca.digital`), Simply.com (contact form) and Domain Chief. That page doesn't say which ones run the synchronous flow. The app reads it from each provider's settings (`urlSyncUX`), so a provider without it simply never gets a button.

## Rotating the key

The key id `_dck1` is fixed in the app (`SIGNING_KEY_ID` in `apps/docs/lib/domain-connect/template.ts`). To rotate, generate a new key, then replace the `_dck1` TXT records and `DOMAIN_CONNECT_PRIVATE_KEY` together and redeploy. Between those two changes the app sees a mismatch and hides the button, so nobody gets a link that fails. For an overlap-free rotation, publish the new key at `_dck2`, change `SIGNING_KEY_ID` to `_dck2` with the new variable in one deploy, then remove `_dck1`.

## How the app decides (reference)

For each domain waiting for DNS, on the Domains page, for workspace owners and admins on a plan with custom domains (code: `apps/docs/lib/domain-connect/`):

1. The published key at `_dck1.qrdx.dev` must match `DOMAIN_CONNECT_PRIVATE_KEY`.
2. Find the domain's DNS zone (the most specific parent name with an SOA record), read `_domainconnect.<zone>`, and fetch `https://<that>/v2/<zone>/settings`. That URL comes from the customer's DNS, so the server fetches it only over HTTPS on the default port, to public addresses, without redirects.
3. The provider must offer the synchronous flow, and `GET {urlAPI}/v2/domainTemplates/providers/qrdx.dev/services/qrdx` must answer 2xx.
4. The records the page shows must be ones the template can write exactly: a CNAME on a subdomain, plus Vercel's `_vercel` TXT or the `_qrdx-challenge` TXT. Root domains (A records) keep the manual table only.
5. The link is signed (RS256 over the sorted query, then `&key=_dck1&sig=…`) and returns to `/dashboard?to=settings/domains&connected=<id>` (Settings → Domains of the person's default workspace), which checks DNS right away and twice more over the next half minute.

Results are cached for up to ten minutes, and the page never waits on discovery: the button streams in.

## Sources

- Domain Connect spec, v2.3 draft rev. 67: <https://github.com/Domain-Connect/spec/blob/master/Domain%20Connect%20Spec%20Draft.adoc>
- Template schema: <https://github.com/Domain-Connect/spec/blob/master/template.schema>
- Templates repository rules: <https://github.com/Domain-Connect/Templates/blob/master/README.md>, <https://github.com/Domain-Connect/Templates/blob/master/AGENTS.md>
- Linter: <https://github.com/Domain-Connect/dc-template-linter>
- Reference implementation (signing and URL format): <https://github.com/Domain-Connect/domainconnect_python>
- Cloudflare: <https://developers.cloudflare.com/dns/reference/domain-connect/>
- DNS providers: <https://www.domainconnect.org/dns-providers/>
