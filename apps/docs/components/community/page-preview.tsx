import {
  PhoneFrame,
  TemplatePreview,
} from "@/components/landing/template-preview";
import type { LandingPageContent } from "@/types/landing";

/**
 * A page on a phone (the publish dialog, template and kit pages). A strip in
 * the page's own background sits under the phone's island, so the top of a
 * page without a cover photo stays readable.
 */
export function PagePreview({
  content,
  className,
}: {
  content: LandingPageContent;
  className?: string;
}) {
  return (
    <PhoneFrame className={className ?? "w-full"}>
      <div
        className="pt-6"
        style={{ backgroundColor: content.theme.colors.background }}
      >
        <TemplatePreview className="aspect-[9/16] w-full" content={content} />
      </div>
    </PhoneFrame>
  );
}
