// Test only: a local identity provider for workspace SSO end-to-end runs.
// Never imported by the app. It speaks just enough OIDC (discovery,
// authorize with PKCE, token, JWKS, userinfo; RS256 ID tokens) and SAML 2.0
// (HTTP-Redirect AuthnRequest in, signed HTTP-POST Response out, via
// samlify, which @better-auth/sso already depends on).
//
//   node e2e/sso/mock-idp.mjs [port=4455]
//
// The QRdx dev server must trust its origin for OIDC (it's on localhost):
// BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4455.
//
// SAML: it only answers the QRdx app at MOCK_IDP_SP_ORIGIN (default
// http://localhost:3113). An AuthnRequest whose ACS URL is anywhere else is
// refused, and the SP metadata is fetched from that origin only.
//
// OIDC client: id "qrdx-test-client", secret "qrdx-test-secret".
// The sign-in page asks which address to sign in as. ?auto=<email> on the
// authorize/SSO URL skips the form (scripted runs). SAML extras for negative
// tests, as query parameters on the SSO URL: unsigned=1 (no signature),
// notimes=1 (no NotBefore/NotOnOrAfter).

import { execFileSync } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? 4455);
const ORIGIN = `http://localhost:${port}`;
const CLIENT_ID = "qrdx-test-client";
const CLIENT_SECRET = "qrdx-test-secret";

// samlify, resolved from the SSO plugin's own dependencies.
const here = dirname(fileURLToPath(import.meta.url));
const pluginPackage = realpathSync(
  join(
    here,
    "../../../../packages/auth/node_modules/@better-auth/sso/package.json",
  ),
);
const saml = createRequire(pluginPackage)("samlify");

// The one QRdx app this IdP serves (never taken from a request).
const SP_ORIGIN = new URL(
  process.env.MOCK_IDP_SP_ORIGIN ?? "http://localhost:3113",
).origin;
const ACS_PATH = /^\/api\/auth\/sso\/saml2\/sp\/acs\/([A-Za-z0-9_-]{1,128})$/;

/** The ACS and SP-metadata URLs for an ACS URL, on SP_ORIGIN only. */
function spEndpoints(acsUrl) {
  let parsed;
  try {
    parsed = new URL(acsUrl);
  } catch {
    throw new Error("The AuthnRequest has no valid ACS URL");
  }
  const providerId = parsed.pathname.match(ACS_PATH)?.[1];
  if (parsed.origin !== SP_ORIGIN || !providerId) {
    throw new Error(`ACS URL isn't on ${SP_ORIGIN}`);
  }
  return {
    acs: `${SP_ORIGIN}/api/auth/sso/saml2/sp/acs/${providerId}`,
    metadata: `${SP_ORIGIN}/api/auth/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`,
  };
}
saml.setSchemaValidator({ validate: () => Promise.resolve("skipped") });

// ---- keys ----
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "k1",
  alg: "RS256",
  use: "sig",
};

const certDir = mkdtempSync(join(tmpdir(), "qrdx-mock-idp-"));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "30",
    "-subj",
    "/CN=QRdx Mock IdP",
    "-keyout",
    join(certDir, "key.pem"),
    "-out",
    join(certDir, "cert.pem"),
  ],
  { stdio: "ignore" },
);
const samlKey = readFileSync(join(certDir, "key.pem"), "utf8");
const samlCert = readFileSync(join(certDir, "cert.pem"), "utf8");
export const SAML_ENTITY_ID = `${ORIGIN}/saml/metadata`;

const b64url = (input) => Buffer.from(input).toString("base64url");
function jwt(payload) {
  const header = b64url(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: "k1" }),
  );
  const body = b64url(JSON.stringify(payload));
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${header}.${body}`),
    privateKey,
  ).toString("base64url");
  return `${header}.${body}.${signature}`;
}
const subFor = (email) =>
  `sub-${createHash("sha256").update(email).digest("hex").slice(0, 16)}`;

// ---- state ----
const codes = new Map(); // code -> { email, clientId, redirectUri, challenge, nonce }
const tokens = new Map(); // access token -> email

function html(res, body, status = 200) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Mock IdP</title>
<style>body{font:15px system-ui;margin:3rem auto;max-width:28rem;color:#111}input,button{font:inherit;padding:.5rem;width:100%;box-sizing:border-box;margin:.25rem 0}button{background:#111;color:#fff;border:0;border-radius:6px}.note{color:#666;font-size:13px}</style>
</head><body>${body}</body></html>`);
}
function json(res, value, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
async function readBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data;
}

// ---- OIDC ----
function finishAuthorize(res, params, email) {
  const code = randomBytes(16).toString("hex");
  codes.set(code, {
    email,
    clientId: params.get("client_id"),
    redirectUri: params.get("redirect_uri"),
    challenge: params.get("code_challenge"),
    nonce: params.get("nonce"),
  });
  const target = new URL(params.get("redirect_uri"));
  target.searchParams.set("code", code);
  if (params.get("state"))
    target.searchParams.set("state", params.get("state"));
  res.writeHead(302, { location: target.toString() });
  res.end();
}

function token(res, form, authHeader) {
  let clientId = form.get("client_id");
  let clientSecret = form.get("client_secret");
  if (authHeader?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(authHeader.slice(6), "base64")
      .toString()
      .split(":");
    clientId = decodeURIComponent(id);
    clientSecret = decodeURIComponent(secret);
  }
  if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) {
    return json(res, { error: "invalid_client" }, 401);
  }
  const entry = codes.get(form.get("code"));
  codes.delete(form.get("code"));
  if (!entry || entry.redirectUri !== form.get("redirect_uri")) {
    return json(res, { error: "invalid_grant" }, 400);
  }
  if (entry.challenge) {
    const verifier = form.get("code_verifier") ?? "";
    const expected = createHash("sha256").update(verifier).digest("base64url");
    if (expected !== entry.challenge)
      return json(
        res,
        { error: "invalid_grant", error_description: "pkce" },
        400,
      );
  }
  const now = Math.floor(Date.now() / 1000);
  const accessToken = randomBytes(16).toString("hex");
  tokens.set(accessToken, entry.email);
  json(res, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    id_token: jwt({
      iss: ORIGIN,
      sub: subFor(entry.email),
      aud: CLIENT_ID,
      iat: now,
      exp: now + 600,
      ...(entry.nonce ? { nonce: entry.nonce } : {}),
      email: entry.email,
      email_verified: true,
      name: entry.email.split("@")[0],
    }),
  });
}

// ---- SAML ----
const idp = () =>
  saml.IdentityProvider({
    entityID: SAML_ENTITY_ID,
    privateKey: samlKey,
    signingCert: samlCert,
    singleSignOnService: [
      {
        Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
        Location: `${ORIGIN}/saml/sso`,
      },
    ],
    nameIDFormat: ["urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"],
    isAssertionEncrypted: false,
  });

async function samlRespond(res, url, email) {
  const { acs, metadata: metadataUrl } = spEndpoints(
    url.searchParams.get("acs") ?? "",
  );
  const metadata = await (await fetch(metadataUrl)).text();
  const sp = saml.ServiceProvider({ metadata });
  const provider = idp();
  const requestId = url.searchParams.get("rid");
  const now = new Date();
  const later = new Date(now.getTime() + 5 * 60 * 1000);
  const id = `_${randomBytes(16).toString("hex")}`;
  const assertionId = `_${randomBytes(16).toString("hex")}`;
  const noTimes = url.searchParams.get("notimes") === "1";
  const conditions = noTimes
    ? `<saml:Conditions><saml:AudienceRestriction><saml:Audience>${escapeHtml(sp.entityMeta.getEntityID())}</saml:Audience></saml:AudienceRestriction></saml:Conditions>`
    : `<saml:Conditions NotBefore="${now.toISOString()}" NotOnOrAfter="${later.toISOString()}"><saml:AudienceRestriction><saml:Audience>${escapeHtml(sp.entityMeta.getEntityID())}</saml:Audience></saml:AudienceRestriction></saml:Conditions>`;
  const assertion = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" Version="2.0" IssueInstant="${now.toISOString()}"><saml:Issuer>${SAML_ENTITY_ID}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${escapeHtml(email)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${later.toISOString()}" Recipient="${escapeHtml(acs)}" InResponseTo="${escapeHtml(requestId)}"/></saml:SubjectConfirmation></saml:Subject>${conditions}<saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="${assertionId}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>${escapeHtml(email)}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="displayName"><saml:AttributeValue>${escapeHtml(email.split("@")[0])}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion>`;
  let signedAssertion = assertion;
  if (url.searchParams.get("unsigned") !== "1") {
    signedAssertion = saml.SamlLib.constructSAMLSignature({
      rawSamlMessage: assertion,
      referenceTagXPath: "/*[local-name(.)='Assertion']",
      privateKey: samlKey,
      privateKeyPass: undefined,
      signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
      signingCert: provider.entityMeta.getX509Certificate("signing"),
      isBase64Output: false,
      signatureConfig: {
        prefix: "ds",
        location: {
          reference: "/*[local-name(.)='Assertion']/*[local-name(.)='Issuer']",
          action: "after",
        },
      },
    });
  }
  const response = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${escapeHtml(acs)}" InResponseTo="${escapeHtml(requestId)}"><saml:Issuer>${SAML_ENTITY_ID}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${signedAssertion}</samlp:Response>`;
  const relay = url.searchParams.get("relay") ?? "";
  html(
    res,
    `<p>Posting the SAML response to QRdx…</p>
<form method="post" action="${escapeHtml(acs)}"><input type="hidden" name="SAMLResponse" value="${Buffer.from(response).toString("base64")}"><input type="hidden" name="RelayState" value="${escapeHtml(relay)}"><noscript><button>Continue</button></noscript></form>
<script>document.forms[0].submit()</script>`,
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  try {
    if (url.pathname === "/.well-known/openid-configuration") {
      return json(res, {
        issuer: ORIGIN,
        authorization_endpoint: `${ORIGIN}/authorize`,
        token_endpoint: `${ORIGIN}/token`,
        jwks_uri: `${ORIGIN}/jwks`,
        userinfo_endpoint: `${ORIGIN}/userinfo`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
        ],
        code_challenge_methods_supported: ["S256"],
      });
    }
    if (url.pathname === "/jwks") return json(res, { keys: [jwk] });
    if (url.pathname === "/userinfo") {
      const email = tokens.get(
        (req.headers.authorization ?? "").replace("Bearer ", ""),
      );
      if (!email) return json(res, { error: "invalid_token" }, 401);
      return json(res, {
        sub: subFor(email),
        email,
        email_verified: true,
        name: email.split("@")[0],
      });
    }
    if (url.pathname === "/token" && req.method === "POST") {
      return token(
        res,
        new URLSearchParams(await readBody(req)),
        req.headers.authorization,
      );
    }
    if (url.pathname === "/authorize") {
      const auto = url.searchParams.get("auto");
      if (auto) return finishAuthorize(res, url.searchParams, auto);
      const hidden = [...url.searchParams]
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`,
        )
        .join("");
      return html(
        res,
        `<h1>Mock IdP (OIDC)</h1><p class="note">Test identity provider for QRdx SSO. Not a real sign-in.</p>
<form method="get" action="/authorize/approve">${hidden}<label>Sign in as<input name="email" value="${escapeHtml(url.searchParams.get("login_hint") ?? "")}"></label><button>Sign in</button></form>`,
      );
    }
    if (url.pathname === "/authorize/approve") {
      return finishAuthorize(
        res,
        url.searchParams,
        url.searchParams.get("email"),
      );
    }
    if (url.pathname === "/saml/metadata") {
      res.writeHead(200, { "content-type": "application/xml" });
      return res.end(idp().getMetadata());
    }
    if (url.pathname === "/saml/certificate") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end(samlCert);
    }
    if (url.pathname === "/saml/sso") {
      // AuthnRequest (HTTP-Redirect): read its ID and the ACS URL.
      const xml = (await import("node:zlib"))
        .inflateRawSync(
          Buffer.from(url.searchParams.get("SAMLRequest") ?? "", "base64"),
        )
        .toString();
      const requestId = xml.match(/\bID="([^"]+)"/)?.[1] ?? "";
      const { acs } = spEndpoints(
        xml.match(/AssertionConsumerServiceURL="([^"]+)"/)?.[1] ?? "",
      );
      const next = new URL(`${ORIGIN}/saml/approve`);
      next.searchParams.set("rid", requestId);
      next.searchParams.set("acs", acs);
      next.searchParams.set("relay", url.searchParams.get("RelayState") ?? "");
      for (const flag of ["unsigned", "notimes", "auto"]) {
        if (url.searchParams.get(flag))
          next.searchParams.set(flag, url.searchParams.get(flag));
      }
      if (url.searchParams.get("auto")) {
        return samlRespond(res, next, url.searchParams.get("auto"));
      }
      const hidden = [...next.searchParams]
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`,
        )
        .join("");
      return html(
        res,
        `<h1>Mock IdP (SAML)</h1><p class="note">Test identity provider for QRdx SSO. Not a real sign-in.</p>
<form method="get" action="/saml/approve">${hidden}<label>Sign in as<input name="email"></label><button>Sign in</button></form>`,
      );
    }
    if (url.pathname === "/saml/approve") {
      return samlRespond(res, url, url.searchParams.get("email"));
    }
    res.writeHead(404);
    res.end("not found");
  } catch (error) {
    // Details stay in this console; the page gets a fixed message.
    console.error("[mock-idp]", error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Mock IdP error. See its console.");
  }
});
server.listen(port, () =>
  console.log(
    `[mock-idp] ${ORIGIN} (OIDC issuer ${ORIGIN}, SAML entity ${SAML_ENTITY_ID})`,
  ),
);
