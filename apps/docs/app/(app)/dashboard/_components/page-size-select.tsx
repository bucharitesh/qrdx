"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export interface PageSizeOption {
  value: number;
  /** "50 per page" */
  label: string;
  /** The list at this size, back on page 1 */
  href: string;
}

/** Rows per page for a dashboard table; the choice lives in the URL. */
export function PageSizeSelect({
  value,
  options,
  label,
}: {
  value: number;
  options: PageSizeOption[];
  /** The control's accessible name ("Rows per page") */
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Select
      disabled={isPending}
      onValueChange={(next) => {
        const option = options.find((item) => String(item.value) === next);
        if (!option) return;
        startTransition(() => router.push(option.href, { scroll: false }));
      }}
      value={String(value)}
    >
      <SelectTrigger aria-label={label} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
