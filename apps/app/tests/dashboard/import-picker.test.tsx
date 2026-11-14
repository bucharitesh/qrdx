// Codes → Import: the provider picker never offers Dub (a partner, with its
// own integration, since 2026-11-05), while an earlier Dub import still shows
// in Recent imports so its undo stays reachable. The API side is covered in
// tests/api/dub-integration.test.ts and lib/migrate/migrate.test.ts.

import { describe, expect, it } from "vitest";
import { ProviderStep } from "@/app/(app)/dashboard/codes/_components/import-provider-step";
import type { JobSummary, ProviderStatus } from "@/lib/migrate/types";
import { renderIntl } from "../support/intl";

const status = (id: ProviderStatus["id"]): ProviderStatus => ({
  id,
  connection: "none",
  oauth: true,
  apiKey: null,
  available: true,
});

const DUB_JOB: JobSummary = {
  id: "job_dub",
  provider: "dub",
  createdAt: "2026-10-28T09:00:00.000Z",
  status: "done",
  total: 3,
  processed: 3,
  created: 3,
  skipped: 0,
  failed: 0,
  redirected: 2,
  undone: 0,
  backHalfDomain: null,
  domainAttachedAt: null,
};

function render(statuses: ProviderStatus[] | null, jobs: JobSummary[] = []) {
  const html = renderIntl(
    <ProviderStep
      jobs={jobs}
      onOpenJob={() => {}}
      onPickApi={() => {}}
      onPickFile={() => {}}
      statuses={statuses}
    />,
  );
  const [picker = "", rest = ""] = html.split("Recent imports");
  return { picker, recent: rest };
}

describe("Import provider picker", () => {
  it("lists Bitly, Rebrandly and Short.io but not Dub", () => {
    // Even a stale status entry for Dub doesn't bring the tile back.
    const { picker } = render([
      status("dub"),
      status("bitly"),
      status("rebrandly"),
      status("short-io"),
    ]);
    for (const name of ["Bitly", "Rebrandly", "Short.io"]) {
      expect(picker).toContain(`>${name}</span>`);
    }
    expect(picker).not.toMatch(/\bDub\b/);
  });

  it("leaves Dub out while the connections are still loading", () => {
    const { picker } = render(null);
    expect(picker).toContain(">Bitly</span>");
    expect(picker).not.toMatch(/\bDub\b/);
  });

  it("still shows an earlier Dub import in Recent imports", () => {
    const { picker, recent } = render([status("bitly")], [DUB_JOB]);
    expect(picker).not.toMatch(/\bDub\b/);
    expect(recent).toContain("Dub · 3 codes created");
    expect(recent).toContain("2 old links pointing to QRdx");
  });
});
