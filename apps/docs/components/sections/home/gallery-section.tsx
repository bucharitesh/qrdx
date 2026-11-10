import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { ShowcaseWall } from "@/components/showcase/showcase-wall";
import {
  WALL_PATH,
  WallHeading,
  WallLink,
} from "@/components/showcase/wall-heading";
import { HOME_WALL } from "@/lib/landing/showcase-wall";

// Home page "Made with QRdx" wall: a curated selection of real codes, every
// content type in a look from every theme family, fading out into the page
// with "Show more" leading to the full wall on /community. Each tile opens
// the playground with its own look and content type (hosted page tiles open
// their live demo).

export function GallerySection() {
  return (
    <section
      id="gallery"
      aria-labelledby="gallery-heading"
      className="flex w-full flex-col gap-6 px-10 py-12 md:gap-8 md:py-16"
    >
      <WallHeading
        id="gallery-heading"
        title="Made with QRdx"
        description="Real QRdx codes with sample content. Scan any of them, or open one to make it yours."
        action={<WallLink href={WALL_PATH}>See all</WallLink>}
      />
      <div className="relative">
        <ShowcaseWall rows={HOME_WALL} fade />
        <div className="absolute inset-x-0 bottom-3 flex justify-center md:bottom-6">
          <Button
            asChild
            variant="outline"
            className="rounded-full bg-background px-5 shadow-sm dark:bg-background"
          >
            <Link href={WALL_PATH}>Show more</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
