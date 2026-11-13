// "Get set up": the first things worth doing in a workspace, ticked from
// real data. The app shell's launcher (components/app-shell/setup-guide.tsx)
// shows them on every app page; GET /api/setup-guide answers with the open
// workspace's tasks (lib/setup-guide-server.ts). Pure and client-safe.

export const SETUP_TASK_IDS = [
  "code",
  "page",
  "theme",
  "team",
  "domain",
] as const;

export type SetupTaskId = (typeof SETUP_TASK_IDS)[number];

export interface SetupTask {
  id: SetupTaskId;
  done: boolean;
}

/** GET /api/setup-guide */
export interface SetupGuideResponse {
  /** The workspace the tasks are for */
  workspaceId: string;
  /** Null for people who can't act on them (viewers): nothing is counted */
  tasks: SetupTask[] | null;
}

/**
 * What the tasks are ticked from. `teamSize` and `domains` are null where the
 * workspace's plan (or this deployment) doesn't offer teams or custom
 * domains: those tasks are left out rather than shown undoable.
 */
export interface SetupFacts {
  /** Dynamic codes, archived ones included (not in the trash) */
  codes: number;
  /** Hosted pages and forms */
  pages: number;
  /** Saved themes */
  themes: number;
  /** Members plus pending invitations, you included */
  teamSize: number | null;
  /** Custom domains connected (verified or not) */
  domains: number | null;
}

/** The checklist, in order, from the workspace's facts. */
export function setupTasks(facts: SetupFacts): SetupTask[] {
  const tasks: SetupTask[] = [
    { id: "code", done: facts.codes > 0 },
    { id: "page", done: facts.pages > 0 },
    { id: "theme", done: facts.themes > 0 },
  ];
  // Someone besides you, invited or joined.
  if (facts.teamSize !== null) {
    tasks.push({ id: "team", done: facts.teamSize > 1 });
  }
  if (facts.domains !== null) {
    tasks.push({ id: "domain", done: facts.domains > 0 });
  }
  return tasks;
}

export function setupProgress(tasks: readonly SetupTask[]): {
  done: number;
  total: number;
} {
  return {
    done: tasks.filter((task) => task.done).length,
    total: tasks.length,
  };
}

/**
 * Whether the launcher shows: only to people who can act on the tasks
 * (viewers just read), never once they dismissed it, and only while
 * something is left to do. `dismissed` and `tasks` are null while they're
 * still being read; nothing shows until both are known.
 */
export function showSetupGuide({
  canWrite,
  dismissed,
  tasks,
}: {
  canWrite: boolean;
  dismissed: boolean | null;
  tasks: readonly SetupTask[] | null;
}): boolean {
  if (!canWrite || dismissed !== false || !tasks || tasks.length === 0) {
    return false;
  }
  return tasks.some((task) => !task.done);
}

/**
 * This browser's "dismissed" flag. The key predates the launcher: it's the
 * one the dashboard home's card used, so people who hid the card stay
 * hidden. The account keeps its own copy (user.settings.spotlightsSeen,
 * SETUP_GUIDE_SEEN_ID).
 */
export const SETUP_GUIDE_HIDDEN_KEY = "qrdx:home-setup-hidden";
