"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Palette, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteBrandKit, setDefaultBrandKit } from "@/actions/brand-kits";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { BrandKit } from "../_lib/brand-kit";
import { BRAND_KITS_QUERY_KEY } from "../_lib/query-key";
import { BrandKitFormDialog } from "./brand-kit-form-dialog";
import { BrandKitPreview } from "./brand-kit-preview";

export function BrandKitsManager({
  kits,
  canCreate,
  canUpgrade,
}: {
  kits: BrandKit[];
  /** False when the scope's plan limit is reached */
  canCreate: boolean;
  /** Personal scope: upgrading lifts the limit (team limits follow the owners' plan) */
  canUpgrade: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  const [editing, setEditing] = useState<BrandKit | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<BrandKit | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: BRAND_KITS_QUERY_KEY });
    router.refresh();
  };

  const openCreate = () => {
    if (!canCreate) {
      if (canUpgrade) openGetProDialog();
      else toast.error("This team has reached its brand kit limit.");
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (kit: BrandKit) => {
    setEditing(kit);
    setFormOpen(true);
  };

  const makeDefault = (kit: BrandKit) =>
    startTransition(async () => {
      const result = await setDefaultBrandKit(kit.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${kit.name} is now the default kit`);
      refresh();
    });

  const confirmDelete = () => {
    const kit = deleting;
    if (!kit) return;
    startTransition(async () => {
      const result = await deleteBrandKit(kit.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDeleting(null);
      toast.success(`Deleted ${kit.name}`);
      refresh();
    });
  };

  return (
    <>
      {kits.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-4 py-12 text-center">
          <div className="bg-primary/10 mb-6 rounded-full p-4">
            <Palette className="text-primary size-10" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">No brand kits yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md text-pretty text-sm">
            A brand kit stores your logo, colors and patterns so every QR code
            you make looks on-brand in one click.
          </p>
          <Button onClick={openCreate} size="lg">
            <Plus className="size-4" />
            Create your first brand kit
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              New brand kit
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kits.map((kit) => (
              <Card className="gap-0 overflow-hidden p-0" key={kit.id}>
                <button
                  aria-label={`Edit ${kit.name}`}
                  className="flex items-center justify-center bg-white p-6"
                  onClick={() => openEdit(kit)}
                  type="button"
                >
                  <BrandKitPreview kit={kit} size={150} />
                </button>
                <div className="flex items-center justify-between gap-2 border-t p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{kit.name}</span>
                    {kit.isDefault && (
                      <Badge variant="secondary">Default</Badge>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`Actions for ${kit.name}`}
                        disabled={isPending}
                        size="icon"
                        variant="ghost"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEdit(kit)}>
                        Edit
                      </DropdownMenuItem>
                      {!kit.isDefault && (
                        <DropdownMenuItem onSelect={() => makeDefault(kit)}>
                          <Star className="size-4" />
                          Make default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setDeleting(kit)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            Apply a kit from the{" "}
            <Link
              className="text-primary hover:underline"
              href="/playground?tab=customisations"
            >
              playground
            </Link>{" "}
            (Customisations tab, "Apply brand kit").
          </p>
        </div>
      )}

      <BrandKitFormDialog
        kit={editing}
        onOpenChange={setFormOpen}
        onSaved={refresh}
        open={formOpen}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              QR codes you already designed with this kit keep their look. This
              only removes the saved kit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              Delete brand kit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
