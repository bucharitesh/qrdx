import { SUPPORT_EMAIL } from "@repo/config";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ArrowRight,
  Data,
  DocumentDownload,
  FingerScan,
  Key,
  Lock1,
  People,
  ShieldSecurity,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LocaleLink } from "@/components/i18n/locale-link";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { AUDIT_RETENTION_DAYS } from "@/ee/audit-log/limits";
import { isFeatureAvailable } from "@/lib/feature-availability";
import type { FeatureId } from "@/lib/feature-availability-rules";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";

// /security: what QRdx does to protect accounts and data. Each line was
// checked against the code or configuration behind it:
// - HSTS and the other headers: next.config.ts headers(); the CSP:
//   lib/security/csp.ts (nonces for signed-in pages in proxy.ts)
// - sign-in: packages/auth (passkey.ts, confirm-gate.ts, new-sign-in.ts,
//   session-lifetime.ts, session-origin.ts, workspace-two-factor.ts)
// - single sign-on and the audit log: packages/auth/ee, ee/ (licence key)
// - roles: lib/permissions.ts; staff actions: admin_audit_log
// - keys: lib/api-keys/crypto.ts, lib/oauth.ts, packages/integrations
//   encryption.ts, lib/events/signature.ts, lib/redirect/lifecycle.ts
// - link checks: lib/safety (web-risk.ts, destinations.ts, recheck.ts)
// - storage: Vercel's iad1 region (no `regions` in vercel.json), Neon in
//   aws us-east-1, R2 and Upstash per /legal/subprocessors
// - export and deletion: lib/account/export, the DPA (section 11)
// Lines for features this deployment can't offer are left out
// (lib/feature-availability-rules.ts). No certification is claimed.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "security" });
  return localizedMetadata({
    locale,
    path: "/security",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
  });
}

const LINK =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

const NEON_SECURITY = "https://neon.com/docs/security/security-overview";

interface Item {
  key: string;
  needs?: FeatureId;
}

/** The sections in order; `needs` hides a line this server can't offer. */
const SECTIONS: readonly {
  key: string;
  icon: typeof Key;
  items: readonly Item[];
}[] = [
  {
    key: "transport",
    icon: Lock1,
    items: [{ key: "https" }, { key: "csp" }, { key: "framing" }],
  },
  {
    key: "signIn",
    icon: FingerScan,
    items: [
      { key: "passwords" },
      { key: "twoFactor" },
      { key: "confirm" },
      { key: "alerts" },
      { key: "sessions" },
    ],
  },
  {
    key: "workspaces",
    icon: People,
    items: [
      { key: "sso", needs: "sso" },
      { key: "roles" },
      { key: "auditLog", needs: "auditLog" },
      { key: "staff" },
    ],
  },
  {
    key: "secrets",
    icon: Key,
    items: [{ key: "hashed" }, { key: "encrypted" }, { key: "webhooks" }],
  },
  {
    key: "abuse",
    icon: ShieldSecurity,
    items: [
      { key: "linkChecks", needs: "linkSafety" },
      { key: "rateLimits" },
      { key: "bots", needs: "spamCheck" },
      { key: "reports" },
    ],
  },
  {
    key: "storage",
    icon: Data,
    items: [
      { key: "hosting" },
      { key: "database" },
      { key: "files", needs: "fileStorage" },
      { key: "scans" },
    ],
  },
  {
    key: "yourData",
    icon: DocumentDownload,
    items: [
      { key: "export" },
      { key: "delete" },
      { key: "dpa" },
      { key: "subprocessors" },
    ],
  },
];

export default async function SecurityPage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "security" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const passkeys = isFeatureAvailable("passkeys") ? "yes" : "no";
  // Keys built from SECTIONS: each one is in messages/en.json (the typed
  // translator can't follow keys built at run time).
  const tx = t as unknown as {
    (key: string): string;
    rich: (
      key: string,
      values: Record<
        string,
        string | number | ((chunks: ReactNode) => ReactNode)
      >,
    ) => ReactNode;
  };

  const link = (href: string) => (chunks: ReactNode) => (
    <LocaleLink className={LINK} href={href}>
      {chunks}
    </LocaleLink>
  );
  /** An item's body, with its values and links. */
  const body = (section: string, item: string) => {
    return tx.rich(`sections.${section}.items.${item}.body`, {
      passkeys,
      days: AUDIT_RETENTION_DAYS,
      report: link("/report-abuse"),
      dpa: link("/legal/dpa"),
      list: link("/legal/subprocessors"),
      neon: (chunks) => (
        <a className={LINK} href={NEON_SECURITY} rel="noopener" target="_blank">
          {chunks}
        </a>
      ),
    });
  };

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="halo"
        focus={[0.5, 0.4]}
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: "/security" },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2")]}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <a href="#report">
              {t("reportCta")}
              <ArrowRight aria-hidden className="size-4" />
            </a>
          </Button>
          <Button asChild variant="outline">
            <LocaleLink href="/enterprise">{t("enterpriseCta")}</LocaleLink>
          </Button>
        </div>
      </ToolHero>

      {SECTIONS.map((section) => {
        const items = section.items.filter(
          (item) => !item.needs || isFeatureAvailable(item.needs),
        );
        return (
          <section
            aria-labelledby={`security-${section.key}`}
            className="w-full px-10 py-12 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10"
            key={section.key}
          >
            <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:pt-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
                <section.icon
                  aria-hidden
                  className="size-4 text-foreground/80"
                />
              </span>
              <h2
                className="text-xl font-medium tracking-tighter text-balance text-secondary-foreground"
                id={`security-${section.key}`}
              >
                {tx(`sections.${section.key}.title`)}
              </h2>
            </div>
            <dl className="divide-y divide-border rounded-xl border border-border bg-card">
              {items.map((item) => (
                <div
                  className="grid gap-1 p-5 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6"
                  key={item.key}
                >
                  <dt className="font-medium text-secondary-foreground">
                    {tx(`sections.${section.key}.items.${item.key}.title`)}
                  </dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">
                    {body(section.key, item.key)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <section className="w-full px-10 py-12 grid gap-4 md:grid-cols-2">
        <div
          className="flex scroll-mt-24 flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm"
          id="report"
        >
          <h2 className="text-xl font-medium tracking-tighter text-secondary-foreground">
            {t("reportTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t.rich("report", {
              email: SUPPORT_EMAIL,
              mail: (chunks) => (
                <a
                  className={LINK}
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("[security] ")}`}
                >
                  {chunks}
                </a>
              ),
              policy: link("/legal/security"),
              txt: (chunks) => (
                <a className={LINK} href="/.well-known/security.txt">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-medium tracking-tighter text-secondary-foreground">
            {t("reviewTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t.rich("review", { enterprise: link("/enterprise") })}
          </p>
        </div>
      </section>
    </main>
  );
}
