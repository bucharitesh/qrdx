"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Progress } from "@repo/design-system/components/ui/progress";
import { cn } from "@repo/design-system/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown2, ArrowRight2, TickCircle } from "iconsax-reactjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  useCan,
  useWorkspace,
  useWorkspaceHref,
  workspaceRequestHeaders,
} from "@/components/workspace-provider";
import { playgroundHref } from "@/lib/playground-links";
import {
  SETUP_GUIDE_HIDDEN_KEY,
  type SetupGuideResponse,
  type SetupTask,
  type SetupTaskId,
  setupProgress,
  showSetupGuide,
} from "@/lib/setup-guide";
import type { SpotlightId } from "@/lib/spotlights";
import { useCreate } from "./create-actions";
import { useSpotlightsSeen } from "./feature-spotlight";
import { focusPage } from "./focus-page";
import styles from "./setup-guide.module.css";

/** The account's copy of "dismissed" (user.settings.spotlightsSeen). */
const SEEN_ID: SpotlightId = "setup-guide";

/** Space kept between the launcher (or its panel) and what stacks above it. */
const GAP_PX = 12;

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(SETUP_GUIDE_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden() {
  try {
    window.localStorage.setItem(SETUP_GUIDE_HIDDEN_KEY, "1");
  } catch {
    // Blocked storage: the account's copy still has it.
  }
}

async function fetchSetupGuide(
  workspaceId: string,
): Promise<SetupTask[] | null> {
  const response = await fetch("/api/setup-guide", {
    cache: "no-store",
    headers: workspaceRequestHeaders(),
  });
  // Quietly: a signed-out tab or a failed count just shows no launcher.
  if (!response.ok) throw new Error(`setup-guide ${response.status}`);
  const body = (await response.json()) as SetupGuideResponse;
  // The tab switched workspaces while this was on its way.
  if (body.workspaceId !== workspaceId) throw new Error("setup-guide stale");
  return body.tasks;
}

/** A thin ring filled to done/total, in the accent colour. */
function ProgressRing({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const share = total > 0 ? done / total : 0;
  return (
    <svg
      aria-hidden
      className={cn("-rotate-90", className)}
      fill="none"
      viewBox="0 0 36 36"
    >
      <circle
        className="stroke-foreground/12"
        cx="18"
        cy="18"
        r={radius}
        strokeWidth="3.5"
      />
      {done > 0 && (
        <circle
          className="stroke-primary motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500"
          cx="18"
          cy="18"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          strokeLinecap="round"
          strokeWidth="3.5"
        />
      )}
    </svg>
  );
}

const ROW =
  "flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm";

function OpenTask({
  label,
  action,
  href,
  onFollow,
}: {
  label: string;
  /** The verb on the right: Create, Invite, ... */
  action: string;
  /** A page to go to; without one, `onFollow` does the task's action */
  href?: string;
  onFollow: () => void;
}) {
  const className = cn(
    ROW,
    "group hover:bg-muted focus-visible:ring-ring/50 outline-none transition-colors focus-visible:ring-[3px]",
  );
  const body: ReactNode = (
    <>
      <span
        aria-hidden
        className="border-muted-foreground/45 m-0.5 size-4 shrink-0 rounded-full border-[1.5px]"
      />
      <span className="min-w-0 flex-1">{label}</span>
      <span
        aria-hidden
        className="text-muted-foreground group-hover:text-foreground flex shrink-0 items-center gap-1 text-xs font-medium transition-colors"
      >
        {action}
        <ArrowRight2 className="size-3" />
      </span>
    </>
  );
  return href ? (
    <Link className={className} href={href} onClick={onFollow}>
      {body}
    </Link>
  ) : (
    <button className={className} onClick={onFollow} type="button">
      {body}
    </button>
  );
}

/**
 * "Get set up": a small launcher in the app's bottom right corner (a round
 * progress button on phones) that opens the checklist in a popover. Only for
 * people who can act on the tasks, only while some are left, and never
 * again once dismissed (this browser and the account remember it).
 *
 * The tasks come from GET /api/setup-guide, fetched by this component only
 * when it may show: again on each page change, when the panel opens and
 * when the tab regains focus, so a finished task ticks without a reload.
 *
 * While it's on screen it sets, on <body>, data-setup-guide and two
 * clearances (px from the bottom of the window): --setup-guide-clearance
 * above the launcher, which the app frame adds below the page so nothing
 * ends under it, and --setup-guide-toast-clearance above the launcher or
 * its open panel, which the toaster's bottom offset reads (app/providers.tsx).
 */
export function SetupGuide() {
  const t = useTranslations("app.shell.setupGuide");
  const workspace = useWorkspace();
  const canWrite = useCan("content.write");
  const href = useWorkspaceHref();
  const create = useCreate();
  const spotlights = useSpotlightsSeen();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  // Null until this browser's flag is read.
  const [hiddenHere, setHiddenHere] = useState<boolean | null>(null);
  useEffect(() => setHiddenHere(readHidden()), []);
  const dismissed =
    hiddenHere === null || spotlights === null
      ? null
      : hiddenHere || spotlights.seen.has(SEEN_ID);

  // The card on the old home page only remembered Hide in this browser:
  // copy it to the account, once.
  useEffect(() => {
    if (hiddenHere && spotlights && !spotlights.seen.has(SEEN_ID)) {
      spotlights.markSeen(SEEN_ID);
    }
  }, [hiddenHere, spotlights]);

  const workspaceId = workspace?.id ?? null;
  const enabled = workspaceId !== null && canWrite && dismissed === false;
  const query = useQuery({
    queryKey: ["setup-guide", workspaceId],
    queryFn: () => fetchSetupGuide(workspaceId ?? ""),
    enabled,
    // Refreshed by the triggers below, not on a timer.
    staleTime: 2000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // A page change may follow a finished task (a new code, a saved theme).
  const lastPath = useRef(pathname);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per page change only
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (!enabled) return;
    void queryClient.refetchQueries({
      queryKey: ["setup-guide", workspaceId],
      stale: true,
      type: "active",
    });
  }, [pathname]);

  const tasks = query.data ?? null;
  const visible = showSetupGuide({ canWrite, dismissed, tasks });

  const [open, setOpen] = useState(false);
  // Set when focus is already taken care of as the panel closes.
  const keepFocus = useRef(false);
  const titleId = useId();
  const cornerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      keepFocus.current = false;
      void query.refetch();
    }
  };
  /** A task was followed: close, and let the page it opens keep focus. */
  const follow = (run?: () => void) => () => {
    keepFocus.current = true;
    setOpen(false);
    run?.();
  };
  const dismiss = () => {
    // The launcher goes for good, and the control holding focus with it:
    // hand focus to the page first, rather than losing it to <body>.
    const active = document.activeElement;
    if (
      active &&
      (panelRef.current?.contains(active) ||
        cornerRef.current?.contains(active))
    ) {
      keepFocus.current = true;
      focusPage();
    }
    writeHidden();
    setHiddenHere(true);
    spotlights?.markSeen(SEEN_ID);
    setOpen(false);
  };

  // Room for the launcher (and its open panel) at the bottom of the window.
  const measure = useCallback(() => {
    const corner = cornerRef.current;
    if (!corner) return;
    const height = window.innerHeight;
    const launcher = Math.ceil(
      height - corner.getBoundingClientRect().top + GAP_PX,
    );
    const panel = panelRef.current;
    const above =
      panel?.dataset.side === "top"
        ? Math.ceil(height - panel.getBoundingClientRect().top + GAP_PX)
        : 0;
    const { style } = document.body;
    style.setProperty("--setup-guide-clearance", `${launcher}px`);
    style.setProperty(
      "--setup-guide-toast-clearance",
      `${Math.max(launcher, above)}px`,
    );
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    const { body } = document;
    body.setAttribute("data-setup-guide", "");
    measure();
    const corner = cornerRef.current;
    const resize = new ResizeObserver(measure);
    if (corner) resize.observe(corner);
    // A list's selection bar opening or closing moves the launcher (CSS).
    const attributes = new MutationObserver(measure);
    attributes.observe(body, {
      attributeFilter: ["data-selection-bar"],
      subtree: true,
    });
    corner?.addEventListener("transitionend", measure);
    window.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      attributes.disconnect();
      corner?.removeEventListener("transitionend", measure);
      window.removeEventListener("resize", measure);
      body.removeAttribute("data-setup-guide");
      body.style.removeProperty("--setup-guide-clearance");
      body.style.removeProperty("--setup-guide-toast-clearance");
    };
  }, [visible, measure]);

  // The panel mounts in a portal after it opens: measure once it's there,
  // follow its size, and measure again when it closes.
  const panelResize = useRef<ResizeObserver | null>(null);
  const setPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panelResize.current?.disconnect();
      panelResize.current = null;
      panelRef.current = node;
      if (node) {
        panelResize.current = new ResizeObserver(measure);
        panelResize.current.observe(node);
      }
      measure();
    },
    [measure],
  );

  if (!(visible && tasks)) return null;

  const { done, total } = setupProgress(tasks);
  const rows: Record<SetupTaskId, { label: string; open: ReactNode }> = {
    code: {
      label: t("createADynamicQrCode"),
      open: (
        <OpenTask
          action={t("create")}
          label={t("createADynamicQrCode")}
          onFollow={follow(() => create("code"))}
        />
      ),
    },
    page: {
      label: t("makeALandingPageOr"),
      open: (
        <OpenTask
          action={t("start")}
          label={t("makeALandingPageOr")}
          onFollow={follow(() => create("page"))}
        />
      ),
    },
    theme: {
      label: t("saveAThemeWithYour"),
      open: (
        <OpenTask
          action={t("design")}
          href={playgroundHref({ tab: "design", section: "logo" })}
          label={t("saveAThemeWithYour")}
          onFollow={follow()}
        />
      ),
    },
    team: {
      label: t("inviteATeammate"),
      open: (
        <OpenTask
          action={t("invite")}
          href={href("/settings/team")}
          label={t("inviteATeammate")}
          onFollow={follow()}
        />
      ),
    },
    domain: {
      label: t("connectACustomDomain"),
      open: (
        <OpenTask
          action={t("connect")}
          href={href("/settings/domains")}
          label={t("connectACustomDomain")}
          onFollow={follow()}
        />
      ),
    },
  };

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <div className={styles.corner} data-setup-launcher="" ref={cornerRef}>
        <PopoverTrigger asChild>
          <Button
            aria-label={t("launcherLabel", { done, length: total })}
            className={cn(
              "bg-popover dark:bg-popover dark:hover:bg-accent data-[state=open]:bg-accent shadow-lg",
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-300",
              // Phones: a round progress button.
              "relative size-11",
              // From md: a pill.
              "md:h-10 md:w-auto md:gap-2 md:pr-3.5 md:pl-2.5",
            )}
            size="icon-lg"
            variant="outline"
          >
            <ProgressRing
              className="size-8 md:size-5"
              done={done}
              total={total}
            />
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums md:hidden"
            >
              {t("doneOfLengthShort", { done, length: total })}
            </span>
            <span aria-hidden className="hidden text-sm font-medium md:inline">
              {t("getSetUp")}
            </span>
            <span
              aria-hidden
              className="text-muted-foreground hidden text-xs tabular-nums md:inline"
            >
              {t("doneOfLengthShort", { done, length: total })}
            </span>
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        align="end"
        aria-labelledby={titleId}
        className="w-[min(22.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl p-0 shadow-lg"
        collisionPadding={12}
        onAnimationEnd={measure}
        onCloseAutoFocus={(event) => {
          // Following a task opens a page or a dialog, and Dismiss guide
          // hands focus to the page: it stays there.
          if (keepFocus.current) event.preventDefault();
        }}
        ref={setPanel}
        side="top"
        sideOffset={10}
      >
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold" id={titleId}>
              {t("getSetUp")}
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
              {t("doneOfLengthDone", { done, length: total })}
            </p>
          </div>
          <Button
            aria-label={t("collapse")}
            className="text-muted-foreground -mt-1 -mr-1.5"
            onClick={() => setOpen(false)}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowDown2 aria-hidden className="size-4" />
          </Button>
        </div>
        <div className="px-4 pb-3">
          <Progress
            aria-label={t("setupTasksDone")}
            className="bg-muted h-1.5"
            value={(done / total) * 100}
          />
        </div>
        <ul className="border-t p-1.5">
          {tasks.map((task) => (
            <li key={task.id}>
              {task.done ? (
                <div className={cn(ROW, "text-muted-foreground")}>
                  <TickCircle
                    aria-hidden
                    className="text-primary size-5 shrink-0"
                    variant="Bold"
                  />
                  <span className="decoration-muted-foreground/50 min-w-0 flex-1 line-through">
                    {rows[task.id].label}
                    <span className="sr-only"> {t("done")}</span>
                  </span>
                </div>
              ) : (
                rows[task.id].open
              )}
            </li>
          ))}
        </ul>
        <div className="flex justify-end border-t p-1.5">
          <Button
            className="text-muted-foreground"
            onClick={dismiss}
            size="sm"
            variant="ghost"
          >
            {t("dismissGuide")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
