"use client";

import { toast } from "@repo/design-system";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { OrganizeResult } from "@/app/dashboard/codes/_lib/organize";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

type Message<T> = string | ((data: T) => string | null);

interface RunOptions<T> {
  /** Toast shown on success (null/omitted: none) */
  success?: Message<T>;
  description?: Message<T>;
  /** Undo button on the success toast */
  undo?: () => Promise<unknown>;
  onSuccess?: (data: T) => void;
  /** Skip router.refresh() (e.g. the caller navigates) */
  refresh?: boolean;
}

const resolve = <T>(message: Message<T> | undefined, data: T) =>
  typeof message === "function" ? message(data) : (message ?? null);

/** Runs an organize action with error toasts, upgrade prompts and a refresh. */
export function useOrganizeAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );

  const run = useCallback(
    <T>(
      action: () => Promise<OrganizeResult<T>>,
      options: RunOptions<T> = {},
    ) =>
      new Promise<T | null>((done) => {
        startTransition(async () => {
          const result = await action();
          if (!result.success) {
            const upgrade =
              result.error.code === "LIMIT_REACHED" ||
              result.error.code === "PLAN_REQUIRED";
            toast.error(
              result.error.message,
              upgrade
                ? { action: { label: "Upgrade", onClick: openGetProDialog } }
                : undefined,
            );
            done(null);
            return;
          }
          const title = resolve(options.success, result.data);
          if (title) {
            const description = resolve(options.description, result.data);
            const undo = options.undo;
            toast.success(title, {
              ...(description && { description }),
              ...(undo && {
                action: {
                  label: "Undo",
                  onClick: () => {
                    undo().then(() => router.refresh());
                  },
                },
              }),
            });
          }
          options.onSuccess?.(result.data);
          if (options.refresh !== false) router.refresh();
          done(result.data);
        });
      }),
    [openGetProDialog, router],
  );

  return { run, isPending };
}

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;
