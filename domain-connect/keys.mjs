// QRdx Domain Connect: signing key, public key records and test links.
// Run from the repository root (Node 22; the flag lets Node read the app's
// TypeScript, and is harmless where it's already the default):
//
//   node --experimental-strip-types domain-connect/keys.mjs generate ~/qrdx-domain-connect.pem
//   node --experimental-strip-types domain-connect/keys.mjs txt ~/qrdx-domain-connect.pem
//   node --experimental-strip-types domain-connect/keys.mjs check ~/qrdx-domain-connect.pem
//   node --experimental-strip-types domain-connect/keys.mjs url ~/qrdx-domain-connect.pem \
//     --domain example.com --host go --target cname.vercel-dns.com
//
// The private key stays in its file: nothing here prints it. Steps and
// context: domain-connect/SUBMISSION.md.
import { generateKeyPairSync } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApplyUrl } from "../apps/docs/lib/domain-connect/apply-url.ts";
import {
  parseSigningKey,
  publicKeyFromTxt,
  publicKeyTxtValues,
  signQuery,
} from "../apps/docs/lib/domain-connect/signing.ts";

// Same values as apps/docs/lib/domain-connect/template.ts (SIGNING_KEY_ID)
// and domain-connect/qrdx.dev.qrdx.json.
const KEY_ID = "_dck1";
const PROVIDER_ID = "qrdx.dev";
const SERVICE_ID = "qrdx";
const CLOUDFLARE_SYNC_UX = "https://dash.cloudflare.com/domainconnect";
const DEFAULT_REDIRECT = "https://qrdx.dev/dashboard/domains";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readKey(path) {
  if (!path) fail("Give the path of the private key file (PEM).");
  const key = parseSigningKey(readFileSync(resolve(path), "utf8"));
  if (!key)
    fail(`${path} isn't an RSA private key in PEM (2048 bits or more).`);
  return key;
}

function printTxt(publicKey, providerId) {
  console.log(
    `TXT records to publish at ${KEY_ID}.${providerId} (one record per line):\n`
  );
  for (const value of publicKeyTxtValues(publicKey)) console.log(value);
}

function options(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      fail(`Expected --name value pairs, got "${name ?? ""}".`);
    }
    parsed[name.slice(2)] = value;
  }
  return parsed;
}

const [command, path, ...rest] = process.argv.slice(2);

if (command === "generate") {
  if (!path) fail("Give the path for the new private key file.");
  const out = resolve(path);
  const inside = relative(repoRoot, out);
  if (!(inside.startsWith("..") || isAbsolute(inside))) {
    fail(
      "Write the private key outside the repository, so it's never committed."
    );
  }
  if (existsSync(out)) fail(`${out} already exists; not overwriting it.`);
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  writeFileSync(out, pem, { mode: 0o600 });
  console.log(`Wrote the private key to ${out}. Keep it secret.\n`);
  printTxt(readKey(out).publicKey, PROVIDER_ID);
  console.log(
    "\nThen set DOMAIN_CONNECT_PRIVATE_KEY to that file's contents (see SUBMISSION.md)."
  );
} else if (command === "txt") {
  printTxt(readKey(path).publicKey, rest[0] ?? PROVIDER_ID);
} else if (command === "check") {
  const key = readKey(path);
  const providerId = rest[0] ?? PROVIDER_ID;
  const name = `${KEY_ID}.${providerId}`;
  let answers = [];
  try {
    answers = await new Resolver({ timeout: 5000, tries: 2 }).resolveTxt(name);
  } catch (error) {
    fail(`No TXT records at ${name} (${error.code ?? error.message}).`);
  }
  const published = publicKeyFromTxt(answers);
  if (published === key.publicKey) {
    console.log(`The key published at ${name} matches ${path}.`);
  } else {
    fail(
      published
        ? `The key published at ${name} doesn't match ${path}.`
        : `The TXT records at ${name} don't hold a complete RS256 key.`
    );
  }
} else if (command === "url") {
  const key = readKey(path);
  const flags = options(rest);
  if (!(flags.domain && flags.target)) {
    fail("Give at least --domain (the zone) and --target (the CNAME target).");
  }
  if (!flags.host) fail("Give --host: the template works on subdomains only.");
  const variables = { target: flags.target };
  const groupIds = ["route"];
  if (flags.vercel) {
    groupIds.push("vercel");
    variables.vercel = flags.vercel;
  }
  if (flags.token) {
    groupIds.push("qrdx");
    variables.token = flags.token;
  }
  console.log(
    buildApplyUrl(
      {
        urlSyncUX: flags["sync-ux"] ?? CLOUDFLARE_SYNC_UX,
        providerId: flags["provider-id"] ?? PROVIDER_ID,
        serviceId: flags["service-id"] ?? SERVICE_ID,
        domain: flags.domain,
        host: flags.host,
        groupIds,
        variables,
        redirectUri: flags.redirect ?? DEFAULT_REDIRECT,
      },
      { keyId: KEY_ID, sign: (query) => signQuery(query, key.privateKey) }
    )
  );
} else {
  fail(
    "Commands: generate <out.pem> | txt <key.pem> | check <key.pem> | url <key.pem> --domain <zone> --host <sub> --target <cname> [--vercel <value>] [--token <hex>] [--redirect <url>] [--sync-ux <url>]"
  );
}
