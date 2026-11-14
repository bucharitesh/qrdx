// "Get set up" (lib/setup-guide.ts): which tasks a workspace gets, and when
// the app shell's launcher shows.
import { describe, expect, it } from "vitest";
import {
  type SetupTask,
  setupProgress,
  setupTasks,
  showSetupGuide,
} from "@/lib/setup-guide";

const NONE = { codes: 0, pages: 0, themes: 0, teamSize: null, domains: null };

const tasks = (...done: boolean[]): SetupTask[] =>
  (["code", "page", "theme", "team", "domain"] as const)
    .slice(0, done.length)
    .map((id, index) => ({ id, done: done[index] ?? false }));

describe("setupTasks", () => {
  it("lists the three tasks every plan has, undone in a new workspace", () => {
    expect(setupTasks(NONE)).toEqual([
      { id: "code", done: false },
      { id: "page", done: false },
      { id: "theme", done: false },
    ]);
  });

  it("ticks each task from its own count", () => {
    expect(
      setupTasks({ ...NONE, codes: 3, themes: 1 }).map((task) => task.done),
    ).toEqual([true, false, true]);
    expect(setupTasks({ ...NONE, pages: 1 })[1]).toEqual({
      id: "page",
      done: true,
    });
  });

  it("adds team and domain only where the plan offers them", () => {
    const ids = (facts: Parameters<typeof setupTasks>[0]) =>
      setupTasks(facts).map((task) => task.id);
    expect(ids({ ...NONE, teamSize: 1 })).toEqual([
      "code",
      "page",
      "theme",
      "team",
    ]);
    expect(ids({ ...NONE, domains: 0 })).toEqual([
      "code",
      "page",
      "theme",
      "domain",
    ]);
    expect(ids({ ...NONE, teamSize: 1, domains: 0 })).toEqual([
      "code",
      "page",
      "theme",
      "team",
      "domain",
    ]);
  });

  it("needs someone besides you for the team task", () => {
    const team = (teamSize: number) =>
      setupTasks({ ...NONE, teamSize }).find((task) => task.id === "team");
    expect(team(1)?.done).toBe(false);
    expect(team(2)?.done).toBe(true);
  });

  it("ticks the domain task once one is connected", () => {
    const domain = (domains: number) =>
      setupTasks({ ...NONE, domains }).find((task) => task.id === "domain");
    expect(domain(0)?.done).toBe(false);
    expect(domain(1)?.done).toBe(true);
  });
});

describe("setupProgress", () => {
  it("counts done and total", () => {
    expect(setupProgress(tasks(true, false, true, false, false))).toEqual({
      done: 2,
      total: 5,
    });
    expect(setupProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("showSetupGuide", () => {
  const someOpen = tasks(true, false, true);
  const allDone = tasks(true, true, true, true, true);

  it("shows to a member who can act while some tasks are open", () => {
    expect(
      showSetupGuide({ canWrite: true, dismissed: false, tasks: someOpen }),
    ).toBe(true);
    expect(
      showSetupGuide({
        canWrite: true,
        dismissed: false,
        tasks: tasks(false, false, false),
      }),
    ).toBe(true);
  });

  it("never shows to a read-only member", () => {
    expect(
      showSetupGuide({ canWrite: false, dismissed: false, tasks: someOpen }),
    ).toBe(false);
  });

  it("goes once every task is done", () => {
    expect(
      showSetupGuide({ canWrite: true, dismissed: false, tasks: allDone }),
    ).toBe(false);
  });

  it("never shows again after it was dismissed", () => {
    expect(
      showSetupGuide({ canWrite: true, dismissed: true, tasks: someOpen }),
    ).toBe(false);
  });

  it("waits until both the dismissal and the tasks are known", () => {
    expect(
      showSetupGuide({ canWrite: true, dismissed: null, tasks: someOpen }),
    ).toBe(false);
    expect(
      showSetupGuide({ canWrite: true, dismissed: false, tasks: null }),
    ).toBe(false);
    expect(
      showSetupGuide({ canWrite: true, dismissed: false, tasks: [] }),
    ).toBe(false);
  });
});
