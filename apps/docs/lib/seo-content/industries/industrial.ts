import type { SeoGroup } from "../types";

export const industrial: SeoGroup = {
  id: "industrial",
  title: "Industry, logistics and transport",
  description:
    "Manuals on the machine, safety documents on site, traceability and timetables.",
  items: [
    {
      slug: "manufacturing",
      name: "Manufacturing",
      noun: "manufacturing",
      title: "QR codes for manufacturing and product packaging",
      seoTitle: "QR Codes for Manufacturers: Manuals and Packaging",
      metaDescription:
        "QR codes in manufacturing: manuals and spare parts on the product, setup videos, warranty registration, machine maintenance logs and packaging links.",
      summary:
        "Manuals and spare parts on the product, setup videos and warranty sign-up.",
      intro: [
        "Manufacturers print a code once and ship it on thousands of units that stay in service for years. That code has to survive a website redesign, a change of support platform and a product revision, which is exactly what a dynamic code is for.",
        "The codes that pay for themselves are the ones that cut support calls: the manual and spare-parts list on the product's rating plate, the setup video on the box, and warranty registration on the packaging insert.",
      ],
      useCases: [
        {
          title: "Manual on the machine",
          description:
            "A code on the rating plate or housing that opens the manual for that model, in the reader's language, for the life of the product.",
        },
        {
          title: "Setup video on the box",
          description:
            "A short assembly or setup video reduces returns from customers who gave up on the paper instructions.",
        },
        {
          title: "Warranty registration",
          description:
            "A code on the insert that opens the registration form, so you get the customer's details on day one.",
        },
        {
          title: "Maintenance on the factory floor",
          description:
            "Codes on your own equipment that open the maintenance procedure and the fault-report form for that machine.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "pdf",
          why: "Manuals and spec sheets you can replace with each revision, while units in the field keep the same code.",
        },
        {
          kind: "page",
          page: "video",
          why: "Setup and maintenance videos from YouTube or Vimeo, or uploaded MP4s.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link per model",
          why: "One code per model or revision. Bulk-create them through the REST API from your product database.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Warranty registration or fault reports with text, email and choice fields, exportable as CSV.",
        },
      ],
      distances: [
        { label: "Rating plate or label", meters: 0.3 },
        { label: "Box on a shelf", meters: 0.8 },
        { label: "Machine on the factory floor", meters: 1.5 },
      ],
      tips: [
        "Labels on machines get oily and scratched. Use durable polyester or metal labels, and choose error correction H if the label will be partly covered.",
        "Laser-etched codes on metal need high contrast; test etched samples under the factory's lighting before committing.",
        "Keep a blank quiet zone around the code even on crowded rating plates.",
        "Print the model number as text beside the code so support staff can identify it from a photo.",
      ],
      ctas: [
        "Scan for the manual and spare parts",
        "Watch the 2-minute setup video",
        "Register your warranty",
        "Maintenance procedure for this machine",
      ],
      faqs: [
        {
          question: "Why use a dynamic QR code on a manufactured product?",
          answer:
            "Products outlive websites. A dynamic code lets you change where it points when your support site moves, so units sold years ago still open the right manual.",
        },
        {
          question: "Can I generate QR codes for thousands of products?",
          answer:
            "Yes. The bulk generator turns a CSV into static codes in your browser, and the REST API creates dynamic codes in bulk on paid plans, so each product line gets its own trackable link.",
        },
        {
          question: "What file format should I give the packaging printer?",
          answer:
            "Vector: SVG or a print-ready CMYK PDF, both exported free from QRdx. Vector codes stay sharp at any size and avoid the blurry edges of a scaled PNG.",
        },
      ],
      related: ["packaging", "product-manuals", "labels", "stickers"],
      image: "productPackaging",
    },
    {
      slug: "logistics",
      name: "Logistics and warehousing",
      noun: "logistics and warehousing",
      title: "QR codes for logistics and warehouses",
      seoTitle: "QR Codes for Logistics and Warehouses",
      metaDescription:
        "QR codes in logistics: delivery tracking on parcels, proof of delivery, returns, warehouse location labels and driver documents, with label sizing.",
      summary:
        "Parcel tracking, returns, location labels and driver documents.",
      intro: [
        "Logistics already runs on barcodes, from shipping labels to pallet IDs. Customer-facing QR codes are different: they live on the parcel, the delivery note or the van, and they give the recipient a way to track, rebook or return without calling anyone.",
        "Inside the warehouse, QR codes on racks and docks can open instructions, safety sheets and contact lists that change more often than the labels do.",
      ],
      useCases: [
        {
          title: "Track or rebook a delivery",
          description:
            "A code on the 'sorry we missed you' card that opens tracking and redelivery options.",
        },
        {
          title: "Easy returns",
          description:
            "A code on the packing slip that opens the returns portal for that retailer.",
        },
        {
          title: "Dock and rack instructions",
          description:
            "Codes at loading docks that open booking rules, safety requirements and site contacts for visiting drivers.",
        },
        {
          title: "Driver documents",
          description:
            "Vehicle checklists and incident forms in the cab, behind a code that never needs reprinting.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link to tracking or returns",
          why: "Points at your current tracking or returns provider. Switch providers and printed cards keep working.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Site rules, safety data sheets and driver checklists that you update without relabelling docks.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Incident reports and delivery feedback with rating, text and choice fields.",
        },
      ],
      distances: [
        { label: "Parcel or delivery card", meters: 0.3 },
        { label: "Rack label from the aisle", meters: 2 },
        { label: "Loading dock sign", meters: 5 },
      ],
      tips: [
        "Don't put customer-facing QR codes next to the carrier's shipping barcode; scanners at sorting hubs can pick the wrong one. Keep them clearly apart and labelled.",
        "Thermal labels fade in heat and sunlight. Use thermal-transfer or laser-printed labels for anything that must last.",
        "Rack labels read from a forklift need to be large: from 2 m, about 23 cm for a short link.",
        "Laminate dock signs and mount them away from where pallets and forks hit.",
      ],
      ctas: [
        "Missed us? Scan to rebook your delivery",
        "Scan to start a return",
        "Driver information for this site",
        "Report an incident",
      ],
      faqs: [
        {
          question: "Should logistics use QR codes or barcodes?",
          answer:
            "Both, for different jobs. Keep the carrier's barcodes for sorting and tracking systems. Use QR codes where a person with a phone needs information or an action: tracking, returns, instructions and forms.",
        },
        {
          question: "Can I see how many customers use the returns code?",
          answer:
            "Yes. A dynamic code counts every scan with time, country and device, so you can measure how many customers start a return from the packing slip.",
        },
        {
          question: "Do QR codes work on thermal shipping labels?",
          answer:
            "They do while the label is fresh, but direct thermal prints fade. For codes that need to last weeks, use thermal-transfer labels and test after exposure to heat.",
        },
      ],
      related: ["labels", "invoices", "vehicles", "stickers"],
    },
    {
      slug: "construction",
      name: "Construction",
      noun: "construction",
      title: "QR codes for construction sites",
      seoTitle: "QR Codes for Construction Sites and Builders",
      metaDescription:
        "QR codes on construction sites: site induction, safety documents, permits, equipment checks and hoarding marketing for new developments, with sign sizes.",
      summary:
        "Site induction, safety documents, equipment checks and hoarding signs.",
      intro: [
        "Construction sites run on documents that change weekly: method statements, risk assessments, permits, drawings. A QR code on the site board or a piece of equipment can open the current version, so nobody works from a printout that was superseded last Tuesday.",
        "The hoarding around a site is also the developer's biggest billboard. A code there can open the sales page for the homes being built, or a page explaining the works to neighbours.",
      ],
      useCases: [
        {
          title: "Site induction",
          description:
            "A code at the gate that opens the induction video and sign-in form for visitors and subcontractors.",
        },
        {
          title: "Current safety documents",
          description:
            "Risk assessments, method statements and emergency contacts behind codes on the site board.",
        },
        {
          title: "Equipment checks",
          description:
            "Tags on scaffolds, ladders and plant that open the inspection checklist and the latest inspection record.",
        },
        {
          title: "Hoardings and neighbours",
          description:
            "Sales pages for the development, or a page with working hours and a contact for complaints.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "pdf",
          why: "Drawings and safety documents replaced as they are revised, so the printed code always opens the current issue.",
        },
        {
          kind: "page",
          page: "video",
          why: "Induction and toolbox-talk videos that play in a browser at the gate.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Sign-in, inspection and near-miss forms with choice and text fields, exportable for the site file.",
        },
        {
          kind: "page",
          page: "business",
          why: "For hoardings facing neighbours: working hours, site contacts and the address in one place.",
        },
      ],
      distances: [
        { label: "Equipment tag", meters: 0.5 },
        { label: "Site board at the gate", meters: 1.5 },
        { label: "Hoarding, from across the road", meters: 8 },
      ],
      tips: [
        "Dust and rain cover codes quickly. Use outdoor-grade vinyl with a laminate and wipe the site board during weekly checks.",
        "Hoarding codes for passers-by across the road need to be about a metre wide; if that's too big, put a smaller code at pavement level on the hoarding itself.",
        "Use error correction H on equipment tags that get scratched.",
        "Gloves and high-vis don't stop scanning, but direct sun on glossy signs does. Prefer matte finishes.",
      ],
      ctas: [
        "Scan before entering site: induction and sign-in",
        "Current risk assessment",
        "Inspect this ladder",
        "Homes coming soon: scan for prices",
      ],
      faqs: [
        {
          question: "Can a QR code replace printed safety documents on site?",
          answer:
            "It can give everyone access to the current version, which paper often isn't. Check your local health and safety rules; some documents may still need to be displayed or signed on paper.",
        },
        {
          question: "How do I make sure the code opens the latest drawing?",
          answer:
            "Put a dynamic code on the board that opens a hosted PDF page, and upload each new revision there. The code stays the same and nobody opens a superseded drawing by accident.",
        },
        {
          question: "Will QR codes survive outdoors on site?",
          answer:
            "The code never expires, but the print can wear. Use UV-resistant outdoor vinyl or engraved tags, error correction H for tags, and check them during regular inspections.",
        },
      ],
      related: ["signs", "billboards", "stickers", "certificates"],
    },
    {
      slug: "agriculture",
      name: "Agriculture",
      noun: "agriculture",
      title: "QR codes for farms and agriculture",
      seoTitle: "QR Codes for Farms and Agricultural Products",
      metaDescription:
        "QR codes for farms: produce traceability, farm-shop and market sales, seed and feed product information, field signs and payments at the stall.",
      summary:
        "Produce traceability, farm-shop sales, product info and field signs.",
      intro: [
        "Buyers increasingly want to know where food comes from. A QR code on a crate, a box of eggs or a bag of grain can open the farm's story, the harvest date and certifications, which is worth more on a supermarket shelf than another line of label text.",
        "Farms also sell directly at markets and farm gates, often unstaffed. A payment code and a stock list behind a dynamic code keep honesty-box sales and market stalls running smoothly.",
      ],
      useCases: [
        {
          title: "Traceability on the pack",
          description:
            "Batch or field information, harvest date and certifications on a page linked from the box or crate.",
        },
        {
          title: "Farm shop and market stall",
          description:
            "A payment code and this week's availability at the stall or the honesty box.",
        },
        {
          title: "Seed, feed and agrochemical information",
          description:
            "Product sheets, safety data and application rates linked from the sack or label.",
        },
        {
          title: "Field and trail signs",
          description:
            "Signs for farm visits, open days and public footpaths that explain what is growing.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link per batch or season",
          why: "Point this season's packs at this season's page; next year, create a new code or repoint the old one.",
        },
        {
          kind: "static",
          type: "upi",
          why: "Payments at the farm gate in India from any UPI app, with no fees from QRdx.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Product and safety data sheets you replace with updated versions.",
        },
        {
          kind: "page",
          page: "links",
          why: "The farm shop page: opening times, availability, socials and box-scheme sign-up.",
        },
      ],
      distances: [
        { label: "Egg box or produce label", meters: 0.3 },
        { label: "Market stall sign", meters: 1.2 },
        { label: "Farm gate or field sign", meters: 3 },
      ],
      tips: [
        "Outdoor signs at the gate face weather and sun; use outdoor vinyl or engraved plates.",
        "Mobile signal in fields can be weak. Keep linked pages small and avoid large video files.",
        "Crates and sacks are handled roughly; put the code on a flat area away from handles and seams.",
        "Print the farm name as text under the code for buyers who won't scan.",
      ],
      ctas: [
        "Meet the farm that grew this",
        "Pay here with any UPI app",
        "What's in season this week",
        "Join our veg box scheme",
      ],
      faqs: [
        {
          question: "How can a QR code show where produce comes from?",
          answer:
            "Link the pack to a page with the farm, the field or batch, the harvest date and certifications. Use one dynamic code per batch if the details change.",
        },
        {
          question:
            "Can I take payments at an unstaffed farm stall with a QR code?",
          answer:
            "Yes, by printing your payment provider's code, such as a UPI or PayPal code, on the honesty box. The money goes straight to your account; QRdx is never involved in the payment.",
        },
        {
          question: "Will a QR code work in fields with poor signal?",
          answer:
            "The scan itself works offline, but opening the page needs data. Keep pages light, and use static codes for content that must work offline, like a phone number or text.",
        },
      ],
      related: ["labels", "packaging", "signs", "stickers"],
    },
    {
      slug: "transportation",
      name: "Transit and parking",
      noun: "transit and parking",
      title: "QR codes for public transport and parking",
      seoTitle: "QR Codes for Public Transport and Parking",
      metaDescription:
        "QR codes for transit and parking: live departures at stops, service changes, parking payment and fraud prevention, accessible information and feedback.",
      summary:
        "Live departures at stops, parking payment and fraud-safe signs.",
      intro: [
        "A bus stop timetable is out of date whenever a diversion goes in. A QR code on the stop that opens live departures and service changes for that stop gives riders accurate information while the printed timetable stays as the fallback.",
        "Parking operators use codes for payment, which makes them a target for fake stickers. Operators need codes on their own domain, tamper-evident labels and a clear message to drivers about what a genuine code looks like.",
      ],
      useCases: [
        {
          title: "Live departures per stop",
          description:
            "Each stop's code opens its real-time departures, diversions and accessibility information.",
        },
        {
          title: "Pay for parking",
          description:
            "A code on the meter or sign that opens the operator's official payment page for that zone.",
        },
        {
          title: "Service changes and disruption",
          description:
            "Codes on station posters that open the current disruption page, updated as it happens.",
        },
        {
          title: "Report a problem",
          description:
            "Feedback forms for broken shelters, dirty vehicles or accessibility issues at a specific location.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link per stop or zone, on your domain",
          why: "One code per stop or parking zone, on a custom domain riders can recognise. Repoint codes during diversions.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Location-specific problem reports with choice and text fields, one form per stop or car park.",
        },
        {
          kind: "page",
          page: "apps",
          why: "If you have a ticketing app, send iPhone scans to the App Store and Android scans to Google Play.",
        },
      ],
      distances: [
        { label: "Bus stop timetable panel", meters: 0.6 },
        { label: "Parking sign or meter", meters: 1 },
        { label: "Station poster across the platform", meters: 4 },
      ],
      tips: [
        "Print the official domain under every payment code, and tell drivers on the sign: 'Only pay through pay.example-city.gov'.",
        "Use tamper-evident labels for payment codes and inspect them on regular rounds.",
        "Mount stop codes at 1.2 to 1.4 m so wheelchair users can scan them.",
        "Give each stop or zone its own code so analytics show where riders and drivers need information.",
      ],
      ctas: [
        "Live departures from this stop",
        "Pay for parking in this zone",
        "Service changes today",
        "Report a problem at this stop",
      ],
      faqs: [
        {
          question: "How can drivers tell a fake parking QR code?",
          answer:
            "Fake codes are usually stickers placed over the real one and open look-alike payment sites. Drivers should check that the link preview shows the operator's official domain. Operators should print that domain on the sign and inspect codes regularly.",
        },
        {
          question: "Can QR codes at stops show live departures?",
          answer:
            "Yes, by linking each stop's code to the live departures page for that stop in your journey planner. A dynamic code lets you change the destination if the planner's URLs change.",
        },
        {
          question: "Can we use our own domain for QR short links?",
          answer:
            "Yes. Custom domains on Pro and Business put your domain in every short link, which is the best signal to riders and drivers that a code is genuine.",
        },
      ],
      related: ["signs", "tickets", "posters", "vehicles"],
      image: "busStopPoster",
    },
  ],
};
