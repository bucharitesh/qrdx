import { formatBytes } from "@/lib/files/types";
import { PLAN_LIMITS } from "@/lib/plans";
import type { PageTypeId } from "@/lib/seo-content/page-types";
import type { ContentType } from "@/types/qr-content";
import type { QrTypeFaq } from "./qr-types-content";

/**
 * Copy for the /qr-code-generator/<slug> pages whose code opens a hosted
 * page instead of holding the content: the PDF and the digital business
 * card (vCard Plus). They need a free account, so the page's button opens
 * the dashboard's New page dialog with that page type picked
 * (app/(app)/dashboard/[workspace]/pages/page.tsx reads `?new=`).
 *
 * Every claim must match the page builder and docs: content/docs/
 * landing-pages.mdx, files.mdx and nfc.mdx. Limits come from lib/plans.ts.
 */

export type HostedTypeSlug = "pdf" | "business-card";

export interface HostedQrTypeContent {
  slug: HostedTypeSlug;
  /** The hosted page type the button starts (lib/landing/page-type-ids.ts) */
  page: PageTypeId;
  /** The template the demo link opens (/templates/<page>/<demo>) */
  demo: string;
  /** Display name in cards and breadcrumbs: "PDF" */
  name: string;
  /** H1 and <title> (before the "| QRdx" suffix) */
  title: string;
  /** One line for cards */
  summary: string;
  /** The button that starts the page */
  cta: string;
  /** At most 155 characters */
  metaDescription: string;
  intro: [string, string];
  steps: string[];
  /** What the page shows the people who scan it */
  features: { title: string; description: string }[];
  /** Changing it after the code is printed */
  editing: string[];
  /** The static code that does part of the job without an account */
  compare: {
    title: string;
    staticType: ContentType;
    staticLabel: string;
    staticPoints: string[];
    hostedLabel: string;
    hostedPoints: string[];
  };
  faqs: QrTypeFaq[];
  /** Static generators to link to */
  related: ContentType[];
}

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;
const business = PLAN_LIMITS.business;

const FREE_PLAN = `Yes, with a free QRdx account. The Free plan includes ${free.landingPages} hosted pages, and each uses one of its ${free.dynamicCodes} dynamic codes. Free pages show a small "Made with QRdx" footer; Pro removes it and the page limit.`;

const GUARANTEE =
  "It keeps working. Under the Never-Hostage Guarantee, codes and pages you already have keep working after a downgrade, a failed payment or a cancellation, and scans are never paused. Plan limits only stop you from creating new ones.";

export const HOSTED_QR_TYPES: readonly HostedQrTypeContent[] = [
  {
    slug: "pdf",
    page: "pdf",
    demo: "document",
    name: "PDF",
    title: "Free PDF QR Code Generator",
    summary: "Upload a PDF to a hosted page and replace it any time.",
    cta: "Upload your PDF",
    metaDescription: `Turn a PDF into a QR code: upload it to a free QRdx page that people read or download on their phone. Replace the file later, same code. ${formatBytes(free.maxFileBytes)} on Free.`,
    intro: [
      "A PDF QR code opens your document on the phone that scans it: a menu, a brochure, a manual or a price list. You upload the PDF to a page QRdx hosts for you, and the code points to that page through a short link.",
      "Because the code holds the link, not the file, you can replace the PDF after printing, for next season's menu or a corrected manual, and every printed code opens the new version. It needs a free QRdx account.",
    ],
    steps: [
      "Sign in or create a free account, then start a PDF page: the button above opens it with the PDF type picked.",
      "Upload your PDF, or paste a link to one that's already online, and choose whether people can download it.",
      "Add a title and any buttons you want, such as a link to your website, then publish.",
      "Download the page's QR code, print it and scan it once to check.",
    ],
    features: [
      {
        title: "Reads in the browser",
        description:
          "On tablets and computers the PDF shows on the page; on phones, Open PDF shows it full screen. Nobody installs an app.",
      },
      {
        title: "Download and more files",
        description:
          "A Download button saves a copy, and a Downloads block lists more files with their own labels, such as the menu in a second language.",
      },
      {
        title: "Your page around it",
        description:
          "A title, your colors and logo, and buttons to your website or booking page, from the same blocks as every QRdx page.",
      },
      {
        title: "Fast and private",
        description:
          "Server-rendered for phones, with no QRdx analytics or chat scripts, and hidden from search engines unless you turn that on.",
      },
    ],
    editing: [
      "Replace the file behind the same link: in Dashboard → Files, choose Replace file next to the PDF and upload the new one. Pages and codes that use it show the new version within a minute. A PDF can only be replaced by a PDF.",
      "Change the page itself (its title, buttons and colors) and publish; the printed code stays the same. Every scan is counted without cookies, so you can see when the code is used.",
    ],
    compare: {
      title: "A PDF page, or a code that links to a PDF?",
      staticType: "google-drive",
      staticLabel: "Static code to a PDF link",
      staticPoints: [
        "No account: put the link of a PDF that's already online, in Google Drive or on your website, into a free static code.",
        "The link is written into the code, so printed codes stop working if the file is moved or its sharing is turned off.",
        "No scan counts, and nothing around the PDF.",
      ],
      hostedLabel: "Hosted PDF page",
      hostedPoints: [
        "A free QRdx account, and QRdx stores the file.",
        "Replace the PDF or edit the page any time; printed codes keep working.",
        "Scans counted without cookies, with your title, colors and buttons around the document.",
      ],
    },
    faqs: [
      { question: "Is the PDF QR code free?", answer: FREE_PLAN },
      {
        question: "How big can the PDF be?",
        answer: `Up to ${formatBytes(free.maxFileBytes)} per file on Free, with ${formatBytes(free.storageBytes)} of storage per workspace. Pro takes files up to ${formatBytes(pro.maxFileBytes)} and Business up to ${formatBytes(business.maxFileBytes)}. Big PDFs open slowly on phones, so compress scans and large images before uploading.`,
      },
      {
        question: "Can I change the PDF after printing?",
        answer:
          "Yes. Replace the file in Dashboard → Files and every code and page that uses it shows the new PDF within a minute. The printed code never changes.",
      },
      {
        question: "What happens to my code if I stop paying?",
        answer: GUARANTEE,
      },
      {
        question: "Do people need an app to open it?",
        answer:
          "No. The phone's camera opens the page in the browser, where the PDF can be read, opened full screen or downloaded.",
      },
      {
        question: "Can search engines find my PDF?",
        answer:
          "Not unless you want them to. Hosted pages are hidden from search engines until you turn on Show in search engines in the page's settings.",
      },
      {
        question: "Can I make a PDF QR code without an account?",
        answer:
          "Only for a PDF that's already online: paste its link into the URL or Google Drive generator for a free static code. QRdx only stores the file for you with an account.",
      },
    ],
    related: ["google-drive", "url", "text"],
  },
  {
    slug: "business-card",
    page: "vcard",
    demo: "classic",
    name: "Digital Business Card",
    title: "Digital Business Card QR Code Generator",
    summary: "A contact page with your photo, buttons and Save contact.",
    cta: "Create your card",
    metaDescription: `Make a digital business card with a QR code: your photo, contact buttons and Save contact. Edit it without reprinting. Free account, ${free.landingPages} pages included.`,
    intro: [
      "A digital business card QR code opens a contact page that QRdx hosts for you: your photo, name and job title, buttons to call, email, message or get directions, your links, and a Save contact button that adds you to the phone's contacts.",
      "The code holds a short link, so you can change your number, title or photo after the cards are printed and every card shows the new details. It needs a free QRdx account. For a code that holds the contact itself, with no account, use the vCard QR code generator.",
    ],
    steps: [
      "Sign in or create a free account, then start a vCard Plus page: the button above opens it with that type picked.",
      "Pick a template (Classic, Midnight, Minimal or Real estate agent) and fill in your details, photo and links.",
      "Publish the page, then download its QR code for your business card, email signature or badge.",
      "Scan it once and tap Save contact to check what lands in your contacts.",
    ],
    features: [
      {
        title: "Save contact",
        description:
          "Downloads a vCard 3.0 file that phones open in their contacts app, with your name, company, job title, phones, emails, website, address, bio, social profiles and photo.",
      },
      {
        title: "Quick actions",
        description:
          "Call, WhatsApp, email and directions buttons, so people can reach you before they save anything.",
      },
      {
        title: "Share",
        description:
          "Opens the phone's share sheet, so the person you met can pass your card on.",
      },
      {
        title: "Scan counts",
        description:
          "The code counts scans without cookies, so you can see how many people opened your card and when.",
      },
    ],
    editing: [
      "Change anything on the page and publish: a new number, a new job title, a new photo. Every printed card opens the new version, and each publish is kept as a version.",
      "The same page can go on an NFC card: its code has Put this card on NFC, which writes the page's link to a blank NFC card from Chrome on Android, and taps are counted apart from scans.",
    ],
    compare: {
      title: "vCard QR code or digital business card?",
      staticType: "vcard",
      staticLabel: "vCard QR code (static)",
      staticPoints: [
        "No account, free for good: the contact details are written into the code itself.",
        "Works offline: the phone offers to save the contact without opening a page.",
        "Can't change after printing, has no photo, and every extra field makes the code denser.",
      ],
      hostedLabel: "Digital business card (hosted page)",
      hostedPoints: [
        "A free QRdx account; the code opens a page QRdx hosts.",
        "Edit your details, photo and links any time; printed cards keep working.",
        "Photo, buttons, links and Save contact, plus scan counts.",
      ],
    },
    faqs: [
      { question: "Is the digital business card free?", answer: FREE_PLAN },
      {
        question: "What does Save contact add to the phone?",
        answer:
          "A vCard 3.0 contact with your name, company, job title, phones, emails, website, address, bio, the page's social profiles and your photo. Photos uploaded to QRdx are embedded in the file; photos linked from other sites are included as a link.",
      },
      {
        question: "Can I change my details after printing?",
        answer:
          "Yes. Edit the page and publish; the printed code keeps opening it, now with your new details.",
      },
      {
        question: "What happens to my card if I stop paying?",
        answer: GUARANTEE,
      },
      {
        question: "Should I use a vCard QR code instead?",
        answer:
          "If your details won't change and you don't need a photo or links, yes: a static vCard code needs no account and works offline. If you want to edit the card later or see scans, use the hosted card.",
      },
      {
        question: "Do people need an app?",
        answer:
          "No. The phone's camera opens the card in the browser, and Save contact hands the file to the built-in contacts app.",
      },
      {
        question: "Can I put it on an NFC business card?",
        answer:
          "Yes. QRdx doesn't sell cards: buy blank NFC cards and write the page's link to them from the code's NFC page in Chrome on Android. Editing the page updates every card you've handed out.",
      },
    ],
    related: ["vcard", "linkedin", "email"],
  },
];

export const HOSTED_TYPE_SLUGS: readonly HostedTypeSlug[] = HOSTED_QR_TYPES.map(
  (type) => type.slug,
);

const bySlug = new Map<string, HostedQrTypeContent>(
  HOSTED_QR_TYPES.map((type) => [type.slug, type]),
);

export function getHostedQrType(slug: string): HostedQrTypeContent | undefined {
  return bySlug.get(slug);
}

export const hostedTypePath = (slug: HostedTypeSlug) =>
  `/qr-code-generator/${slug}`;
