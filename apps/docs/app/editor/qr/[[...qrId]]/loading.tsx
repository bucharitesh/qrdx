import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <QrdxLogoAnimation size={100} />
        <p className="text-muted-foreground text-sm">Loading QR Editor...</p>
      </div>
    </div>
  );
}

