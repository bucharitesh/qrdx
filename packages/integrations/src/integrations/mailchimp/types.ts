export interface MailchimpMetadata {
  dc: string;
  api_endpoint?: string;
  accountname?: string;
}

export interface MailchimpAudience {
  id: string;
  name: string;
  memberCount: number;
}

export interface MailchimpMergeField {
  tag: string;
  name: string;
  /** text, number, phone, address, date, birthday, url, … */
  type: string;
}
