import { Header } from "@/components/header";
import { SeasonalPlayground } from "@/components/seasonal/playground-layer";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { organizationSchema } from "@/lib/seo-schema";
import { Providers } from "./providers";

export default function QREditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <JsonLd data={organizationSchema} />
      <div className="relative isolate flex h-svh flex-col overflow-hidden">
        <Header />
        <SeasonalPlayground />
        <main className="isolate flex flex-1 flex-col overflow-hidden">
          <h1 className="sr-only">Custom QR code designer</h1>
          {children}
        </main>
      </div>
    </Providers>
  );
}
