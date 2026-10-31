import type { SeoGroup } from "../types";

export const outdoor: SeoGroup = {
  id: "outdoor",
  title: "Outdoor and large format",
  description:
    "Billboards, vehicles and signs read from metres away, in all weather.",
  items: [
    {
      slug: "billboards",
      name: "Billboards",
      noun: "billboards",
      title: "QR codes on billboards and out-of-home ads",
      seoTitle: "QR Codes on Billboards: When They Work and How Big",
      metaDescription:
        "QR codes on billboards and out-of-home ads: when they work (walk-by and waiting sites), how big to print for the distance, and how to measure each site.",
      summary:
        "Which OOH sites suit QR codes, how big to go and per-site tracking.",
      intro: [
        "A QR code on a motorway billboard is a waste of ink: drivers can't and shouldn't scan. Codes on out-of-home ads work where people are on foot and standing still: bus shelters, station platforms, shopping centres, escalator panels and waiting areas.",
        "Out-of-home is also hard to measure, which is where dynamic codes earn their keep. One code per site, each counted separately, tells you which sites drove action.",
      ],
      useCases: [
        {
          title: "Platform and shelter ads",
          description:
            "People waiting for a train or bus have time and a phone in hand. A clear offer behind a code converts well here.",
        },
        {
          title: "App installs",
          description:
            "One code that opens the right app store for each phone.",
        },
        {
          title: "Launches and teasers",
          description:
            "A teaser poster that opens a countdown or waitlist, repointed to the product on launch day.",
        },
        {
          title: "Local businesses",
          description:
            "Shopping-centre and street-level panels that open directions and the current offer.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per site",
          why: "Measure every site separately, add UTM parameters on Pro, and repoint the code when the campaign changes.",
        },
        {
          kind: "page",
          page: "apps",
          why: "App campaigns with one code for App Store and Google Play.",
        },
        {
          kind: "page",
          page: "coupon",
          why: "A redeemable offer for nearby stores, counted per code.",
        },
      ],
      distances: [
        { label: "Bus shelter panel", meters: 2 },
        { label: "Platform poster across the tracks", meters: 6 },
        { label: "Large street-level billboard", meters: 15 },
      ],
      tips: [
        "Only add codes to sites where people stop or walk slowly; skip roadside sites aimed at drivers.",
        "Size for the real distance: from 6 m, about 70 cm; from 15 m, well over 1.5 m. If that's not possible, choose a closer site.",
        "Lower is better: put the code in the bottom third of the panel, where the people closest to it can see it.",
        "Test on site at different times of day; backlit panels and reflections behave differently at night.",
      ],
      ctas: [
        "Scan to get 20% off your first order",
        "Get the app: scan here",
        "Scan for directions",
        "Join the waitlist",
      ],
      faqs: [
        {
          question: "How big should a QR code be on a billboard?",
          answer:
            "Roughly a tenth of the scanning distance, a little more for a short link: about 70 cm from 6 m, and over 1.7 m from 15 m. Most billboards aren't scanned from further than that.",
        },
        {
          question: "Do QR codes on billboards work?",
          answer:
            "On walk-by and waiting sites, they can. On roadside billboards seen from a moving car, they don't, and you shouldn't encourage drivers to scan.",
        },
        {
          question: "How do I measure billboard QR code scans?",
          answer:
            "Use one dynamic code per site. QRdx counts scans per code with time and city, so you can compare sites and times of day.",
        },
      ],
      related: [
        "marketing-agencies",
        "transportation",
        "construction",
        "events",
      ],
    },
    {
      slug: "vehicles",
      name: "Vehicles",
      noun: "vehicles",
      title: "QR codes on vehicles and van wraps",
      seoTitle: "QR Codes on Vans, Trucks and Vehicle Wraps",
      metaDescription:
        "QR codes on vans, trucks and vehicle wraps: where to place them so people can scan safely, how big to print, durable vinyl and what to link to.",
      summary: "Rear and side placement, vinyl sizing and safe scanning.",
      intro: [
        "A van is a billboard that parks outside the customer's neighbour's house. A QR code on the side or the back doors, scanned while the van is parked, can open your booking page, reviews or a quote form.",
        "Codes on vehicles should be scanned from the pavement, never from another moving car. Size them for someone standing a few metres away, and choose a vinyl that survives car washes.",
      ],
      useCases: [
        {
          title: "Book a tradesperson",
          description:
            "Plumbers, electricians and cleaners can link the van to a booking or quote page.",
        },
        {
          title: "Reviews and trust",
          description:
            "A code that opens your reviews, which convinces neighbours watching the work.",
        },
        {
          title: "Food trucks and mobile businesses",
          description:
            "This week's locations and the menu, from the side of the truck.",
        },
        {
          title: "Fleet information",
          description:
            "A code on fleet vehicles that opens the 'how's my driving?' feedback form.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "business",
          why: "Services, area covered, phone and email, with a contact button.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Quote requests or driver feedback, one form per vehicle if you want to tell them apart.",
        },
        {
          kind: "dynamic",
          label: "Dynamic code per vehicle",
          why: "Compare which vans bring in enquiries, and repoint all of them when your website changes.",
        },
      ],
      distances: [
        { label: "Rear doors, from the pavement", meters: 2 },
        { label: "Side panel, across the street", meters: 5 },
      ],
      tips: [
        "Put codes on the rear doors and the kerb side, where people on foot can scan safely.",
        "From 2 m the code needs to be about 23 cm; from across the street, about 60 cm.",
        "Keep the code on a flat panel, away from door handles, seams and wheel arches.",
        "Use cast vinyl with a laminate so the code stays black through car washes and sunlight.",
      ],
      ctas: [
        "Need a plumber? Scan to book",
        "See what our customers say",
        "Scan for a free quote",
        "How's my driving?",
      ],
      faqs: [
        {
          question: "Where should a QR code go on a van?",
          answer:
            "On the rear doors and the kerb-side panel, at about chest height. Those are the places people stand near a parked van.",
        },
        {
          question: "Is it safe to put QR codes on vehicles?",
          answer:
            "Yes, if they are meant to be scanned from the pavement while parked. Don't encourage scanning from other vehicles; the call to action can say 'when parked'.",
        },
        {
          question: "How big should a QR code be on a van?",
          answer:
            "About 23 cm for people standing 2 m away, up to about 60 cm for people across the street. Bigger is better as long as it stays on a flat surface.",
        },
      ],
      related: ["food-trucks", "automotive", "logistics", "transportation"],
    },
    {
      slug: "signs",
      name: "Signs",
      noun: "signs",
      title: "QR codes on signs",
      seoTitle: "QR Codes on Signs: Outdoor and Indoor Signage",
      metaDescription:
        "QR codes on indoor and outdoor signs: wayfinding, information boards, opening hours and safety notices, with mounting heights, sizes and durable materials.",
      summary: "Wayfinding, information boards and safety notices that last.",
      intro: [
        "Signs are permanent and information isn't. A QR code on a sign can carry the part that changes (hours, routes, detailed instructions, translations) while the sign itself stays put for years.",
        "Signage is also where tampering happens. For signs in public places, use a custom domain and inspect the codes regularly, so nobody can cover them with a look-alike sticker.",
      ],
      useCases: [
        {
          title: "Wayfinding",
          description:
            "Directional signs that open a map with the route to each destination.",
        },
        {
          title: "Information boards",
          description:
            "Parks, heritage sites and campuses that link to detail, audio and translations.",
        },
        {
          title: "Opening hours and notices",
          description:
            "Door signs that open current hours, holiday closures and contact options.",
        },
        {
          title: "Safety and instructions",
          description:
            "Safety signs that open the full procedure or an emergency contact page.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "business",
          why: "Current hours, closures, contact buttons and the address for door signs.",
        },
        {
          kind: "static",
          type: "maps",
          why: "Opens the destination in Google Maps from a wayfinding sign.",
        },
        {
          kind: "page",
          page: "mp3",
          why: "Audio guides for information boards, playable in the browser.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Full procedures behind safety signs, replaced when they're revised.",
        },
      ],
      distances: [
        { label: "Door sign", meters: 0.8 },
        { label: "Information board", meters: 1.5 },
        { label: "Directional sign", meters: 3 },
      ],
      tips: [
        "Mount codes between 1.2 and 1.5 m, so they're reachable for wheelchair users and children.",
        "Outdoors, use UV-resistant inks, aluminium composite or engraved panels, and an anti-graffiti laminate.",
        "Inspect public signs for stickers placed over the real code; a printed custom domain helps people spot fakes.",
        "Use error correction H on signs likely to get scratched or dirty.",
      ],
      ctas: [
        "Scan for the route",
        "Opening hours and holiday closures",
        "Listen to the guide",
        "Full safety procedure",
      ],
      faqs: [
        {
          question: "What height should a QR code on a sign be?",
          answer:
            "Around 1.2 to 1.5 m to the centre of the code. That works for most adults, children and wheelchair users without bending or stretching.",
        },
        {
          question: "How long does an outdoor QR code sign last?",
          answer:
            "With UV-stable inks and a protective laminate, years. The code itself never expires; dynamic QRdx codes keep redirecting on every plan.",
        },
        {
          question: "How do I stop people tampering with QR codes on signs?",
          answer:
            "Use tamper-evident materials, print your short-link domain next to the code, use a custom domain so the link preview is recognisable, and check signs regularly.",
        },
      ],
      related: ["tourism", "government", "construction", "museums"],
    },
  ],
};
