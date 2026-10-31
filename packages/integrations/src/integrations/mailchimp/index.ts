export {
  createMailchimpClient,
  getMailchimpMetadata,
  MailchimpClient,
  type MemberStatus,
  subscriberHash,
} from "./client";
export { mailchimpIntegration } from "./config";
export {
  type MailchimpSettings,
  mailchimpMembers,
  mailchimpTargets,
  syncResponsesToMailchimp,
} from "./sink";
export type {
  MailchimpAudience,
  MailchimpMergeField,
  MailchimpMetadata,
} from "./types";
