export interface CalendlyUser {
  uri: string;
  name?: string;
  slug?: string;
  scheduling_url?: string;
  current_organization?: string;
}

export interface CalendlyEventType {
  uri: string;
  name: string | null;
  slug?: string;
  active: boolean;
  scheduling_url: string;
  duration?: number;
  secret?: boolean;
}

export interface CalendlyCollection<T> {
  collection: T[];
  pagination: {
    count: number;
    next_page?: string | null;
    next_page_token?: string | null;
  };
}
