import { cn } from "@repo/design-system/lib/utils";
import { AsciiField, type AsciiVariant } from "@/components/fx/ascii-field";
import { GridLines } from "@/components/fx/grid-lines";

interface SectionHeaderProps {
  children: React.ReactNode;
  /** Small mono label above the title, e.g. "Use cases". */
  eyebrow?: string;
  /** Hairline grid behind the header that lights up around the pointer. */
  grid?: boolean;
  /**
   * ASCII backdrop behind the header (instead of the grid). Neighbouring
   * sections should not share one; see .claude/build/BACKDROPS.md.
   */
  pattern?: AsciiVariant;
  /** Focal point for "halo" and "ramp", as fractions [x, y]. */
  focus?: readonly [number, number];
  className?: string;
}

export function SectionHeader({
  children,
  eyebrow,
  grid = false,
  pattern,
  focus,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "relative w-full h-full border-b p-10 md:p-14",
        (grid || pattern) && "overflow-hidden",
        className,
      )}
    >
      {pattern ? (
        <AsciiField
          variant={pattern}
          focus={focus}
          seed={11}
          className="[mask-image:radial-gradient(ellipse_75%_95%_at_50%_50%,rgba(0,0,0,0.3)_20%,black_55%,transparent_88%)]"
        />
      ) : (
        grid && <GridLines cell={40} />
      )}
      <div className="relative max-w-xl mx-auto flex flex-col items-center justify-center gap-2">
        {eyebrow && (
          <p className="mb-1 font-mono text-xs tracking-wider text-muted-foreground uppercase">
            {eyebrow}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
