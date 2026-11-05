import {
  PhoneFrame,
  TemplatePreview,
} from "@/components/landing/template-preview";
import type { LandingPageContent } from "@/types/landing";

/** A page on a phone, as the publish dialog's review step shows it. */
export function PagePreview({ content }: { content: LandingPageContent }) {
  return (
    <PhoneFrame className="w-full">
      <TemplatePreview className="aspect-[9/16] w-full" content={content} />
    </PhoneFrame>
  );
}
