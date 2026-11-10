import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportDialog } from "@/app/dashboard/codes/_components/import-dialog";

export const metadata: Metadata = {
  title: "Import preview",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Development only: the import dialog against the in-memory mock
 * (lib/migrate/mock.ts), without signing in. 404 in every other build, and
 * without ?mock=1. `?import=<provider>` and `?plan=free` work as usual.
 */
export default async function MigrateDevPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  if ((await searchParams).mock !== "1") notFound();
  return (
    <main className="bg-background mx-auto flex min-h-dvh max-w-5xl items-start justify-between gap-4 px-4 py-10 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dynamic QR codes
        </h1>
        <p className="text-muted-foreground text-sm">
          Import dialog preview with mock data (development only).
        </p>
      </div>
      <ImportDialog defaultOpen mock />
    </main>
  );
}
