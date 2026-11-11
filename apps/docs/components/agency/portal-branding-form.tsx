"use client";

// Settings → Client portal → Branding: the name, logo and accent clients
// see instead of QRdx's (agency tools). Empty fields fall back to the
// workspace's own name and logo.

import { toast } from "@repo/design-system";
import { useState } from "react";
import { savePortalBrandAction } from "@/actions/portal";
import type { ClientBrand } from "@/lib/client-brands-shared";
import { BrandFields, BrandTile } from "./brand-fields";

export function PortalBrandingForm({
  brand,
  fallback,
  canEdit,
}: {
  brand: ClientBrand | null;
  /** The workspace's name and logo, shown until the portal has its own */
  fallback: { name: string; logo: string | null };
  canEdit: boolean;
}) {
  const [saved, setSaved] = useState<ClientBrand>(
    brand ?? { id: "", name: fallback.name, logo: fallback.logo, accent: null },
  );
  const [key, setKey] = useState(0);

  if (!canEdit) {
    return (
      <div className="flex items-center gap-3">
        <BrandTile
          accent={saved.accent}
          logo={saved.logo}
          name={saved.name}
          size="lg"
        />
        <div>
          <p className="font-medium">{saved.name}</p>
          <p className="text-muted-foreground text-xs">
            {saved.accent ? `Accent ${saved.accent}` : "No accent color"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrandFields
      brand={saved}
      key={key}
      nameLabel="Name clients see"
      namePlaceholder={fallback.name}
      onSaved={(next) => {
        setSaved(next);
        setKey((value) => value + 1);
        toast.success("Portal branding saved");
      }}
      save={savePortalBrandAction}
      submitLabel="Save branding"
    />
  );
}
