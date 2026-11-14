import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  href,
  alert = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** The list behind the number */
  href?: string;
  /** Draws attention (something needs a look) */
  alert?: boolean;
}) {
  const card = (
    <Card
      className={cn(
        "h-full gap-2 py-4",
        href && "hover:bg-muted/50 transition-colors",
        alert && "border-foreground/40",
      )}
    >
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="text-muted-foreground px-4 text-xs">
          {hint}
        </CardContent>
      )}
    </Card>
  );
  return href ? (
    <Link className="block rounded-xl focus-visible:outline-2" href={href}>
      {card}
    </Link>
  ) : (
    card
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="min-w-0 px-4">{children}</CardContent>
    </Card>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">{children}</p>
  );
}
