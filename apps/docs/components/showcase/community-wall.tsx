import { ShowcaseWall } from "@/components/showcase/showcase-wall";
import { WallHeading } from "@/components/showcase/wall-heading";
import { WALL_TILES } from "@/lib/landing/showcase-gallery";
import { COMMUNITY_WALL } from "@/lib/landing/showcase-wall";

// The full "Made with QRdx" wall on /community: every tile, in titled bands
// (themes, frames, art and logos, content types) with an anchor each, so the
// page reads as a catalogue rather than one 200-tile scroll. Every image is
// lazy, so only the tiles near the viewport load.

export function CommunityWall() {
  return (
    <section
      id="made-with-qrdx"
      aria-labelledby="made-with-qrdx-heading"
      className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-8 px-10 pt-10 xl:px-6"
    >
      <WallHeading
        id="made-with-qrdx-heading"
        title="Made with QRdx"
        description={`${WALL_TILES.length} real codes made by QRdx with sample content: every theme, art style and content type, and the first official frames. Scan any of them.`}
        action={
          <nav aria-label="Wall sections" className="hidden md:block">
            <ul className="flex gap-4 text-sm">
              {COMMUNITY_WALL.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-muted-foreground rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {section.title.split(",")[0]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        }
      />
      {COMMUNITY_WALL.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-heading`}
          className="flex scroll-mt-20 flex-col gap-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3
              id={`${section.id}-heading`}
              className="text-lg font-semibold tracking-tight"
            >
              {section.title}
              <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
                {section.count}
              </span>
            </h3>
            <p className="text-muted-foreground text-sm">
              {section.description}
            </p>
          </div>
          <ShowcaseWall rows={section.rows} />
        </section>
      ))}
    </section>
  );
}
