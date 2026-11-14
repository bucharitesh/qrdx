/** biome-ignore-all lint/a11y/useButtonType: false positive */
"use client";

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { HamburgerMenu } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { GithubStars } from "@/components/github-stars";
import { HeaderAccountLink } from "@/components/header-account-link";
import bar from "@/components/header-bar.module.css";
import { HeaderMobileNavList } from "@/components/header-mobile-nav";
import { HeaderNav } from "@/components/header-nav";
import { LocaleLink } from "@/components/i18n/locale-link";
import { EASE_CLASS } from "@/components/mockups/motion";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { QrdxLogo } from "../qrdx-logo";

// Plain CSS transitions and tw-animate-css keyframes, no motion library:
// this bar is on every marketing page, so it stays light.

const INITIAL_WIDTH = "70rem";
// Wide enough for the full row (signed in, with the GitHub pill) with real
// gaps; narrower and the links run into each other.
const SCROLLED_WIDTH = "66rem";

/** The drawer's exit (and the overlay's) before it unmounts. */
const DRAWER_EXIT_MS = 150;

type DrawerState = "closed" | "open" | "closing";

export function Navbar() {
  const t = useTranslations("nav");
  const [hasScrolled, setHasScrolled] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>("closed");
  const isDrawerOpen = drawer === "open";
  const pillRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // How far the logo and the buttons slide in when the bar floats.
  const [slide, setSlide] = useState(0);

  // The floating pill is narrower, with less padding. Its surface is laid
  // out at that size from the start (it only fades in), so the slide is the
  // distance from the bar's padding edge to the surface's.
  useEffect(() => {
    const pill = pillRef.current;
    const surface = surfaceRef.current;
    const wrapper = pill?.parentElement;
    if (!(pill && surface && wrapper)) return;
    const measure = () => {
      const inset =
        surface.getBoundingClientRect().left -
        wrapper.getBoundingClientRect().left;
      const pad = (el: Element) =>
        Number.parseFloat(getComputedStyle(el).paddingLeft) || 0;
      setSlide(inset + pad(surface) - pad(pill));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setHasScrolled(window.scrollY > 10);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Closing plays the exit, then unmounts (instantly with reduced motion).
  useEffect(() => {
    if (drawer !== "closing") return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const id = window.setTimeout(
      () => setDrawer("closed"),
      reduce ? 0 : DRAWER_EXIT_MS,
    );
    return () => window.clearTimeout(id);
  }, [drawer]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer("closing");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  const closeDrawer = () =>
    setDrawer((prev) => (prev === "open" ? "closing" : prev));
  const toggleDrawer = () =>
    setDrawer((prev) => (prev === "open" ? "closing" : "open"));

  const slideStyle = (direction: 1 | -1): CSSProperties | undefined =>
    hasScrolled ? { translate: `${direction * slide}px 0` } : undefined;

  return (
    // At the top the bar sits in its own band, ruled off like the page's other
    // grid lines, so a hero's backdrop starts below it instead of under the
    // links. Scrolled, it floats as a pill. The band's height never changes
    // (the pill moves with the sticky offset), so scrolling shifts no content.
    // Nothing in the bar changes its layout between the two, so scrolling
    // makes no layout shift either: the pill's surface is laid out at its
    // floating size and only fades in, the logo and the buttons slide in
    // with `translate`, and the drop is the sticky offset (top-2), which the
    // browser doesn't count as a shift. (Changing the width, padding and
    // margin did, at every switch.) A translate for the drop instead drew
    // the text a pixel lower than the approved floating look.
    // No transform on the header: it would trap the drawer's fixed overlay.
    <header
      className={cn(
        "sticky flex justify-center border-b py-2 transition-[border-color,top] duration-300 motion-reduce:transition-none",
        hasScrolled ? "top-2 border-transparent" : "top-0 border-border",
        // The header is the drawer's stacking context: while the drawer is
        // up, lift it above page-level layers (the cookie banner is z-50).
        drawer === "closed" ? "z-20" : "z-[60]",
      )}
    >
      <div
        className="relative max-w-full"
        style={
          {
            width: INITIAL_WIDTH,
            "--scrolled-width": SCROLLED_WIDTH,
          } as CSSProperties
        }
      >
        {/* The floating pill: SCROLLED_WIDTH wide (on phones, a margin in
            from each side), with px-1 for the slide above to measure. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 inset-x-4 rounded-2xl border px-1 backdrop-blur-lg transition-opacity duration-300 motion-reduce:transition-none md:inset-x-[max(0px,calc((100%-var(--scrolled-width))/2))]",
            bar.bar,
            bar.surface,
            bar.floating,
            hasScrolled ? "opacity-100" : "opacity-0",
          )}
          data-navbar-surface=""
          ref={surfaceRef}
        />
        <div
          className="relative mx-auto rounded-2xl border border-transparent px-3 lg:px-7 xl:px-0"
          ref={pillRef}
        >
          <div className="flex h-14 items-center justify-between gap-6 px-4">
            <LocaleLink
              href="/"
              className="flex shrink-0 items-center gap-2 transition-[translate] duration-300 ease-[cubic-bezier(.25,.1,.25,1)] motion-reduce:transition-none"
              style={slideStyle(1)}
            >
              <QrdxLogo className="size-5 block fill-secondary-foreground lg:hidden" />
              <QrdxLogoAnimation size={30} className="hidden lg:block" />
              <p className="text-lg font-semibold text-secondary-foreground">
                QRdx
              </p>
            </LocaleLink>

            <HeaderNav />

            <div
              className="flex flex-row items-center gap-3 lg:gap-4 shrink-0 transition-[translate] duration-300 ease-[cubic-bezier(.25,.1,.25,1)] motion-reduce:transition-none"
              style={slideStyle(-1)}
            >
              {/* Off between lg and xl, where the links and buttons fill the bar. */}
              <div className="hidden items-center sm:flex lg:hidden xl:flex">
                <GithubStars />
              </div>
              {/* Under 360px it would cover the logo; the drawer has it. */}
              <HeaderAccountLink className="max-[359px]:hidden" compact />
              <Button
                variant="secondary"
                className="lg:hidden"
                onClick={toggleDrawer}
                aria-label={isDrawerOpen ? t("closeMenu") : t("openMenu")}
                aria-expanded={isDrawerOpen}
              >
                {isDrawerOpen ? (
                  <Close aria-hidden className="size-5" />
                ) : (
                  <HamburgerMenu aria-hidden className="size-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawer !== "closed" && (
        <>
          <div
            aria-hidden="true"
            className={cn(
              "fixed z-49 inset-0 bg-black/50 backdrop-blur-sm motion-reduce:animate-none",
              isDrawerOpen
                ? "animate-in fade-in-0 duration-200"
                : "animate-out fade-out-0 fill-mode-forwards duration-150",
            )}
            onClick={closeDrawer}
          />

          <div
            className={cn(
              "fixed z-50 inset-x-0 w-[95%] mx-auto bottom-3 origin-bottom bg-background border border-border p-4 rounded-2xl shadow-lg motion-reduce:animate-none",
              EASE_CLASS,
              isDrawerOpen
                ? "animate-in fade-in-0 slide-in-from-bottom-6 zoom-in-98 duration-300"
                : "animate-out fade-out-0 slide-out-to-bottom-4 zoom-out-98 fill-mode-forwards duration-150",
            )}
          >
            {/* Mobile menu content */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <LocaleLink href="/" className="flex items-center gap-2">
                  <QrdxLogo className="size-5 text-secondary-foreground" />
                  <p className="text-lg font-semibold text-secondary-foreground">
                    QRdx
                  </p>
                </LocaleLink>
                <button
                  onClick={closeDrawer}
                  aria-label={t("closeMenu")}
                  className="grid size-8 cursor-pointer place-items-center rounded-lg border border-border transition-colors hover:bg-accent"
                >
                  <Close aria-hidden className="size-5" />
                </button>
              </div>

              <HeaderMobileNavList
                onNavigate={() => setDrawer("closed")}
                className="max-h-[62vh] rounded-xl border border-border bg-muted/20 p-3"
              />

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <HeaderAccountLink onNavigate={closeDrawer} />
                <GithubStars full />
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
