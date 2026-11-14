import {
  SeasonalLayer,
  SeasonCharacters,
} from "@/components/seasonal/seasonal-layer";
import { CTASection } from "@/components/sections/cta-section";
import { FooterSection } from "@/components/sections/footer-section";
import { Navbar } from "@/components/sections/navbar";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { organizationSchema } from "@/lib/seo-schema";

// The marketing shell for translated pages; app/(app)/(home)/layout.tsx is
// the same shell for the pages that are English only so far.
export default function Layout({ children }: LayoutProps<"/[lang]">) {
  return (
    <div className="max-w-7xl w-full mx-auto border-x relative">
      <JsonLd data={organizationSchema} />
      <div className="block w-px h-full border-l border-border absolute top-0 left-6 z-10"></div>
      <div className="block w-px h-full border-r border-border absolute top-0 right-6 z-10"></div>
      <SeasonalLayer />
      <Navbar />
      {children}
      <CTASection />
      <FooterSection />
      {/* Last: the characters are buttons, after the page in tab order. */}
      <SeasonCharacters />
    </div>
  );
}
