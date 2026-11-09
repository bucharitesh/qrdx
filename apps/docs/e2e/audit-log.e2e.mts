// The workspace audit log (ee/audit-log), end to end against a running dev
// server and a THROWAWAY local database, driven over the Chrome DevTools
// Protocol. It writes to the database (test users, a Business subscription),
// so it refuses to run unless DATABASE_URL in .env.local points at localhost.
// The server needs QRDX_EE_LICENSE set (any value) for the audit log to exist.
//
//   AUDIT_E2E_BASE_URL=http://localhost:<port> AUDIT_E2E_DEV_LOG=<dev.log> \
//   AUDIT_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   AUDIT_E2E_SHOTS=<dir> pnpm exec tsx e2e/audit-log.e2e.mts
//
// Covers: a Free workspace shows the upgrade state and records nothing; on
// Business, an owner creates a code, changes its destination and invites a
// member, then Settings → Audit log shows all three, newest first, with the
// old and new destination, the IP address and the device on demand; the
// Category filter (the select and the URL) narrows the list; Export CSV
// downloads the filtered rows with formula cells neutralised, and the export
// is recorded; a plain member gets the no-access state and a 403 from the
// export. Screenshots of each screen in light and dark (AUDIT_E2E_SHOTS),
// and with AUDIT_E2E_MOBILE=1 a 390 px phone with a no-horizontal-scroll
// check on each screen.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.env.AUDIT_E2E_BASE_URL ?? "").replace(/\/$/, "");
const DEV_LOG = process.env.AUDIT_E2E_DEV_LOG ?? "";
const PSQL = process.env.AUDIT_E2E_PSQL ?? "";
const SHOTS = process.env.AUDIT_E2E_SHOTS ?? "";
const MOBILE = process.env.AUDIT_E2E_MOBILE === "1";
const RUN = Date.now().toString(36);

for (const [name, value] of Object.entries({ BASE, DEV_LOG, PSQL })) {
  if (!value) {
    throw new Error(
      `Set AUDIT_E2E_${name === "BASE" ? "BASE_URL" : name === "DEV_LOG" ? "DEV_LOG" : "PSQL"}`,
    );
  }
}
// Throwaway databases only.
const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf8");
const dbUrl = envFile.match(/^DATABASE_URL=(.*)$/m)?.[1] ?? "";
if (
  !/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) ||
  !/-h localhost/.test(PSQL)
) {
  throw new Error(
    `Refusing to run: the database is not local (${dbUrl.replace(/:[^:@/]*@/, ":***@")})`,
  );
}
console.log(`Database: local (${dbUrl.replace(/:[^:@/]*@/, ":***@")})`);

const sql = (query: string) =>
  execSync(`${PSQL} -tA -F '|' -c ${JSON.stringify(query)}`, {
    encoding: "utf8",
  }).trim();
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const SHOT_DIR = MOBILE && SHOTS ? join(SHOTS, "mobile") : SHOTS;
const browser = await launch(
  MOBILE ? { width: 390, height: 844 } : { width: 1280, height: 900 },
);
const { cdp, evaluate, goto, waitFor } = browser;
if (MOBILE) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
}

// biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
const text = () => evaluate(() => document.body.innerText as string);

async function waitText(needle: string, timeout = 20_000) {
  // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
  return waitFor((n: string) => document.body.innerText.includes(n), {
    args: [needle] as never[],
    timeout,
  });
}

/**
 * Each screen: close the cookie banner (at 390 px it covers the buttons the
 * later steps click), check the phone layout, then screenshots when asked.
 */
async function shot(name: string) {
  await evaluate(() => {
    const reject = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (reject) window.__e2e.click(reject);
  });
  await sleep(300);
  if (MOBILE) {
    const overflow = (await evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )) as number;
    check(
      `${name}: no horizontal scroll at 390 px`,
      overflow <= 0,
      `${overflow}`,
    );
  }
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  for (const scheme of ["light", "dark"] as const) {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: scheme },
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    });
    await evaluate((s: string) => {
      document.documentElement.classList.toggle("dark", s === "dark");
      document.documentElement.style.colorScheme = s;
    }, scheme);
    await sleep(300);
    const height = MOBILE
      ? ((await evaluate(
          () => document.documentElement.scrollHeight,
        )) as number)
      : 0;
    const captured = (await Promise.race([
      cdp.send(
        "Page.captureScreenshot",
        MOBILE
          ? {
              format: "png",
              captureBeyondViewport: true,
              clip: { x: 0, y: 0, width: 390, height, scale: 1 },
            }
          : { format: "png" },
      ),
      sleep(15_000).then(() => null),
    ])) as { data: string } | null;
    if (!captured) continue;
    writeFileSync(
      join(SHOT_DIR, `${name}-${scheme}.png`),
      Buffer.from(captured.data, "base64"),
    );
  }
  await evaluate(() => document.documentElement.classList.remove("dark"));
}

/** A real mouse click (Radix menus ignore synthetic events). */
async function mouseClick(find: string) {
  const box = await evaluate((source: string) => {
    const el = new Function(`return (${source})()`)() as Element | null;
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, find);
  if (!box) throw new Error(`Nothing to click: ${find}`);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
  }
}

function latestCode(email: string): string {
  const log = readFileSync(DEV_LOG, "utf8");
  const matches = [...log.matchAll(/sign-in code for (\S+): (\d{6})/g)].filter(
    (m) => m[1] === email,
  );
  const code = matches.at(-1)?.[2];
  if (!code) throw new Error(`No code in the dev log for ${email}`);
  return code;
}

/** Email-code sign-in through the same endpoints the sign-in panel calls. */
async function emailSignIn(email: string) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  const sent = await evaluate(async (e: string) => {
    const r = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: e, type: "sign-in" }),
    });
    return r.status;
  }, email);
  if (sent !== 200) throw new Error(`send code ${sent}`);
  await sleep(500);
  const status = await evaluate(
    async (e: string, otp: string) => {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, otp }),
      });
      return r.status;
    },
    email,
    latestCode(email),
  );
  if (status !== 200) throw new Error(`sign in ${status}`);
}

/** /api/v1 with the page's session (same origin, as the dashboard calls it). */
const api = (method: string, path: string, body?: unknown) =>
  evaluate(
    async (m: string, p: string, b: string | null) => {
      const r = await fetch(`/api/v1${p}`, {
        method: m,
        headers: { "content-type": "application/json" },
        body: b ?? undefined,
      });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    method,
    path,
    body === undefined ? null : JSON.stringify(body),
  ) as Promise<{ status: number; json: { data?: { id: string } } | null }>;

const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);
const auditCount = (orgId: string, where = "true") =>
  Number(
    sql(
      `select count(*) from workspace_audit_log where organization_id=${q(orgId)} and ${where}`,
    ),
  );

/** Polls `read` until it returns `want` (or the timeout); returns the last value. */
async function settle<T>(read: () => T, want: T, timeout = 15_000): Promise<T> {
  const until = Date.now() + timeout;
  let value = read();
  while (value !== want && Date.now() < until) {
    await sleep(500);
    value = read();
  }
  return value;
}

/** POST to Better Auth's own endpoints (/api/auth/…, auth.handler) as the page. */
const authPost = (path: string, body: unknown) =>
  evaluate(
    async (p: string, b: string) => {
      const r = await fetch(`/api/auth${p}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: b,
      });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    path,
    JSON.stringify(body),
  ) as Promise<{ status: number; json: Record<string, any> | null }>;

/**
 * "Confirm it's you" for `email`'s newest session, as the confirmation flow
 * records it (packages/auth/confirm-gate.ts reads this row): #251's gate on
 * the organization endpoints over HTTP. The flow itself is tested in
 * e2e/confirm-actions.e2e.mts; here it's a fixture.
 */
function confirmSession(email: string) {
  sql(
    `insert into verification (id, identifier, value, expires_at, created_at, updated_at) select 'confirm-' || s.id, 'qrdx-confirmed-' || s.id, s.user_id, now() + interval '10 minutes', now(), now() from session s join "user" u on u.id = s.user_id where u.email=${q(email)} order by s.created_at desc limit 1 on conflict (id) do nothing`,
  );
}

const owner = `owner-${RUN}@audit.test`;
const member = `member-${RUN}@audit.test`;
const invitee = `invitee-${RUN}@audit.test`;

try {
  console.log("set up");
  await emailSignIn(member);
  const memberId = userId(member);
  await emailSignIn(owner);
  const ownerId = userId(owner);
  const slug = sql(
    `select o.slug from organization o join member m on m.organization_id=o.id where m.user_id=${q(ownerId)} and m.role='owner' limit 1`,
  );
  const orgId = sql(`select id from organization where slug=${q(slug)}`);
  const page = `${BASE}/dashboard/${slug}/settings/audit-log`;

  console.log("Free workspace");
  await goto(page, { wait: 3000 });
  check(
    "Free: the upgrade state",
    (await text()).includes("The audit log is part of Business"),
  );
  await shot("01-free");
  const freeCode = await api("POST", "/codes", {
    destinationUrl: "https://example.com/free",
    title: "Free code",
  });
  check(
    "Free: a code is created",
    freeCode.status === 201,
    `${freeCode.status}`,
  );
  await sleep(1500);
  check("Free: nothing is recorded", auditCount(orgId) === 0);

  console.log("Business workspace");
  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-${RUN}', now(), 4900, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-${RUN}', 'local-business-monthly', 'chk-${RUN}', ${q(ownerId)})`,
  );
  sql(
    `insert into member (id, organization_id, user_id, role, created_at) values ('mem-${RUN}', ${q(orgId)}, ${q(memberId)}, 'member', now())`,
  );

  // 1. A code (its name starts with "=" to check the CSV), 2. a new
  // destination, 3. an invitation through the Team page.
  const created = await api("POST", "/codes", {
    destinationUrl: "https://example.com/spring",
    title: "=Spring menu",
  });
  check("creates a code", created.status === 201, `${created.status}`);
  const codeId = created.json?.data?.id ?? "";
  await sleep(300);
  const patched = await api("PATCH", `/codes/${codeId}`, {
    destinationUrl: "https://example.com/summer",
  });
  check("changes its destination", patched.status === 200, `${patched.status}`);

  await goto(`${BASE}/dashboard/${slug}/settings/team`, { wait: 3000 });
  await evaluate((email: string) => {
    const input = document.getElementById("invite-email") as HTMLInputElement;
    window.__e2e.setValue(input, email);
  }, invitee);
  await mouseClick(
    `() => window.__e2e.byRole("button", "Create invite link", { exact: true })`,
  );
  await waitText(invitee);
  check(
    "invites a member",
    sql(
      `select count(*) from invitation where email=${q(invitee)} and organization_id=${q(orgId)}`,
    ) === "1",
  );
  check(
    "the invitation is recorded exactly once (server action, plugin hook)",
    (await settle(
      () =>
        auditCount(
          orgId,
          `action='member.invited' and target_label=${q(invitee)}`,
        ),
      1,
    )) === 1,
  );

  console.log("Settings → Audit log");
  await goto(page, { wait: 3000 });
  await waitText("Invited");
  const body = await text();
  check("shows the invitation", body.includes(`Invited ${invitee}`));
  check(
    "shows the new destination",
    body.includes("Changed the destination of =Spring menu"),
  );
  check("shows the new code", body.includes("Created the code =Spring menu"));
  check(
    "the free-plan code isn't there",
    !body.includes("Created the code Free code"),
  );
  const order = (await evaluate(() =>
    [...document.querySelectorAll("li[data-audit-action]")].map((li) =>
      li.getAttribute("data-audit-action"),
    ),
  )) as string[];
  check(
    "newest first",
    order.slice(0, 3).join(",") ===
      "member.invited,code.destination_changed,code.created",
    order.join(","),
  );
  check(
    "links the code while it exists",
    (await evaluate(
      (id: string) =>
        Boolean(document.querySelector(`a[href$="/codes/${id}"]`)),
      codeId,
    )) === true,
  );
  await shot("02-log");

  // Details on demand: before, after, IP and device.
  await mouseClick(
    `() => document.querySelector('li[data-audit-action="code.destination_changed"] button[aria-label="Show details"]')`,
  );
  await waitFor(
    () =>
      document.querySelector(
        'li[data-audit-action="code.destination_changed"] tbody tr',
      ) !== null,
    { timeout: 20_000 },
  );
  const details = await text();
  // The change table's rows as [field, before, after], compared cell by cell.
  const changeRows = (await evaluate(() =>
    [
      ...document.querySelectorAll(
        'li[data-audit-action="code.destination_changed"] tbody tr',
      ),
    ].map((row) =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      [...row.querySelectorAll("td")].map((cell) => cell.innerText.trim()),
    ),
  )) as string[][];
  check(
    "details show the old and new destination",
    changeRows.some(
      ([field, before, after]) =>
        field === "Destination" &&
        before === "https://example.com/spring" &&
        after === "https://example.com/summer",
    ),
    JSON.stringify(changeRows),
  );
  check(
    "details show the device",
    /Device\s+(Chrome|HeadlessChrome)/.test(details),
  );
  check("details show the IP address", /IP address\s+\S/.test(details));
  await shot("03-details");

  console.log("filter");
  await mouseClick(
    `() => document.querySelectorAll("button[role=combobox]")[1]`,
  );
  await sleep(500);
  await mouseClick(
    `() => [...document.querySelectorAll("[role=option]")].find((o) => o.textContent?.trim() === "Team")`,
  );
  await waitFor(
    () => new URLSearchParams(location.search).get("category") === "team",
    {
      timeout: 10_000,
    },
  );
  await sleep(2000);
  const teamOnly = (await evaluate(() =>
    [...document.querySelectorAll("li[data-audit-action]")].map((li) =>
      li.getAttribute("data-audit-action"),
    ),
  )) as string[];
  check(
    "Category: Team shows only the invitation",
    teamOnly.join(",") === "member.invited",
    teamOnly.join(","),
  );
  await shot("04-filtered");

  console.log("export");
  const csv = (await evaluate(async () => {
    const link = document.querySelector("a[download]") as HTMLAnchorElement;
    const r = await fetch(link.href);
    return {
      status: r.status,
      type: r.headers.get("content-type"),
      disposition: r.headers.get("content-disposition"),
      body: await r.text(),
    };
  })) as { status: number; type: string; disposition: string; body: string };
  const lines = csv.body.replace(/^﻿/, "").trimEnd().split("\r\n");
  check("Export: a CSV", csv.status === 200 && csv.type.startsWith("text/csv"));
  check(
    "Export: an attachment named after the workspace",
    csv.disposition.includes(`qrdx-${slug}-audit-log-`),
  );
  check(
    "Export: the filtered rows",
    lines.length === 2 && lines[1]?.includes(`Invited ${invitee}`) === true,
    `${lines.length - 1} rows`,
  );
  const full = (await evaluate(async (href: string) => {
    const r = await fetch(href);
    return r.text();
  }, `/dashboard/${slug}/settings/audit-log/export`)) as string;
  check(
    "Export: a formula-looking name is neutralised",
    full.includes(",code,'=Spring menu,"),
  );
  await sleep(1500);
  check(
    "Export: recorded, with the filter",
    auditCount(
      orgId,
      `action='audit_log.exported' and metadata->>'category'='Team'`,
    ) === 1,
  );

  console.log("rename through Settings → General (server action)");
  await goto(`${BASE}/dashboard/${slug}/settings`, { wait: 3000 });
  await evaluate((name: string) => {
    const input = document.getElementById("workspace-name") as HTMLInputElement;
    window.__e2e.setValue(input, name);
  }, `Renamed ${RUN}`);
  await mouseClick(
    `() => window.__e2e.byRole("button", "Save", { exact: true })`,
  );
  check(
    "a rename is recorded exactly once, with the old and new name",
    (await settle(
      () =>
        auditCount(
          orgId,
          `action='workspace.renamed' and metadata->'after'->>'name'=${q(`Renamed ${RUN}`)}`,
        ),
      1,
    )) === 1 && auditCount(orgId, "action='workspace.renamed'") === 1,
  );

  console.log("load more");
  sql(
    `insert into workspace_audit_log (id, organization_id, actor_type, actor_user_id, actor_label, action, target_type, target_id, target_label, created_at) select 'seed-${RUN}-' || g, ${q(orgId)}, 'user', ${q(ownerId)}, 'Seed', 'tag.created', 'tag', 'tag-' || g, 'Seed tag ' || g, now() - interval '1 day' - (g || ' minutes')::interval from generate_series(1, 60) g`,
  );
  const total = auditCount(orgId);
  await goto(page, { wait: 3000 });
  const rowsShown = () =>
    evaluate(
      () => document.querySelectorAll("li[data-audit-action]").length,
    ) as Promise<number>;
  check(
    "shows 50 at first",
    (await rowsShown()) === 50,
    `${await rowsShown()}`,
  );
  await mouseClick(
    `() => window.__e2e.byRole("button", "Load more", { exact: true })`,
  );
  await waitFor(
    () => document.querySelectorAll("li[data-audit-action]").length > 50,
    { timeout: 15_000 },
  );
  check(
    "Load more shows the rest, oldest last",
    (await rowsShown()) === total &&
      (await evaluate(
        () =>
          document
            .querySelector("li[data-audit-action]:last-child")
            ?.textContent?.includes("Seed tag 60") ?? false,
      )) === true,
    `${await rowsShown()} of ${total}`,
  );
  check(
    "no Load more at the end",
    (await evaluate(
      () => !window.__e2e.byRole("button", "Load more", { exact: true }),
    )) === true,
  );

  console.log("member");
  await emailSignIn(member);
  await goto(page, { wait: 3000 });
  check(
    "a member gets the no-access state",
    (await text()).includes(
      "Only owners and admins can see this workspace's audit log.",
    ),
  );
  check("a member sees no entries", !(await text()).includes("Invited"));
  const forbidden = (await evaluate(async (href: string) => {
    const r = await fetch(href);
    return r.status;
  }, `/dashboard/${slug}/settings/audit-log/export`)) as number;
  check("a member's export is refused", forbidden === 403, `${forbidden}`);
  await shot("05-member");

  console.log("team changes through /api/auth/organization/* (auth.handler)");
  const alice = `alice-${RUN}@audit.test`;
  const bob = `bob-${RUN}@audit.test`;
  const carol = `carol-${RUN}@audit.test`;
  await emailSignIn(alice);
  await emailSignIn(bob);
  await emailSignIn(owner);
  const createdTeam = await authPost("/organization/create", {
    name: `Audit team ${RUN}`,
    slug: `audit-team-${RUN}`,
  });
  const teamId = String(createdTeam.json?.id ?? "");
  check(
    "creates a team over HTTP",
    createdTeam.status === 200 && Boolean(teamId),
    `${createdTeam.status}`,
  );
  const invitations: Record<string, string> = {};
  for (const email of [alice, bob, carol]) {
    const response = await authPost("/organization/invite-member", {
      email,
      role: "member",
      organizationId: teamId,
    });
    invitations[email] = String(response.json?.id ?? "");
  }
  const statuses: Record<string, number> = {};
  statuses.cancel = (
    await authPost("/organization/cancel-invitation", {
      invitationId: invitations[carol],
    })
  ).status;
  await emailSignIn(alice);
  const acceptA = await authPost("/organization/accept-invitation", {
    invitationId: invitations[alice],
  });
  statuses.acceptA = acceptA.status;
  await emailSignIn(bob);
  const acceptB = await authPost("/organization/accept-invitation", {
    invitationId: invitations[bob],
  });
  statuses.acceptB = acceptB.status;
  await emailSignIn(owner);
  // #251's gates run before the change: refused calls record nothing. A
  // finished sign-in counts as "Confirm it's you" for 10 minutes, so this
  // run's confirmations go first.
  sql(
    `delete from verification where identifier like 'qrdx-confirmed-%' and value=${q(ownerId)}`,
  );
  const unconfirmed = await authPost("/organization/update-member-role", {
    memberId: acceptA.json?.member?.id,
    role: "admin",
    organizationId: teamId,
  });
  confirmSession(owner);
  const inexact = await authPost("/organization/update-member-role", {
    memberId: acceptA.json?.member?.id,
    role: "Admin, member",
    organizationId: teamId,
  });
  check(
    "a gated change without a confirmation, or with an inexact role, is refused",
    unconfirmed.status === 403 &&
      unconfirmed.json?.code === "CONFIRMATION_REQUIRED" &&
      inexact.status === 400 &&
      inexact.json?.code === "INVALID_ROLE",
    `${unconfirmed.status} ${unconfirmed.json?.code} / ${inexact.status} ${inexact.json?.code}`,
  );
  check(
    "and leaves no row",
    auditCount(teamId, "action='member.role_changed'") === 0,
  );
  statuses.role = (
    await authPost("/organization/update-member-role", {
      memberId: acceptA.json?.member?.id,
      role: "admin",
      organizationId: teamId,
    })
  ).status;
  statuses.remove = (
    await authPost("/organization/remove-member", {
      memberIdOrEmail: acceptB.json?.member?.id,
      organizationId: teamId,
    })
  ).status;
  await emailSignIn(alice);
  statuses.leave = (
    await authPost("/organization/leave", { organizationId: teamId })
  ).status;
  await emailSignIn(owner);
  confirmSession(owner);
  statuses.update = (
    await authPost("/organization/update", {
      organizationId: teamId,
      data: { name: `Audit team ${RUN} 2`, slug: `audit-team-${RUN}-2` },
    })
  ).status;
  check(
    "every endpoint call succeeded",
    Object.values(statuses).every((status) => status === 200),
    JSON.stringify(statuses),
  );
  const expected = [
    "invitation.revoked:1",
    "member.invited:3",
    "member.joined:2",
    "member.left:1",
    "member.removed:1",
    "member.role_changed:1",
    "workspace.renamed:1",
    "workspace.slug_changed:1",
  ].join("\n");
  const counts = () =>
    sql(
      `select action || ':' || count(*) from workspace_audit_log where organization_id=${q(teamId)} group by action order by action`,
    );
  const recorded = await settle(counts, expected);
  check(
    "each change is recorded exactly once",
    recorded === expected,
    recorded.replace(/\n/g, ", "),
  );
  const actorOf = (action: string) =>
    sql(
      `select string_agg(u.email, ',' order by u.email) from workspace_audit_log a join "user" u on u.id = a.actor_user_id where a.organization_id=${q(teamId)} and a.action=${q(action)}`,
    );
  check(
    "by the person who made each one",
    actorOf("member.invited") === [owner, owner, owner].join(",") &&
      actorOf("invitation.revoked") === owner &&
      actorOf("member.joined") === [alice, bob].sort().join(",") &&
      actorOf("member.role_changed") === owner &&
      actorOf("member.removed") === owner &&
      actorOf("member.left") === alice &&
      actorOf("workspace.renamed") === owner,
  );
  check(
    "a role change keeps the old and new role",
    sql(
      `select metadata->'before'->>'role' || '>' || (metadata->'after'->>'role') from workspace_audit_log where organization_id=${q(teamId)} and action='member.role_changed'`,
    ) === "Member>Admin",
  );
  const deleted = await authPost("/organization/delete", {
    organizationId: teamId,
  });
  check(
    "deletes the team over HTTP",
    deleted.status === 200,
    `${deleted.status}`,
  );
  check(
    "a deleted team's rows go with it",
    (await settle(() => auditCount(teamId), 0)) === 0 &&
      sql(`select count(*) from organization where id=${q(teamId)}`) === "0",
  );

  console.log("emptying a trash of 4,500 codes");
  sql(
    `insert into qr_code (id, user_id, organization_id, slug, destination_url, deleted_at) select 'bulk-${RUN}-' || g, ${q(ownerId)}, ${q(orgId)}, 'b${RUN}' || g, 'https://example.com/' || g, now() from generate_series(1, 4500) g`,
  );
  await goto(`${BASE}/dashboard/${slug}/codes?status=trash`, { wait: 4000 });
  await mouseClick(
    `() => window.__e2e.byRole("button", "Empty trash", { exact: true })`,
  );
  await sleep(800);
  await mouseClick(
    `() => document.querySelector('[role=alertdialog] button.bg-destructive, [role=alertdialog] [data-variant=destructive]') ?? [...document.querySelectorAll('[role=alertdialog] button')].find((b) => b.textContent?.trim() === "Empty trash")`,
  );
  const bulk = await settle(
    () =>
      auditCount(
        orgId,
        `action='code.deleted' and target_id like ${q(`bulk-${RUN}-%`)}`,
      ),
    4500,
    60_000,
  );
  check(
    "all 4,500 deletions are recorded (in chunks under Postgres's parameter limit)",
    bulk === 4500,
    `${bulk}`,
  );
} catch (error) {
  failures++;
  console.error(error);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
