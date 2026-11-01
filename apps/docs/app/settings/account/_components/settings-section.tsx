import {
  Card,
  CardDescription,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";

/** A titled settings card; rows inside are separated by hairlines. */
export function SettingsSection({
  id,
  title,
  description,
  action,
  tone,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Shown at the top right (stacks under the title on phones) */
  action?: ReactNode;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="scroll-mt-24" id={id}>
      <Card
        className={cn(
          "gap-0 overflow-hidden py-0",
          tone === "danger" && "border-destructive/30",
        )}
      >
        <div className="flex flex-col gap-3 border-b px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
          <div className="min-w-0 space-y-1.5">
            <CardTitle
              className={cn(
                "text-base",
                tone === "danger" && "text-destructive",
              )}
              id={`${id}-title`}
            >
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="text-pretty">
                {description}
              </CardDescription>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        <div className="divide-y">{children}</div>
      </Card>
    </section>
  );
}

/** Label and help on the left, the control on the right; stacked on phones. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** Id of the control the label names */
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10">
      <div className="space-y-1">
        {htmlFor ? (
          <label className="text-sm font-medium" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium">{label}</p>
        )}
        {description && (
          <p className="text-muted-foreground text-xs leading-relaxed text-pretty">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
