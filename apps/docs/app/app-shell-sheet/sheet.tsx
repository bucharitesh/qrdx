"use client";

// The parts of app-shell-sheet/page.tsx. Every count here is made up for the
// preview; nothing is fetched or stored (marking "What's new" seen is a
// no-op, and this browser's copy is keyed by a throwaway id).

import { type ReactNode, useEffect } from "react";
import {
  type UsageContext,
  UsageMeters,
} from "@/app/settings/usage/_components/usage-meters";
import {
  type LimitContext,
  limitCopy,
} from "@/app/settings/usage/_lib/limit-copy";
import {
  type CheckoutOpen,
  type Meter,
  type MeterCaps,
  type MeterId,
  type MeterResult,
  meterLabel,
} from "@/app/settings/usage/_lib/meters";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { HelpMenu } from "@/components/app-shell/help-menu";
import type { ShellData } from "@/components/app-shell/shell-data";
import {
  useWhatsNew,
  WhatsNewProvider,
} from "@/components/app-shell/whats-new";
import { CapMeter } from "@/components/limits/cap-meter";
import { LimitCard } from "@/components/limits/limit-card";
import {
  LimitDialogHost,
  useLimitDialogStore,
} from "@/components/limits/limit-dialog";
import {
  PlanLimitsProvider,
  type ShellLimits,
} from "@/components/limits/plan-limits-provider";
import type { ChangelogItem } from "@/lib/changelog-feed";
import type { Plan } from "@/lib/pricing";

export type SheetOpen = "whats-new" | "limit" | "help";

type Caps = Record<
  "freeOwn" | "freeTeam" | "proOwn" | "proTeam" | "businessTeam",
  MeterCaps
>;

const MB = 1024 * 1024;
const GB = 1024 * MB;
const OPEN: CheckoutOpen = { pro: true, business: true };
const CLOSED: CheckoutOpen = { pro: false, business: false };
const RESETS = "2026-12-01T00:00:00.000Z";
const noop = async () => undefined;

const m = (
  id: MeterId,
  used: number,
  limit: number | null,
  extra: Partial<Meter> = {},
  isTeam = false,
): Meter => ({
  id,
  label: meterLabel(id, { isTeam }),
  used,
  limit,
  unit: id === "storage" ? "bytes" : "count",
  ...extra,
});

// Sidebar notices (already sorted as attentionMeters does). Module-level, so
// each is one promise for use().
const FREE_WARNINGS = Promise.resolve([
  m("landingPages", 3, 3),
  m("dynamicCodes", 9, 10),
]);
const PRO_WARNINGS = Promise.resolve([m("teamSeats", 3, 3)]);
const NO_WARNINGS = Promise.resolve([] as Meter[]);

function shellFor({
  name,
  plan,
  own,
  role,
  limits,
  seenAt,
  viewerId,
}: {
  name: string;
  plan: Plan;
  own: boolean;
  role: "owner" | "admin" | "member";
  limits: ShellLimits;
  seenAt: string;
  viewerId: string;
}): ShellData {
  const workspace = {
    id: `ws-${name}`,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    role,
    own,
  };
  return {
    workspace,
    workspaces: [workspace],
    plan,
    personalPlan: own ? plan : "free",
    canUpgrade: role === "owner",
    canCreateWorkspace: plan !== "free",
    codes:
      plan === "free" ? { used: 9, limit: 10, unlimitedPlan: "pro" } : null,
    limits,
    changelogSeen: { viewerId, stored: seenAt, signedUpAt: "2025-12-01" },
  };
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id?: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4" id={id}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-sm">{note}</p>
      </div>
      {children}
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground mb-3 font-mono text-[11px] uppercase tracking-wide">
      {children}
    </p>
  );
}

/** Opens the panel once mounted, for the ?open=whats-new screenshot. */
function OpenWhatsNew({ when }: { when: boolean }) {
  const whatsNew = useWhatsNew();
  const openPanel = whatsNew?.openPanel;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once on mount
  useEffect(() => {
    if (when) openPanel?.();
  }, []);
  return null;
}

function SidebarColumn({
  caption,
  shell,
  warnings,
  items,
  collapsed = false,
  children,
}: {
  caption: string;
  shell: ShellData;
  warnings: Promise<Meter[]>;
  items: ChangelogItem[];
  collapsed?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <Caption>{caption}</Caption>
      <PlanLimitsProvider value={shell.limits}>
        <WhatsNewProvider
          items={items}
          markSeen={noop}
          seen={shell.changelogSeen}
        >
          <div
            className={
              collapsed
                ? "bg-sidebar border-sidebar-border h-[520px] w-14 overflow-hidden rounded-xl border"
                : "bg-sidebar border-sidebar-border h-[520px] w-60 overflow-hidden rounded-xl border"
            }
          >
            <AppSidebar
              collapsed={collapsed}
              limitWarnings={warnings}
              shell={shell}
            />
          </div>
          {children}
        </WhatsNewProvider>
      </PlanLimitsProvider>
    </div>
  );
}

function CardTile({
  caption,
  meter,
  context,
}: {
  caption: string;
  meter: Meter;
  context: LimitContext;
}) {
  const copy = limitCopy(meter, context);
  return (
    <div className="bg-card rounded-xl border p-5">
      <Caption>{caption}</Caption>
      {copy ? (
        <LimitCard
          copy={copy}
          meter={meter}
          source="preview"
          usageHref="#usage"
        />
      ) : (
        <p className="text-muted-foreground text-sm">No card below 90%.</p>
      )}
    </div>
  );
}

function OpenLimitDialog({ when }: { when: boolean }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: once on mount
  useEffect(() => {
    if (when) {
      useLimitDialogStore
        .getState()
        .show({ meterId: "dynamicCodes", used: 10 });
    }
  }, []);
  return null;
}

export function AppShellSheet({
  caps,
  items,
  open,
  viewerId,
}: {
  caps: Caps;
  items: ChangelogItem[];
  open: SheetOpen | null;
  viewerId: string;
}) {
  const limits = (
    plan: Plan,
    capsFor: MeterCaps,
    { canUpgrade = true, isTeam = false, checkoutOpen = OPEN } = {},
  ): ShellLimits => ({
    plan,
    canUpgrade,
    checkoutOpen,
    caps: capsFor,
    isTeam,
    usageHref: "#usage",
  });
  const freeOwner = limits("free", caps.freeOwn);
  const proMember = limits("pro", caps.proTeam, {
    canUpgrade: false,
    isTeam: true,
  });
  const businessTeam = limits("business", caps.businessTeam, { isTeam: true });

  const freeShell = shellFor({
    name: "Acme",
    plan: "free",
    own: true,
    role: "owner",
    limits: freeOwner,
    seenAt: "2026-10-30",
    viewerId: `${viewerId}-free`,
  });
  const proShell = shellFor({
    name: "Bistro Group",
    plan: "pro",
    own: false,
    role: "member",
    limits: proMember,
    seenAt: items[0]?.date ?? "2026-11-01",
    viewerId: `${viewerId}-pro`,
  });
  const businessShell = shellFor({
    name: "Northwind",
    plan: "business",
    own: false,
    role: "owner",
    limits: businessTeam,
    seenAt: "2026-10-31",
    viewerId: `${viewerId}-business`,
  });

  const context = (
    plan: Plan,
    capsFor: MeterCaps,
    id: MeterId,
    overrides: Partial<LimitContext> = {},
  ): LimitContext => ({
    plan,
    canUpgrade: true,
    checkoutOpen: OPEN,
    cap: capsFor[id],
    ...overrides,
  });

  const usage = (
    plan: Plan,
    capsFor: MeterCaps,
    canUpgrade = true,
  ): UsageContext => ({ plan, canUpgrade, checkoutOpen: OPEN, caps: capsFor });

  const freeMeters: MeterResult[] = [
    m("dynamicCodes", 9, 10, { note: "Archived codes don't count." }),
    m("landingPages", 3, 3),
    m("formResponses", 12, 50, { resetsAt: RESETS }),
    m("storage", 46 * MB, 50 * MB, { note: "Up to 10 MB per file." }),
    m("savedThemes", 4, 10),
    m("oauthApps", 1, 1),
    m("aiArt", 1, 3, { resetsAt: RESETS }),
  ];
  const proMeters: MeterResult[] = [
    m("dynamicCodes", 140, null, { note: "Archived codes don't count." }),
    m("landingPages", 12, null),
    m("formResponses", 930, 1000, { resetsAt: RESETS }),
    m("storage", 1.2 * GB, 5 * GB, { note: "Up to 100 MB per file." }),
    m("teamSeats", 3, 3, { note: "2 members, 1 pending." }),
    m("customDomains", 2, 5),
    m("savedThemes", 8, null, {}, true),
    m("oauthApps", 1, 5),
    m("aiArt", 30, 30, {
      resetsAt: RESETS,
      note: "Counted for you, not the team.",
    }),
  ];
  const businessMeters: MeterResult[] = [
    m("dynamicCodes", 4210, null, { note: "Archived codes don't count." }),
    m("landingPages", 86, null),
    m("formResponses", 2140, 10_000, { resetsAt: RESETS }),
    m("storage", 3.4 * GB, 50 * GB, { note: "Up to 250 MB per file." }),
    m("teamSeats", 14, null, { note: "Members plus pending invitations." }),
    m("customDomains", 7, 25),
    m("savedThemes", 31, null, {}, true),
    m("oauthApps", 2, 25),
    m("aiArt", 140, 150, {
      resetsAt: RESETS,
      note: "Shared by everyone in this workspace.",
    }),
  ];

  return (
    <main className="bg-background mx-auto w-full max-w-6xl space-y-14 px-4 py-10 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          App shell: What's new and plan limits
        </h1>
        <p className="text-muted-foreground text-sm">
          Dev-only preview with made-up counts. The real dashboard needs a
          signed-in account.
        </p>
      </header>

      <Section
        note="The What's new row with its unread count, and the quiet limit notice above the switcher (only at 90% or more)."
        title="Sidebar"
      >
        <div className="flex flex-wrap gap-6">
          <SidebarColumn
            caption="Free · own · 3 unread"
            items={items}
            shell={freeShell}
            warnings={FREE_WARNINGS}
          >
            <OpenWhatsNew when={open === "whats-new"} />
          </SidebarColumn>
          <SidebarColumn
            caption="Pro team · member · read"
            items={items}
            shell={proShell}
            warnings={PRO_WARNINGS}
          />
          <SidebarColumn
            caption="Business team · no limits near"
            items={items}
            shell={businessShell}
            warnings={NO_WARNINGS}
          />
          <SidebarColumn
            caption="Rail"
            collapsed
            items={items}
            shell={freeShell}
            warnings={FREE_WARNINGS}
          />
        </div>
      </Section>

      <Section
        note="What's new in the Help menu opens the same panel; on phones the button carries a dot."
        title="Help menu"
      >
        <PlanLimitsProvider value={freeOwner}>
          <WhatsNewProvider
            items={items}
            markSeen={noop}
            seen={{
              viewerId: `${viewerId}-help`,
              stored: "2026-10-30",
              signedUpAt: null,
            }}
          >
            <div className="flex items-center gap-3" data-preview="help">
              <HelpMenu />
              <span className="text-muted-foreground text-sm">
                Free · 3 unread
              </span>
            </div>
          </WhatsNewProvider>
        </PlanLimitsProvider>
      </Section>

      <Section
        note="One card per limit at 90% or more: count, why, and one action. The upgrade only shows to owners, for a plan checkout sells."
        title="Limit cards"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <CardTile
            caption="Free owner · 10 of 10 codes"
            context={context("free", caps.freeOwn, "dynamicCodes")}
            meter={m("dynamicCodes", 10, 10)}
          />
          <CardTile
            caption="Free owner · 9 of 10 codes"
            context={context("free", caps.freeOwn, "dynamicCodes")}
            meter={m("dynamicCodes", 9, 10)}
          />
          <CardTile
            caption="Free team · member · pages full"
            context={context("free", caps.freeTeam, "landingPages", {
              canUpgrade: false,
            })}
            meter={m("landingPages", 3, 3)}
          />
          <CardTile
            caption="Free owner · checkout closed"
            context={context("free", caps.freeOwn, "dynamicCodes", {
              checkoutOpen: CLOSED,
            })}
            meter={m("dynamicCodes", 10, 10)}
          />
          <CardTile
            caption="Pro owner · seats full"
            context={context("pro", caps.proOwn, "teamSeats")}
            meter={m("teamSeats", 3, 3)}
          />
          <CardTile
            caption="Business · domains full · top plan"
            context={context("business", caps.businessTeam, "customDomains")}
            meter={m("customDomains", 25, 25)}
          />
          <CardTile
            caption="Business team · pooled AI art"
            context={context("business", caps.businessTeam, "aiArt")}
            meter={m("aiArt", 140, 150, {
              resetsAt: RESETS,
              note: "Shared by everyone in this workspace.",
            })}
          />
          <CardTile
            caption="Free owner · storage"
            context={context("free", caps.freeOwn, "storage")}
            meter={m("storage", 46 * MB, 50 * MB)}
          />
        </div>
      </Section>

      <Section note="Codes and pages list headers on Free." title="List meters">
        <PlanLimitsProvider value={freeOwner}>
          <div className="space-y-3">
            <CapMeter
              limit={10}
              meterId="dynamicCodes"
              note="Archived codes don't count. Existing codes keep working on every plan."
              plan="free"
              source="preview"
              used={6}
            />
            <CapMeter
              limit={10}
              meterId="dynamicCodes"
              note="Archived codes don't count. Existing codes keep working on every plan."
              plan="free"
              source="preview"
              used={9}
            />
            <CapMeter
              limit={3}
              meterId="landingPages"
              note={`Free pages show a small "Made with QRdx" footer.`}
              plan="free"
              source="preview"
              used={3}
            />
          </div>
        </PlanLimitsProvider>
      </Section>

      <Section
        id="usage"
        note="Bars only for caps; what the plan doesn't cap is one line of counts."
        title="Plan & usage meters"
      >
        <div className="max-w-4xl space-y-6">
          {(
            [
              ["Free · own", freeMeters, usage("free", caps.freeOwn)],
              ["Pro team · owner", proMeters, usage("pro", caps.proTeam)],
              [
                "Business team · pooled AI art",
                businessMeters,
                usage("business", caps.businessTeam),
              ],
            ] as const
          ).map(([caption, meters, ctx]) => (
            <div className="bg-card rounded-xl border px-5 py-3" key={caption}>
              <Caption>{caption}</Caption>
              <UsageMeters context={ctx} meters={[...meters]} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        note="What a LIMIT_REACHED answer opens in the app (?open=limit opens it)."
        title="Limit dialog"
      >
        <PlanLimitsProvider value={freeOwner}>
          <LimitDialogHost />
          <OpenLimitDialog when={open === "limit"} />
          <button
            className="text-sm underline underline-offset-4"
            onClick={() =>
              useLimitDialogStore
                .getState()
                .show({ meterId: "dynamicCodes", used: 10 })
            }
            type="button"
          >
            Open the codes limit card
          </button>
        </PlanLimitsProvider>
      </Section>
    </main>
  );
}
