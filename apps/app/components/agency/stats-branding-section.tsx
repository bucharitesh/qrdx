"use client";

// The share dialog's client branding (agency tools): which client brand a
// code's shared stats page shows (Pro and Business), and on Business the
// verified custom domain its link is served on.

import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { Edit2, Trash } from "iconsax-reactjs";
import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import {
  deleteClientBrandAction,
  saveClientBrandAction,
} from "@/actions/client-brands";
import {
  getStatsBrandingAction,
  setStatsBrandingAction,
} from "@/actions/public-stats";
import { useWorkspaceHref } from "@/components/workspace-provider";
import type { ClientBrand } from "@/lib/client-brands-shared";
import type {
  PublicStatsShare,
  StatsBranding,
} from "@/lib/public-stats-shared";
import { soundEvent } from "@/lib/sound/emit";
import { BrandFields, BrandTile } from "./brand-fields";

const NONE = "none";
const NEW = "new";
const QRDX_HOST = "qrdx";

export function StatsBrandingSection({
  codeId,
  onShareChange,
}: {
  codeId: string;
  /** The link changes when the page moves to a custom domain. */
  onShareChange: (share: PublicStatsShare) => void;
}) {
  const id = useId();
  const href = useWorkspaceHref();
  const [branding, setBranding] = useState<StatsBranding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | ClientBrand | null>(null);
  const [confirming, setConfirming] = useState<ClientBrand | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setBranding(null);
    getStatsBrandingAction({ codeId })
      .then((result) => {
        if (cancelled) return;
        if (result.success) setBranding(result.data);
        else setError(result.error.message);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load client branding.");
      });
    return () => {
      cancelled = true;
    };
  }, [codeId]);

  const apply = (next: { brandId: string | null; domainId: string | null }) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setStatsBrandingAction({ codeId, ...next });
        if (!result.success) {
          setError(result.error.message);
          soundEvent("error");
          return;
        }
        setBranding(result.data.branding);
        onShareChange(result.data.share);
        soundEvent("success");
      } catch {
        setError("Couldn't change the branding. Try again.");
      }
    });
  };

  const removeBrand = (brand: ClientBrand) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteClientBrandAction({ id: brand.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(null);
      setConfirming(null);
      const fresh = await getStatsBrandingAction({ codeId });
      if (fresh.success) setBranding(fresh.data);
    });
  };

  if (error && !branding) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {error}
      </p>
    );
  }
  if (!branding) return <Skeleton className="h-24 w-full" />;
  if (!branding.available) return null;

  const selected = branding.brands.find((b) => b.id === branding.brandId);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={`${id}-brand`}>Client branding</Label>
        <p className="text-muted-foreground text-xs text-pretty">
          {branding.allowed
            ? branding.whiteLabel
              ? "Show a client's name, logo and color instead of QRdx. The page carries no QRdx mark."
              : `Show a client's name, logo and color instead of QRdx. A small "Made with QRdx" stays at the bottom.`
            : `Show a client's name, logo and color on this page with ${branding.brandingPlan ?? "a paid plan"}.`}
        </p>
      </div>

      {!branding.allowed ? (
        <Button asChild size="sm" variant="outline">
          <Link href="/pricing">See plans</Link>
        </Button>
      ) : editing ? (
        <BrandFields
          brand={editing === NEW ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(brand) => {
            setEditing(null);
            // A new brand goes on the page right away.
            apply({ brandId: brand.id, domainId: branding.domainId });
          }}
          save={saveClientBrandAction}
          submitLabel={editing === NEW ? "Add and use" : "Save brand"}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Select
            disabled={isPending || !branding.canManage}
            onValueChange={(value) => {
              if (value === NEW) {
                setEditing(NEW);
                return;
              }
              apply({
                brandId: value === NONE ? null : value,
                domainId: branding.domainId,
              });
            }}
            value={branding.brandId ?? NONE}
          >
            <SelectTrigger className="min-w-0 flex-1" id={`${id}-brand`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No client branding</SelectItem>
              {branding.brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  <span className="flex items-center gap-2">
                    <BrandTile
                      accent={brand.accent}
                      logo={brand.logo}
                      name={brand.name}
                      size="sm"
                    />
                    {brand.name}
                  </span>
                </SelectItem>
              ))}
              {branding.canManage && (
                <>
                  <SelectSeparator />
                  <SelectItem value={NEW}>New client brand…</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          {selected && branding.canManage && (
            <>
              <Button
                aria-label={`Edit ${selected.name}`}
                disabled={isPending}
                onClick={() => setEditing(selected)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Edit2 aria-hidden />
              </Button>
              <Button
                aria-label={`Delete ${selected.name}`}
                disabled={isPending}
                onClick={() => setConfirming(selected)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash aria-hidden />
              </Button>
            </>
          )}
        </div>
      )}

      {confirming && (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md p-2.5 text-sm">
          <span className="text-pretty">
            Delete {confirming.name}? Every page that shows it goes back to
            plain.
          </span>
          <span className="flex gap-1">
            <Button
              disabled={isPending}
              onClick={() => setConfirming(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={() => removeBrand(confirming)}
              size="sm"
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </span>
        </div>
      )}

      {branding.whiteLabel && !editing && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-domain`}>Link address</Label>
          {branding.domains.length > 0 ? (
            <Select
              disabled={isPending || !branding.canManage}
              onValueChange={(value) =>
                apply({
                  brandId: branding.brandId,
                  domainId: value === QRDX_HOST ? null : value,
                })
              }
              value={branding.domainId ?? QRDX_HOST}
            >
              <SelectTrigger className="w-full" id={`${id}-domain`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={QRDX_HOST}>QRdx's address</SelectItem>
                {branding.domains.map((domain) => (
                  <SelectItem key={domain.id} value={domain.id}>
                    {domain.hostname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-muted-foreground text-xs text-pretty">
              Verify a domain in{" "}
              <Link
                className="text-foreground underline-offset-4 hover:underline"
                href={href("/settings/domains")}
              >
                Settings → Domains
              </Link>{" "}
              to serve this page on it.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
