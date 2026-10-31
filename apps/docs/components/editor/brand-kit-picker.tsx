"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Palette, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getBrandKit, listBrandKits } from "@/actions/brand-kits";
import {
  type BrandKitSummary,
  brandKitToStyles,
} from "@/app/dashboard/brand-kits/_lib/brand-kit";
import { BRAND_KITS_QUERY_KEY } from "@/app/dashboard/brand-kits/_lib/query-key";
import { useQREditorStore } from "@/store/editor-store";

/** "Apply brand kit" menu for signed-in users; one apply is one undo step. */
export function BrandKitPicker() {
  const { data: session } = authClient.useSession();
  const activeOrganizationId = session?.session.activeOrganizationId ?? null;
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const { data: kits, isPending } = useQuery({
    queryKey: [...BRAND_KITS_QUERY_KEY, activeOrganizationId],
    queryFn: () => listBrandKits(),
    enabled: Boolean(session?.user),
    staleTime: 30_000,
  });

  if (!session?.user) return null;

  const apply = async (kit: BrandKitSummary) => {
    setApplyingId(kit.id);
    try {
      let logo: string | null = null;
      if (kit.hasLogo) {
        const result = await getBrandKit(kit.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        logo = result.data.logo;
      }
      const { themeState, setThemeState } = useQREditorStore.getState();
      // A single state update keeps the whole kit as one history entry.
      setThemeState({
        ...themeState,
        styles: {
          ...themeState.styles,
          ...brandKitToStyles({ colors: kit.colors, style: kit.style, logo }),
        },
      });
      toast.success(`Applied ${kit.name}`, {
        description: "Undo reverts the whole kit.",
      });
    } catch {
      toast.error("Could not apply the brand kit");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="mb-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="w-full justify-between"
            disabled={applyingId !== null}
            variant="outline"
          >
            <span className="flex items-center gap-2">
              {applyingId ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Palette className="size-4" />
              )}
              Apply brand kit
            </span>
            <ChevronDown className="text-muted-foreground size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
        >
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            {activeOrganizationId ? "Team brand kits" : "Your brand kits"}
          </DropdownMenuLabel>
          {isPending ? (
            <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
          ) : kits && kits.length > 0 ? (
            kits.map((kit) => (
              <DropdownMenuItem key={kit.id} onSelect={() => apply(kit)}>
                <span className="flex-1 truncate">{kit.name}</span>
                {kit.isDefault && (
                  <span className="text-muted-foreground text-xs">Default</span>
                )}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No brand kits yet</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/brand-kits">
              <Plus className="size-4" />
              Manage brand kits
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
