import { Header } from "@/components/header";
import { HalloweenPlayground } from "@/components/seasonal/playground-layer";
import { Providers } from "./providers";

export default function QREditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="relative isolate flex h-svh flex-col overflow-hidden">
        <Header />
        <HalloweenPlayground />
        <main className="isolate flex flex-1 flex-col overflow-hidden">
          <h1 className="sr-only">QR code generator playground</h1>
          {children}
        </main>
      </div>
    </Providers>
  );
}
