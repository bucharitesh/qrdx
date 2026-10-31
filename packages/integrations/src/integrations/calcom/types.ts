export interface CalcomResponse<T> {
  status: "success" | "error";
  data: T;
}

export interface CalcomMe {
  id: number;
  username: string | null;
  name?: string | null;
  organizationId?: number | null;
}

export interface CalcomEventType {
  id: number;
  title: string;
  slug: string;
  lengthInMinutes?: number;
  /** Present on newer API versions */
  bookingUrl?: string;
  hidden?: boolean;
}
