import { hasAdminRole } from "@repo/auth/admin";
import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { Empty, Row, Rows } from "../_components/panel";
import { Section } from "../_components/stat-card";
import { formatDate, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { parseAdminSearch } from "../_lib/rules";
import { safeLoad } from "../_lib/safe";
import { runAdminSearch } from "../_lib/search";

export const metadata: Metadata = { title: "Admin · Search" };

const userHref = (id: string) => `/admin/users/${encodeURIComponent(id)}`;

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Section title={`${title} (${count === 8 ? "8+" : count})`}>
      {count === 0 ? <Empty>No matches.</Empty> : <Rows>{children}</Rows>}
    </Section>
  );
}

function CodeBadge({
  isActive,
  pausedAt,
}: {
  isActive: boolean;
  pausedAt: Date | null;
}) {
  if (!isActive) return <Badge variant="destructive">Disabled</Badge>;
  if (pausedAt) return <Badge variant="outline">Paused</Badge>;
  return null;
}

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const search = parseAdminSearch(q);
  const loaded = search
    ? await safeLoad("search", () => runAdminSearch(search))
    : null;

  return (
    <div className="space-y-4">
      <SettingsHeader
        description="Prefix to narrow it: user:, code:, page:, team:, app: (e.g. code:summer). Paste a short link to find its code."
        title="Search"
      />

      {!search ? (
        <Empty>Type something to search.</Empty>
      ) : !loaded?.ok ? (
        <Empty>Search failed. Try again.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {search.kinds.includes("user") && (
            <Group count={loaded.data.users.length} title="Users">
              {loaded.data.users.map((row) => (
                <Row
                  key={row.id}
                  meta={`${row.name} · joined ${formatDate(row.createdAt)}`}
                  title={
                    <>
                      <Link className="hover:underline" href={userHref(row.id)}>
                        {row.email}
                      </Link>
                      {hasAdminRole(row.role) && (
                        <Badge variant="secondary">admin</Badge>
                      )}
                      {row.banned && (
                        <Badge variant="destructive">banned</Badge>
                      )}
                    </>
                  }
                />
              ))}
            </Group>
          )}
          {search.kinds.includes("code") && (
            <Group count={loaded.data.codes.length} title="Codes">
              {loaded.data.codes.map((row) => (
                <Row
                  key={row.id}
                  meta={
                    <>
                      <span
                        className="block truncate"
                        title={row.destinationUrl}
                      >
                        {row.destinationUrl}
                      </span>
                      {formatNumber(row.scanCount)} scans · owner{" "}
                      <Link
                        className="hover:underline"
                        href={userHref(row.ownerId)}
                      >
                        {row.ownerEmail}
                      </Link>
                    </>
                  }
                  title={
                    <>
                      <span className="font-mono text-xs">/q/{row.slug}</span>
                      {row.title && (
                        <span className="text-muted-foreground truncate font-normal">
                          {row.title}
                        </span>
                      )}
                      <CodeBadge
                        isActive={row.isActive}
                        pausedAt={row.pausedAt}
                      />
                    </>
                  }
                />
              ))}
            </Group>
          )}
          {search.kinds.includes("page") && (
            <Group count={loaded.data.pages.length} title="Hosted pages">
              {loaded.data.pages.map((row) => (
                <Row
                  key={row.id}
                  meta={
                    <>
                      {formatNumber(row.scanCount)} scans · owner{" "}
                      <Link
                        className="hover:underline"
                        href={userHref(row.ownerId)}
                      >
                        {row.ownerEmail}
                      </Link>
                    </>
                  }
                  title={
                    <>
                      <span className="font-mono text-xs">/p/{row.slug}</span>
                      <span className="truncate font-normal">
                        {row.pageTitle || row.title || "Untitled"}
                      </span>
                      <CodeBadge
                        isActive={row.isActive}
                        pausedAt={row.pausedAt}
                      />
                    </>
                  }
                />
              ))}
            </Group>
          )}
          {search.kinds.includes("team") && (
            <Group count={loaded.data.teams.length} title="Teams">
              {loaded.data.teams.map((row) => (
                <Row
                  key={row.id}
                  meta={
                    <>
                      {formatNumber(row.members)} member
                      {row.members === 1 ? "" : "s"} · created{" "}
                      {formatDate(row.createdAt)}
                      {row.owners.length > 0 && " · owner "}
                      {row.owners.map((owner, index) => (
                        <span key={owner.id}>
                          {index > 0 && ", "}
                          <Link
                            className="hover:underline"
                            href={userHref(owner.id)}
                          >
                            {owner.email}
                          </Link>
                        </span>
                      ))}
                    </>
                  }
                  title={
                    <>
                      {row.name}
                      <span className="font-mono text-xs font-normal">
                        {row.slug}
                      </span>
                    </>
                  }
                />
              ))}
            </Group>
          )}
          {search.kinds.includes("app") && (
            <Group count={loaded.data.apps.length} title="OAuth apps">
              {loaded.data.apps.map((row) => (
                <Row
                  key={row.id}
                  meta={
                    <>
                      <span className="font-mono">{row.clientId}</span> ·{" "}
                      {row.ownerId ? (
                        <Link
                          className="hover:underline"
                          href={userHref(row.ownerId)}
                        >
                          {row.ownerEmail}
                        </Link>
                      ) : (
                        "first-party"
                      )}
                    </>
                  }
                  title={
                    <>
                      {row.name}
                      {row.verified && (
                        <Badge variant="secondary">Verified</Badge>
                      )}
                      {!row.isActive && <Badge variant="outline">Off</Badge>}
                    </>
                  }
                />
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}
