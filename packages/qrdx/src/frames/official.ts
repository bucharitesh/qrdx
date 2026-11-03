// QRdx's official frames: 20 for common uses and 4 seasonal ones, each a
// frame spec with editable labels and theme colors (CC0 1.0). Every one is
// checked to decode at phone distances and to score Great
// (tests/frames-official.test.ts). Apply one with
// `frame: { style: "custom", spec: frame.spec }`.
import type { FrameSpec } from "../../types/frame-spec";
import attendance from "./official/attendance.json";
import audioGuide from "./official/audio-guide.json";
import bookNow from "./official/book-now.json";
import checkIn from "./official/check-in.json";
import christmas from "./official/christmas.json";
import donate from "./official/donate.json";
import eventTicket from "./official/event-ticket.json";
import feedbackBubble from "./official/feedback-bubble.json";
import followUs from "./official/follow-us.json";
import getTheApp from "./official/get-the-app.json";
import halloween from "./official/halloween.json";
import newYear from "./official/new-year.json";
import orderAtTable from "./official/order-at-table.json";
import productInfo from "./official/product-info.json";
import registerProduct from "./official/register-product.json";
import reviewUs from "./official/review-us.json";
import rsvpCard from "./official/rsvp-card.json";
import saveContact from "./official/save-contact.json";
import scanToPay from "./official/scan-to-pay.json";
import shopWindow from "./official/shop-window.json";
import signRider from "./official/sign-rider.json";
import tableTent from "./official/table-tent.json";
import wifiCard from "./official/wifi-card.json";
import winter from "./official/winter.json";

export interface OfficialFrame {
  /** Stable id (also the file name) */
  id: string;
  name: string;
  description: string;
  category: "use-case" | "seasonal";
  /** QRdx content types the frame suits (empty: any) */
  contentTypes: string[];
  tags: string[];
  license: "CC0-1.0";
  spec: FrameSpec;
}

/** The official frames, in catalogue order (use cases, then seasons). */
// A plain array literal (no call), so bundlers drop it when it's unused.
export const OFFICIAL_FRAMES = [
  wifiCard,
  tableTent,
  orderAtTable,
  reviewUs,
  scanToPay,
  eventTicket,
  rsvpCard,
  saveContact,
  followUs,
  getTheApp,
  feedbackBubble,
  productInfo,
  registerProduct,
  donate,
  checkIn,
  audioGuide,
  signRider,
  bookNow,
  shopWindow,
  attendance,
  winter,
  halloween,
  christmas,
  newYear,
] as unknown as readonly OfficialFrame[];

/** An official frame by id. */
export function getOfficialFrame(id: string): OfficialFrame | undefined {
  return OFFICIAL_FRAMES.find((frame) => frame.id === id);
}
