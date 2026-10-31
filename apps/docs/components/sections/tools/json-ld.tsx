import { baseUrl } from "@/lib/metadata";

type JsonLdData = Record<string, unknown>;

/** Escapes "<" so string values can never close the script tag. */
function serialize(data: JsonLdData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  );
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbSchema(crumbs: Crumb[]): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: new URL(crumb.path, baseUrl).toString(),
    })),
  };
}

export function faqSchema(
  faqs: { question: string; answer: string }[],
): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
