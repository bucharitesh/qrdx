"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Progress } from "@repo/design-system/components/ui/progress";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight2, TickCircle } from "iconsax-reactjs";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { useCreate } from "@/components/app-shell/create-actions";
import { useCan, useWorkspaceHref } from "@/components/workspace-provider";
import { playgroundHref } from "@/lib/playground-links";
import type { SetupTask } from "./home-data";

const HIDDEN_KEY = "qrdx:home-setup-hidden";

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden() {
  try {
    window.localStorage.setItem(HIDDEN_KEY, "1");
  } catch {
    // Private mode or blocked storage: it hides for this visit only.
  }
}

function TaskRow({
  done,
  label,
  action,
}: {
  done: boolean;
  label: string;
  action: ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center gap-3 py-1.5">
      {done ? (
        <TickCircle
          aria-hidden
          className="text-primary size-5 shrink-0"
          variant="Bold"
        />
      ) : (
        <span
          aria-hidden
          className="border-muted-foreground/40 m-0.5 size-4 shrink-0 rounded-full border-[1.5px]"
        />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {label}
        {done && <span className="sr-only"> (done)</span>}
      </span>
      {!done && action}
    </li>
  );
}

function TaskLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild className="shrink-0" size="sm" variant="ghost">
      <Link href={href}>
        {children}
        <ArrowRight2 aria-hidden className="size-3.5" />
      </Link>
    </Button>
  );
}

/**
 * "Get set up": the first things worth doing, ticked from real data. Gone
 * once everything is done, or after Hide (remembered in this browser).
 */
export function SetupChecklist({ tasks }: { tasks: SetupTask[] }) {
  const create = useCreate();
  const href = useWorkspaceHref();
  // Setting up is for people who can create; viewers just read.
  const canWrite = useCan("content.write");
  const [hidden, setHidden] = useState(false);
  useEffect(() => setHidden(readHidden()), []);

  const done = tasks.filter((task) => task.done).length;
  if (!canWrite || hidden || done === tasks.length) return null;

  const rows: Record<SetupTask["id"], { label: string; action: ReactNode }> = {
    code: {
      label: "Create a dynamic QR code",
      action: (
        <Button
          className="shrink-0"
          onClick={() => create("code")}
          size="sm"
          variant="ghost"
        >
          Create
          <ArrowRight2 aria-hidden className="size-3.5" />
        </Button>
      ),
    },
    page: {
      label: "Make a landing page or form",
      action: (
        <Button
          className="shrink-0"
          onClick={() => create("page")}
          size="sm"
          variant="ghost"
        >
          Start
          <ArrowRight2 aria-hidden className="size-3.5" />
        </Button>
      ),
    },
    theme: {
      label: "Save a theme with your logo and colors",
      action: (
        <TaskLink href={playgroundHref({ tab: "design", section: "logo" })}>
          Design
        </TaskLink>
      ),
    },
    team: {
      label: "Invite a teammate",
      action: <TaskLink href={href("/settings/team")}>Invite</TaskLink>,
    },
    domain: {
      label: "Connect a custom domain",
      action: <TaskLink href={href("/settings/domains")}>Connect</TaskLink>,
    },
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <CardTitle className="text-base">Get set up</CardTitle>
          <div className="flex items-center gap-3">
            <Progress
              aria-label="Setup tasks done"
              className="bg-muted h-1.5 max-w-48"
              value={(done / tasks.length) * 100}
            />
            <span className="text-muted-foreground shrink-0 text-xs">
              {done} of {tasks.length} done
            </span>
          </div>
        </div>
        <Button
          className="text-muted-foreground shrink-0"
          onClick={() => {
            writeHidden();
            setHidden(true);
          }}
          size="sm"
          variant="ghost"
        >
          Hide
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">
          {tasks.map((task) => (
            <TaskRow
              action={rows[task.id].action}
              done={task.done}
              key={task.id}
              label={rows[task.id].label}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
