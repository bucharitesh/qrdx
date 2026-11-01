import { Info } from "@repo/design-system/components/icons";
import { compareMigration } from "@/lib/migrate/compare";
import { CompareMigrateButton } from "./compare-migrate-button";

interface CompareMigrateProps {
  slug: string;
  competitor: string;
}

/** "Switch in minutes": three steps, what happens to printed codes, the button. */
export function CompareMigrate({ slug, competitor }: CompareMigrateProps) {
  const migration = compareMigration(slug, competitor);

  return (
    <section className="w-full px-6 py-14 md:py-16" id="switch">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Switch in minutes
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
            {migration.kind === "library"
              ? `Switch from ${competitor} to qrdx`
              : `Move from ${competitor} to QRdx`}
          </h2>
        </div>

        <ol className="grid gap-3 sm:grid-cols-3">
          {migration.steps.map((step, index) => (
            <li className="rounded-xl border bg-card p-5" key={step}>
              <span className="grid size-7 place-items-center rounded-full border text-xs font-medium tabular-nums">
                {index + 1}
              </span>
              <p className="mt-3 text-sm text-pretty">{step}</p>
            </li>
          ))}
        </ol>

        <div className="flex gap-3 rounded-xl border bg-muted/40 p-5 text-sm dark:bg-card">
          <Info
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-foreground/70"
          />
          <div className="space-y-1">
            <p className="font-medium">Printed codes</p>
            <p className="text-muted-foreground text-pretty">
              {migration.printed}
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <CompareMigrateButton
            docs={migration.kind === "library"}
            href={migration.href}
            label={migration.label}
            variant="default"
          />
        </div>
      </div>
    </section>
  );
}
