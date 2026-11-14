import type { SeoTopic } from "./types";

// Industry and placement pages sell custom domains in a few tips, FAQs and
// recommendations. Where custom domains can't be added
// (packages/availability/rules.ts), those mentions are left out: a
// sentence that mentions them is dropped, and so is an item whose title,
// label or question does or that has nothing left. They come back on their
// own once the feature is configured.

const MENTIONS =
  /\bcustom domains?\b|\bown domain\b|\bon your domain\b|\bdomain you own\b/i;

const mentions = (text: string) => MENTIONS.test(text);

/** The text without its sentences that mention custom domains. */
function strip(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !mentions(sentence))
    .join(" ");
}

export interface TopicAvailability {
  customDomains: boolean;
}

export function topicForDeployment(
  topic: SeoTopic,
  { customDomains }: TopicAvailability,
): SeoTopic {
  if (customDomains) return topic;
  return {
    ...topic,
    useCases: topic.useCases.flatMap((useCase) => {
      const description = strip(useCase.description);
      return mentions(useCase.title) || !description
        ? []
        : [{ ...useCase, description }];
    }),
    recommended: topic.recommended.flatMap((item) => {
      const why = strip(item.why);
      if (!why || ("label" in item && mentions(item.label))) return [];
      return [{ ...item, why }];
    }),
    tips: topic.tips.map(strip).filter(Boolean),
    faqs: topic.faqs.flatMap((faq) => {
      const answer = strip(faq.answer);
      return mentions(faq.question) || !answer ? [] : [{ ...faq, answer }];
    }),
  };
}
