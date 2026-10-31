/** biome-ignore-all lint/a11y/useButtonType: false positive */
"use client";

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { HamburgerMenu } from "iconsax-reactjs";
import {
  AnimatePresence,
  motion,
  useScroll,
  type Variants,
} from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GithubStars } from "@/components/github-stars";
import { HeaderMobileNavList } from "@/components/header-mobile-nav";
import { HeaderNav } from "@/components/header-nav";
import { DURATION, EASE } from "@/components/mockups/motion";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { QrdxLogo } from "../qrdx-logo";

const INITIAL_WIDTH = "70rem";
const MAX_WIDTH = "60rem";

// Animation variants
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const drawerVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.slow, ease: EASE },
  },
  exit: {
    opacity: 0,
    y: 16,
    scale: 0.98,
    transition: { duration: DURATION.fast, ease: EASE },
  },
};

const drawerMenuContainerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export function Navbar() {
  const { scrollY } = useScroll();
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = scrollY.on("change", (latest) => {
      setHasScrolled(latest > 10);
    });
    return unsubscribe;
  }, [scrollY]);

  const toggleDrawer = () => setIsDrawerOpen((prev) => !prev);
  const handleOverlayClick = () => setIsDrawerOpen(false);

  return (
    <header
      className={cn(
        "sticky z-20 mx-4 flex justify-center transition-all duration-300 md:mx-0",
        hasScrolled ? "top-6" : "top-4 mx-0",
      )}
    >
      <motion.div
        initial={{ width: INITIAL_WIDTH }}
        animate={{ width: hasScrolled ? MAX_WIDTH : INITIAL_WIDTH }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div
          className={cn(
            "mx-auto max-w-7xl rounded-2xl transition-all duration-300  xl:px-0",
            hasScrolled
              ? "px-2 border border-border backdrop-blur-lg bg-background/75"
              : "shadow-none px-7",
          )}
        >
          <div className="flex h-[56px] items-center justify-between p-4">
            <Link href="/" className="flex items-center gap-2">
              <QrdxLogo className="size-5 block fill-secondary-foreground lg:hidden" />
              <QrdxLogoAnimation size={30} className="hidden lg:block" />
              <p className="text-lg font-semibold text-secondary-foreground">
                QRdx
              </p>
            </Link>

            <HeaderNav />

            <div className="flex flex-row items-center gap-3 lg:gap-4 shrink-0">
              <div className="flex items-center gap-1">
                <GithubStars />
              </div>
              <Link className="hidden lg:block" href="/playground">
                <Button>Try the Playground</Button>
              </Link>
              <Button
                variant="secondary"
                className="lg:hidden"
                onClick={toggleDrawer}
                aria-label={isDrawerOpen ? "Close menu" : "Open menu"}
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
      </motion.div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              className="fixed z-49 inset-0 bg-black/50 backdrop-blur-sm"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={overlayVariants}
              transition={{ duration: 0.2 }}
              onClick={handleOverlayClick}
            />

            <motion.div
              className="fixed z-50 inset-x-0 w-[95%] mx-auto bottom-3 origin-bottom bg-background border border-border p-4 rounded-2xl shadow-lg"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={drawerVariants as Variants}
            >
              {/* Mobile menu content */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <Link href="/" className="flex items-center gap-2">
                    <QrdxLogo className="size-5 text-secondary-foreground" />
                    <p className="text-lg font-semibold text-secondary-foreground">
                      QRdx
                    </p>
                  </Link>
                  <button
                    onClick={toggleDrawer}
                    aria-label="Close menu"
                    className="grid size-8 cursor-pointer place-items-center rounded-lg border border-border transition-colors hover:bg-accent"
                  >
                    <Close aria-hidden className="size-5" />
                  </button>
                </div>

                <motion.div variants={drawerMenuContainerVariants}>
                  <HeaderMobileNavList
                    onNavigate={() => setIsDrawerOpen(false)}
                    className="max-h-[62vh] rounded-xl border border-border bg-muted/20 p-3"
                  />
                </motion.div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Link href="/playground">
                    <Button>Try the Playground</Button>
                  </Link>

                  <GithubStars full />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
