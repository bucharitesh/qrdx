import { ScanBarcode as QrCode } from "iconsax-reactjs";

/**
 * Hosted page footer: the plan's "Made with QRdx" badge (Free) and the
 * "Report abuse" link every public page carries (white-label pages too).
 */
export function LandingPageFooter({
  badge,
  reportHref,
  badgeHref,
}: {
  badge: boolean;
  /** Absolute /report-abuse URL on the main site (works from custom domains) */
  reportHref: string;
  badgeHref: string;
}) {
  return (
    <footer className="lp-footer relative z-10 mx-auto flex w-full max-w-md flex-col items-center gap-3 px-5 pt-2 pb-8 text-xs">
      {badge && (
        <a
          className="inline-flex items-center gap-1.5 rounded-full bg-(--lp-muted) px-3 py-1.5 font-medium text-(--lp-fg) hover:brightness-95"
          href={badgeHref}
          rel="noopener"
          target="_blank"
        >
          <QrCode aria-hidden="true" className="size-3.5" />
          Made with QRdx
        </a>
      )}
      <a
        className="text-(--lp-muted-fg) underline-offset-2 hover:underline"
        href={reportHref}
        rel="nofollow noopener"
        target="_blank"
      >
        Report abuse
      </a>
    </footer>
  );
}
