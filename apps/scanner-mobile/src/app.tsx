import { Share } from "@capacitor/share";
import { Toaster } from "@repo/design-system";
import { LogoMark } from "@repo/design-system/components/brand/brand-marks";
import { Button } from "@repo/design-system/components/ui/button";
import { Share as ShareIcon } from "iconsax-reactjs";
import { useTranslations } from "use-intl";
import { ResultActions } from "@/components/scanner/result-actions";
import { Scanner } from "@/components/scanner/scanner";

/** Share a scanned value: a web address as a link, anything else as text. */
function ShareResult({ value }: { value: string }) {
  const t = useTranslations("scannerApp");
  const isLink = /^https?:\/\//i.test(value);
  return (
    <Button
      aria-label={t("share")}
      onClick={() =>
        Share.share(isLink ? { url: value } : { text: value }).catch(
          () => undefined
        )
      }
      size="icon"
      type="button"
      variant="ghost"
    >
      <ShareIcon className="size-4" />
    </Button>
  );
}

const shareAction = ({ value }: { value: string }) => (
  <ShareResult value={value} />
);

export function App() {
  const t = useTranslations("scan.app");
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center gap-2.5 px-[max(1.25rem,env(safe-area-inset-left))]">
          <LogoMark aria-hidden className="size-5 text-foreground" />
          <h1 className="text-lg font-semibold">{t("name")}</h1>
        </div>
      </header>
      <main className="flex-1 px-[max(1.25rem,env(safe-area-inset-left))] pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <ResultActions.Provider value={shareAction}>
          <Scanner />
        </ResultActions.Provider>
      </main>
      <Toaster position="top-center" />
    </div>
  );
}
