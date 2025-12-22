import { Icons } from "@/components/icons";
import { QrdxLogo } from "@/components/qrdx-logo";

export function LoadingLogo() {
  return (
    <>
      <div className="bg-primary/90 absolute inset-0 -z-1 m-auto size-[65%] animate-ping rounded-full" />
      <div className="bg-primary/30 absolute inset-0 -z-1 m-auto size-[85%] animate-ping rounded-full delay-100" />
      <div className="bg-background relative isolate mx-auto size-full rounded-full">
        <div className="absolute top-0 left-0 size-[30%]">
          <Icons.Sparkle className="size-full animate-pulse fill-current" />
        </div>
        <QrdxLogo className="size-full animate-pulse p-0.5 delay-150" />
        <div className="absolute right-0 bottom-0 size-[20%]">
          <Icons.Sparkle className="size-full animate-pulse fill-current delay-300" />
        </div>
      </div>
    </>
  );
}
