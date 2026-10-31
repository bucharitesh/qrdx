"use client";

import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCustomDomainOptions } from "@/actions/custom-domains";
import type {
  DomainOptions,
  DomainRef,
} from "@/app/dashboard/domains/_lib/domains";

const DEFAULT_VALUE = "default";

/** The active scope's verified domains, loaded each time the dialog opens. */
export function useDomainOptions(open: boolean): DomainOptions | null {
  const [options, setOptions] = useState<DomainOptions | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOptions(null);
    getCustomDomainOptions()
      .then((result) => {
        if (!cancelled && result.success) setOptions(result.data);
      })
      .catch(() => {
        // No picker; codes use the default short link.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return options;
}

/** Shown only when the scope has verified domains or the code already uses one. */
export function DomainPicker({
  options,
  current,
  value,
  onChange,
  disabled,
}: {
  options: DomainOptions | null;
  /** The code's domain before editing */
  current: DomainRef | null;
  /** Selected domain id; null = default short link */
  value: string | null;
  onChange: (domainId: string | null) => void;
  disabled?: boolean;
}) {
  if (!options) return null;
  const domains = [...options.domains];
  if (current && !domains.some((domain) => domain.id === current.id)) {
    domains.push({ id: current.id, hostname: current.hostname });
  }
  if (domains.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="code-domain">Short link domain</Label>
      <Select
        disabled={disabled}
        onValueChange={(next) => onChange(next === DEFAULT_VALUE ? null : next)}
        value={value ?? DEFAULT_VALUE}
      >
        <SelectTrigger className="w-full" id="code-domain">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_VALUE}>
            {options.defaultHost}/q/ (default)
          </SelectItem>
          {domains.map((domain) => (
            <SelectItem
              disabled={!options.canUse && domain.id !== current?.id}
              key={domain.id}
              value={domain.id}
            >
              {domain.hostname}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!options.canUse && (
        <p className="text-muted-foreground text-xs">
          Moving codes to a custom domain needs Pro. Codes keep the domain they
          already use.
        </p>
      )}
      {options.canUse && (
        <p className="text-muted-foreground text-xs">
          Manage domains on the{" "}
          <Link className="underline" href="/dashboard/domains">
            Domains
          </Link>{" "}
          page.
        </p>
      )}
    </div>
  );
}
