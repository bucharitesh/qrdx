import type { SeoGroup } from "../types";

export const professional: SeoGroup = {
  id: "professional",
  title: "Professional services",
  description: "Listings, client campaigns, contact cards and trusted links.",
  items: [
    {
      slug: "real-estate",
      name: "Real estate",
      noun: "real estate",
      title: "QR codes for real estate",
      seoTitle: "Real Estate QR Codes for Signs, Flyers and Listings",
      metaDescription:
        "Real estate QR codes on for-sale signs, flyers and window cards: listings, virtual tours, viewings and agent contact cards, with sign sizes and copy ideas.",
      summary:
        "For-sale signs that open the listing, tours, viewings and agent cards.",
      intro: [
        "A for-sale sign is read by people driving or walking past, often in the evening when the agency is closed. A QR code on the sign rider that opens the listing, the photos and a viewing request captures that interest before the passer-by forgets the street name.",
        "The same sign frame goes on a different house next month. With a dynamic code, the agent repoints the sign to the new listing instead of ordering new riders, and sees how many people scanned each property.",
      ],
      useCases: [
        {
          title: "Sign riders that open the listing",
          description:
            "Photos, price, floor plan and a viewing button for the property the sign is standing in front of.",
        },
        {
          title: "Virtual tours and video",
          description:
            "Window cards and flyers that open a walkthrough video or 3D tour, so buyers shortlist before booking.",
        },
        {
          title: "Agent contact cards",
          description:
            "A vCard Plus code on business cards and brochures that saves the agent's details with a photo.",
        },
        {
          title: "Open houses",
          description:
            "An event page with the time and directions, and a sign-in form at the door instead of a clipboard.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link on every sign rider",
          why: "Repoint the same rider to each new listing and compare scans per property. Pro adds custom domains so the link shows your agency's name.",
        },
        {
          kind: "page",
          page: "vcard",
          why: "Photo, phone, email, office address and a Save contact button for every agent.",
        },
        {
          kind: "page",
          page: "images",
          why: "A photo gallery of the property for window cards when the listing portal page is slow or cluttered with ads.",
        },
        {
          kind: "page",
          page: "event",
          why: "Open-house times, map and calendar buttons, linked from flyers and the sign.",
        },
      ],
      distances: [
        { label: "Flyer or window card", meters: 0.4 },
        { label: "Agency window, from the pavement", meters: 1.5 },
        { label: "Sign rider, from the pavement", meters: 4 },
      ],
      tips: [
        "Codes on yard signs must be large: from the pavement, about 4 m, a short-link code needs to be close to 50 cm wide. Put the code on a dedicated rider rather than squeezing it onto the main board.",
        "Face the code towards foot traffic, and keep it below head height so people can walk up to it.",
        "Reflective sign materials glare under streetlights; use matte vinyl for the code panel.",
        "Write a short call to action on the rider. 'Scan for photos and price' outperforms a bare code.",
      ],
      ctas: [
        "Scan for photos, price and floor plan",
        "Take the video tour",
        "Book a viewing tonight",
        "Save my contact",
      ],
      faqs: [
        {
          question: "How big should a QR code be on a for-sale sign?",
          answer:
            "It depends on where people stand. From the pavement, about 4 m, a short-link code needs to be roughly 46 cm wide. If people can walk right up to the sign, about 23 cm works from 2 m.",
        },
        {
          question: "Can I reuse the same sign for a different property?",
          answer:
            "Yes, with a dynamic code. Change the destination to the new listing in the dashboard and move the sign; scans for each property are counted separately over time.",
        },
        {
          question: "What happens to the codes if the agency stops paying?",
          answer:
            "They keep working. QRdx dynamic codes keep redirecting after a downgrade or cancellation; you just can't create more than your plan allows.",
        },
      ],
      related: ["signs", "flyers", "business-cards", "window-decals"],
    },
    {
      slug: "marketing-agencies",
      name: "Marketing agencies",
      noun: "marketing agencies",
      title: "QR codes for marketing agencies",
      seoTitle: "QR Codes for Marketing Agencies and Campaigns",
      metaDescription:
        "QR codes for marketing agencies: trackable campaign codes per channel, client custom domains, UTM tagging, A/B tests, reporting exports and team access.",
      summary:
        "Per-channel campaign codes, client domains, UTMs and scan reports.",
      intro: [
        "Agencies print codes for clients on packaging, posters, direct mail and OOH, and then get asked the question every client asks: did it work? That needs one dynamic code per channel, clean UTM parameters and a scan report the client can read.",
        "It also needs codes that keep working after the campaign and after the client relationship. Codes that switch off when a plan lapses, which is common in this market, leave a client's printed materials pointing nowhere. QRdx codes keep redirecting on every plan.",
      ],
      useCases: [
        {
          title: "One code per channel",
          description:
            "Separate dynamic codes for the poster, the mailer and the pack, all pointing at the same landing page, so scans show which channel drives traffic.",
        },
        {
          title: "UTM tagging without long codes",
          description:
            "Append UTM parameters at redirect time so analytics tools see the source, while the printed code stays short and easy to scan.",
        },
        {
          title: "Branded short links",
          description:
            "Short links on the client's own domain look trustworthy in the phone's link preview and keep brand consistency.",
        },
        {
          title: "Campaign landing pages",
          description:
            "Hosted pages for coupons, events or app downloads, built in minutes when the client's web team can't ship in time.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic codes with UTM and routing",
          why: "On Pro: UTM parameters appended at redirect, device, country and time rules, and A/B splits across two landing pages.",
        },
        {
          kind: "page",
          page: "coupon",
          why: "Campaign offers with a code or barcode, validity dates and terms, with redemptions counted.",
        },
        {
          kind: "page",
          page: "apps",
          why: "One code for app campaigns that shows the right store button on iPhone and Android.",
        },
        {
          kind: "page",
          page: "links",
          why: "A quick campaign hub when the client's site isn't ready for launch day.",
        },
      ],
      distances: [
        { label: "Pack or mailer in the hand", meters: 0.3 },
        { label: "In-store poster", meters: 2 },
        { label: "Billboard or OOH site", meters: 10 },
      ],
      tips: [
        "Agree the scan distance with the client before design; it decides the code size more than anything else.",
        "Brand colours often fail contrast. Run every design through the scan checker and test on several phones before sign-off.",
        "Name codes by client, campaign and channel so reports make sense months later.",
        "Use teams so the client's marketing staff can see their own codes without sharing a login.",
      ],
      ctas: [
        "Scan to claim 20% off",
        "Scan to see it in action",
        "Get the app",
        "Scan to enter the giveaway",
      ],
      faqs: [
        {
          question: "How do agencies track QR code campaigns?",
          answer:
            "Give each placement its own dynamic code, append UTM parameters so web analytics see the source, and export scans as CSV for the report. QRdx records time, country, city, device, OS and browser per scan, and never stores raw IP addresses.",
        },
        {
          question: "Can each client have their own domain for short links?",
          answer:
            "Yes. Pro and Business include several custom domains, so each client's codes can use the client's own domain instead of qrdx.dev. See the pricing page for the current number per plan.",
        },
        {
          question: "What happens to client codes after the contract ends?",
          answer:
            "They keep working on every plan. Codes are never deactivated by a downgrade or cancellation, and you can export the codes and scan data to hand over to the client.",
        },
      ],
      related: [
        "billboards",
        "posters",
        "direct-mail",
        "magazines",
        "tv-and-video",
      ],
    },
    {
      slug: "law-firms",
      name: "Law firms",
      noun: "law firms",
      title: "QR codes for law firms and legal services",
      seoTitle: "QR Codes for Law Firms and Legal Services",
      metaDescription:
        "QR codes for law firms: lawyer contact cards, consultation booking, client intake links, seminar registration and reviews, with privacy guidance.",
      summary:
        "Lawyer contact cards, consultation booking and seminar sign-ups.",
      intro: [
        "Law firms mostly use QR codes in the same places as other professional firms: business cards, brochures, seminar slides and the office window. The difference is trust. Clients need to be sure a code really comes from the firm, so links on the firm's own domain and plain wording matter.",
        "Confidential information should never go through a public QR link. Codes are for getting a client to the right place, such as the booking page, the secure portal or a lawyer's contact card, not for collecting case details.",
      ],
      useCases: [
        {
          title: "Lawyer contact cards",
          description:
            "A vCard Plus code on each business card that saves name, title, direct line and email with a photo.",
        },
        {
          title: "Book a consultation",
          description:
            "A code on brochures and the window that opens the booking page or the intake form on your secure system.",
        },
        {
          title: "Seminars and webinars",
          description:
            "Registration pages for client seminars, and a slide code that opens the materials afterwards.",
        },
        {
          title: "Guides and briefings",
          description:
            "Short PDF guides, such as what to expect from a divorce or probate process, behind codes in printed brochures.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "vcard",
          why: "Contact page per lawyer with a Save contact button. Repoint it if the lawyer leaves.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link to your secure intake or booking page",
          why: "Sends clients to your own system. On a custom domain, the link shows the firm's name.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Client guides and seminar materials, replaced when the law changes.",
        },
        {
          kind: "page",
          page: "event",
          why: "Seminar registration details with date, venue and calendar buttons.",
        },
      ],
      distances: [
        { label: "Business card", meters: 0.25 },
        { label: "Brochure on a reception table", meters: 0.5 },
        { label: "Seminar slide", meters: 8 },
      ],
      tips: [
        "Keep codes discreet but readable: on a business card, about 2.9 cm with a short link is enough at 25 cm.",
        "Use the firm's custom domain for every code so the link preview reinforces trust.",
        "Don't link to forms that collect case details unless they run on your secure systems.",
        "On printed guides, include the date of the information and point the code at the current version.",
      ],
      ctas: [
        "Save my contact details",
        "Book a free 20-minute consultation",
        "Download our probate guide",
        "Register for the seminar",
      ],
      faqs: [
        {
          question: "Is it appropriate for a law firm to use QR codes?",
          answer:
            "Yes, for public information and contact details. Check your professional conduct rules for marketing, keep confidential information off public links, and make clear where each code leads.",
        },
        {
          question: "Can clients send documents through a QR code?",
          answer:
            "Only point codes at your secure client portal for that. QRdx forms are for general enquiries and should not be used for confidential case documents.",
        },
        {
          question: "What happens to a lawyer's card if they leave the firm?",
          answer:
            "If the card has a dynamic code, repoint it to the firm's main contact page so printed cards still reach someone.",
        },
      ],
      related: ["business-cards", "brochures", "presentations", "envelopes"],
    },
    {
      slug: "banks",
      name: "Banks and financial services",
      noun: "banks and financial services",
      title: "QR codes for banks and financial services",
      seoTitle: "QR Codes for Banks and Financial Services",
      metaDescription:
        "QR codes for banks, insurers and advisers: app downloads, product pages, branch information and secure links, plus how to protect customers from QR fraud.",
      summary:
        "App downloads, product pages and branch info, with fraud-safe links.",
      intro: [
        "Banks and insurers use QR codes to move customers from paper to their app: on statements, branch posters and cards. Because financial QR codes are a favourite target for fraud, the code also has to make it obvious that it is genuine.",
        "That means links on the institution's own domain, plain instructions that the code never asks for a password, and codes that open public pages, with the customer signing in only inside the official app.",
      ],
      useCases: [
        {
          title: "Get the app",
          description:
            "A code on statements and branch posters that sends iPhone users to the App Store and Android users to Google Play.",
        },
        {
          title: "Product information",
          description:
            "Key facts documents, rates and terms behind codes on brochures, updated when rates change.",
        },
        {
          title: "Branch details",
          description:
            "Opening hours, services and accessibility information for each branch.",
        },
        {
          title: "Advisers' contact cards",
          description:
            "A vCard Plus page for each adviser or relationship manager.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "apps",
          why: "One code on statements and posters that shows the right store for the customer's phone.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link on your own domain",
          why: "Custom domains (Pro and Business) put your institution's domain in every short link, so customers can verify it.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Key facts and terms documents replaced when products change.",
        },
        {
          kind: "page",
          page: "business",
          why: "Branch hours, address, services and contact buttons.",
        },
      ],
      distances: [
        { label: "Statement or letter", meters: 0.35 },
        { label: "Branch counter", meters: 1 },
        { label: "Branch window poster", meters: 2 },
      ],
      tips: [
        "Print the domain the code opens next to it, and a line such as 'We will never ask for your PIN or password through a QR code.'",
        "Never put a code on a page that asks customers to sign in outside your official app or website.",
        "Inspect posters in branches and ATMs for stickers placed over genuine codes.",
        "Use separate codes per mailing to measure which statement inserts drive app downloads.",
      ],
      ctas: [
        "Scan to get our app",
        "Today's savings rates",
        "Book an appointment with an adviser",
        "Branch hours and services",
      ],
      faqs: [
        {
          question: "Should banks use QR codes, given QR fraud?",
          answer:
            "Yes, carefully. Use your own domain, link only to public pages or the app store, tell customers what genuine codes look like, and never ask for credentials behind a code. These steps make your codes easy to verify and fakes easier to spot.",
        },
        {
          question: "How do customers know a bank's QR code is genuine?",
          answer:
            "The link preview shows the domain before the page opens. If every code uses your official domain and you publish that domain, customers can check it.",
        },
        {
          question: "Can a QR code open our app directly?",
          answer:
            "An app download page shows the App Store or Google Play button based on the phone. Deep links into an installed app depend on your app's own link setup.",
        },
      ],
      related: ["direct-mail", "envelopes", "invoices", "emails"],
    },
  ],
};
