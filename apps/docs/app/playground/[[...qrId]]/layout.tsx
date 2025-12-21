import { Header } from "@/components/header";
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
        <main className="isolate flex flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </Providers>
  );
}
