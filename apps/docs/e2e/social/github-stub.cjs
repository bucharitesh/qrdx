// Test only: answers the dev server's calls to GitHub (the token exchange,
// /user and /user/emails) so a GitHub sign-in runs end to end locally,
// through Better Auth's real callback. The browser side never reaches
// github.com either: e2e/verified-sign-up.e2e.mts intercepts the authorize
// page and sends the browser straight back to the callback.
//
// The authorization code chosen by the test is the whole profile:
// base64url JSON {"id","email","verified"}. It becomes the access token, and
// /user and /user/emails answer from it. Loaded with
//   NODE_OPTIONS="--require ./e2e/social/github-stub.cjs"
// together with a made-up GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET; refuses
// to run in production.
if (process.env.NODE_ENV === "production") {
  throw new Error("e2e/social/github-stub.cjs is for local tests only");
}

const original = globalThis.fetch;

function profileFrom(token) {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString());
    if (typeof parsed.id === "string" && typeof parsed.email === "string") {
      return parsed;
    }
  } catch {}
  return null;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function bodyText(body) {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return "";
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    url.hostname === "github.com" &&
    url.pathname === "/login/oauth/access_token"
  ) {
    const body = new URLSearchParams(
      bodyText(init.body) ||
        (input instanceof Request ? await input.clone().text() : ""),
    );
    const code = body.get("code") ?? "";
    if (!profileFrom(code)) return json({ error: "bad_verification_code" });
    return json({
      access_token: code,
      token_type: "bearer",
      scope: "read:user,user:email",
    });
  }
  if (url.hostname === "api.github.com") {
    const headers = new Headers(
      init.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const token = (headers.get("authorization") ?? "").replace(
      /^(Bearer|token)\s+/i,
      "",
    );
    const profile = profileFrom(token);
    if (!profile) return json({ message: "Bad credentials" }, 401);
    if (url.pathname === "/user") {
      return json({
        id: Number.parseInt(profile.id, 10) || 1,
        login: `e2e-${profile.id}`,
        name: "E2E GitHub",
        email: null,
        avatar_url: null,
      });
    }
    if (url.pathname === "/user/emails") {
      return json([
        {
          email: profile.email,
          primary: true,
          verified: profile.verified === true,
          visibility: "private",
        },
      ]);
    }
    return json({ message: "Not Found" }, 404);
  }
  return original(input, init);
};

console.log(`[github-stub] pid ${process.pid} answers GitHub's API locally`);
