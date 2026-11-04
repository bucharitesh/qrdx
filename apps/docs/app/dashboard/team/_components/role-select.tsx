"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { cn } from "@repo/design-system/lib/utils";
import {
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/permissions";

/**
 * A role picker: the trigger shows the role, the list adds a one-line
 * description of what each role can do (lib/permissions.ts).
 */
export function RoleSelect({
  value,
  roles,
  onChange,
  disabled,
  id,
  label,
  className,
}: {
  value: WorkspaceRole;
  /** The roles on offer, strongest first */
  roles: readonly WorkspaceRole[];
  onChange: (role: WorkspaceRole) => void;
  disabled?: boolean;
  id?: string;
  /** Accessible name when there's no visible label */
  label?: string;
  className?: string;
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) => onChange(next as WorkspaceRole)}
      value={value}
    >
      <SelectTrigger
        aria-label={label}
        className={cn("w-32", className)}
        id={id}
      >
        <SelectValue>{WORKSPACE_ROLE_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="w-72" position="popper">
        {roles.map((role) => (
          <SelectItem className="items-start py-2" key={role} value={role}>
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="font-medium">{WORKSPACE_ROLE_LABELS[role]}</span>
              <span className="text-muted-foreground text-xs leading-snug text-pretty whitespace-normal">
                {WORKSPACE_ROLE_DESCRIPTIONS[role]}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
