import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import { PortalShell } from "@/components/agency/portal-shell";
import {
  PortalSignIn,
  PortalSignOut,
} from "@/components/agency/portal-sign-in";
import { brandIconUrl } from "@/lib/client-brand-icon";
import type { PortalViewer, PortalWorkspace } from "@/lib/portal/access";

// What a client portal shows before its reports: signing in, or "no
// access" for someone signed in with another address (agency tools).

/** A portal page's metadata: the portal's name and icon, never indexed. */
export function portalMetadata(
  portal: PortalWorkspace | null,
  title: string,
): Metadata {
  const robots = { index: false, follow: false, nocache: true };
  if (!portal) return { title: "Not found", robots };
  return {
    title: { absolute: `${title} · ${portal.brand.name}` },
    description: `QR code reports from ${portal.brand.name}.`,
    robots,
    referrer: "no-referrer",
    applicationName: portal.brand.name,
    authors: null,
    creator: null,
    keywords: null,
    manifest: null,
    openGraph: null,
    twitter: null,
    icons: { icon: brandIconUrl(portal.brand) },
  };
}

/** Sign-in or "no access", in the portal's shell; null for a client. */
export function PortalGate({
  portal,
  viewer,
}: {
  portal: PortalWorkspace;
  viewer: PortalViewer;
}) {
  if (viewer.kind === "client") return null;
  if (viewer.kind === "signed-out") {
    return (
      <PortalShell portal={portal}>
        <Card className="mx-auto w-full max-w-sm">
          <CardHeader>
            <CardTitle>Sign in to see your reports</CardTitle>
            <CardDescription className="text-pretty">
              Use the email address {portal.brand.name} invited. We'll send you
              a one-time code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PortalSignIn />
          </CardContent>
        </Card>
      </PortalShell>
    );
  }
  return (
    <PortalShell email={viewer.email} portal={portal}>
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>No reports for this address</CardTitle>
          <CardDescription className="text-pretty">
            {viewer.email} isn't invited to {portal.brand.name}'s reports. Sign
            in with the address your invitation went to, or ask{" "}
            {portal.brand.name} to invite this one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortalSignOut label="Sign in with another address" />
        </CardContent>
      </Card>
    </PortalShell>
  );
}
