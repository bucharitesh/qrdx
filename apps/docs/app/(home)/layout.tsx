import { CTASection } from "@/components/sections/cta-section";
import { FooterSection } from "@/components/sections/footer-section";
import { Navbar } from "@/components/sections/navbar";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <div className="max-w-7xl w-full mx-auto border-x relative">
      <div className="block w-px h-full border-l border-border absolute top-0 left-6 z-10"></div>
      <div className="block w-px h-full border-r border-border absolute top-0 right-6 z-10"></div>
      <Navbar />
      {children}
      <CTASection />
      <FooterSection />
    </div>
  );
}
