import { cn } from "@repo/design-system/lib/utils";
import { Eye } from "iconsax-reactjs";
import type { ReactNode } from "react";

// Viewers and billing members (lib/permissions.ts: no "content.write") see
// forms as they are, disabled, with one line saying why. The server refuses
// every save anyway; this keeps them from pressing Save in the first place.

export function ViewOnlyNotice({
  children = "You have view-only access, so nothing here can be changed.",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm text-pretty",
        className,
      )}
    >
      <Eye aria-hidden className="size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * `children` unchanged, or (readOnly) disabled inside a native fieldset:
 * every button, input, select and switch in it is off, Save included,
 * while links keep working.
 */
export function ViewOnly({
  readOnly,
  notice,
  children,
}: {
  readOnly: boolean;
  notice?: ReactNode;
  children: ReactNode;
}) {
  if (!readOnly) return children;
  return (
    <div className="space-y-3">
      <ViewOnlyNotice>{notice}</ViewOnlyNotice>
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled>
        {children}
      </fieldset>
    </div>
  );
}
