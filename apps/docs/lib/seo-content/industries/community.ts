import type { SeoGroup } from "../types";

export const community: SeoGroup = {
  id: "community",
  title: "Health, education and community",
  description:
    "Patient information, classroom resources, public notices and giving.",
  items: [
    {
      slug: "healthcare",
      name: "Healthcare",
      noun: "healthcare",
      title: "QR codes for clinics, hospitals and healthcare",
      seoTitle: "QR Codes for Clinics and Hospitals",
      metaDescription:
        "QR codes in healthcare: appointment booking, patient leaflets, wayfinding, waiting-room Wi-Fi and feedback, plus privacy do's and don'ts and sizing tips.",
      summary: "Booking, patient leaflets, wayfinding and waiting-room Wi-Fi.",
      intro: [
        "Clinics print a lot of paper that goes out of date: aftercare leaflets, visiting hours, vaccination campaign posters, signs to departments that have moved. QR codes on these let staff update the information in one place, and let patients read it later at home, in a larger font or another language.",
        "Healthcare also has a rule the other industries don't: a QR code should never contain or collect patient data unless it runs through your clinical systems. Use QRdx codes for public information, such as leaflets, booking pages, directions and Wi-Fi, and keep medical records where they belong.",
      ],
      useCases: [
        {
          title: "Aftercare and patient leaflets",
          description:
            "A code on the discharge sheet opens the leaflet as a PDF the patient can zoom, save or forward to a carer, and you can replace it when guidance changes.",
        },
        {
          title: "Book or change an appointment",
          description:
            "Reminder cards and posters that open your booking system cut phone queues at 8 am.",
        },
        {
          title: "Wayfinding in large sites",
          description:
            "Codes at entrances and lift lobbies open a map or directions to each department, updated when wards move.",
        },
        {
          title: "Waiting-room Wi-Fi and feedback",
          description:
            "A guest Wi-Fi code in the waiting room, and an anonymous feedback form on the way out.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "pdf",
          why: "Patient information leaflets that can be replaced with a new version while the printed discharge sheets stay the same.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link to your booking system",
          why: "Points at whichever booking provider you use; if you switch, change the destination and keep every poster and card.",
        },
        {
          kind: "static",
          type: "wifi",
          why: "Guest Wi-Fi for the waiting room, on a network separate from clinical systems.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Anonymous experience feedback with star ratings. Ask about the visit, not the patient's condition.",
        },
      ],
      distances: [
        { label: "Discharge sheet or leaflet", meters: 0.35 },
        { label: "Waiting-room poster, seated", meters: 2 },
        { label: "Corridor sign", meters: 3 },
      ],
      tips: [
        "Many patients have reduced vision or are anxious. Print the code large, with a plain instruction next to it, and keep a phone number for people who can't scan.",
        "Waiting-room posters are read from a seat; put them at seated eye level, not above the reception desk.",
        "Use a custom domain on Pro so patients see your organisation's name in the link preview, which helps them trust it.",
        "Laminate codes in clinical areas so they can be wiped with disinfectant.",
      ],
      ctas: [
        "Scan for your aftercare instructions",
        "Book or change your appointment",
        "Find your department",
        "Free Wi-Fi for patients and visitors",
      ],
      faqs: [
        {
          question: "Can I put patient information in a QR code?",
          answer:
            "Don't. A static code stores its content in plain text that anyone with a camera can read, and a dynamic link can be forwarded. Use QR codes for public information and send patients to your secure portal for anything personal.",
        },
        {
          question: "Can I use QRdx forms to collect health information?",
          answer:
            "No. QRdx forms are for general feedback and enquiries, not protected health information. Use your clinical or patient-portal systems for anything covered by health privacy law.",
        },
        {
          question: "How do I update a leaflet that is already printed?",
          answer:
            "If the printed code opens a hosted PDF page, upload the new version and every printed sheet shows it. If it's a static link to a file, the code breaks or shows the old file when that file changes.",
        },
      ],
      related: ["posters", "signs", "product-manuals", "badges"],
    },
    {
      slug: "pharma",
      name: "Pharmaceuticals",
      noun: "pharmaceutical brands",
      title: "QR codes for pharmaceutical and health brands",
      seoTitle: "QR Codes for Pharma Packaging and Leaflets",
      metaDescription:
        "QR codes on pharmaceutical and supplement packaging: up-to-date patient leaflets, how-to-use videos and pharmacy materials, with regulatory and sizing notes.",
      summary:
        "Current patient leaflets, how-to-use videos and pharmacist materials.",
      intro: [
        "A paper patient leaflet is out of date the moment the label changes, and the print is too small for many of the people who need it most. A QR code on the pack can open the current leaflet in a readable size, a demonstration video for an inhaler or injection pen, or the leaflet in another language.",
        "Medicine packaging is regulated, so what a code may link to, and where it may sit, often needs approval from the national regulator. Treat this page as practical guidance for the code itself, and check the rules for each product and market.",
      ],
      useCases: [
        {
          title: "The current patient leaflet",
          description:
            "Link the pack to the latest approved leaflet, so patients don't rely on a paper version printed years ago.",
        },
        {
          title: "How to use the device",
          description:
            "Inhalers, pens and patches are easier to use correctly after watching a short demonstration.",
        },
        {
          title: "Supplements and OTC products",
          description:
            "Dosage guidance, ingredient sources and certifications for products with fewer labelling restrictions.",
        },
        {
          title: "Materials for pharmacists",
          description:
            "Codes on display units and trade packs that open product information sheets for staff.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "pdf",
          why: "Host the approved leaflet as a PDF and replace it with each revision; the code on the pack keeps working.",
        },
        {
          kind: "page",
          page: "video",
          why: "A device demonstration, embedded from YouTube or Vimeo or uploaded as MP4.",
        },
        {
          kind: "dynamic",
          label: "Dynamic link per product and market",
          why: "Separate codes per product and country send each pack to the right approved content.",
        },
      ],
      distances: [
        { label: "Pack in the hand", meters: 0.25 },
        { label: "Pharmacy shelf", meters: 0.8 },
      ],
      tips: [
        "Keep the information QR code clearly apart from any 2D DataMatrix used for serialisation, and label which is which, so pharmacists scan the right one.",
        "Small cartons leave little room; about 2.9 cm is the minimum for a short link at 25 cm, and a quiet zone matters more than squeezing in extra size.",
        "Print in solid black. Brand colours on coated carton board often reduce contrast below what cheaper phone cameras need.",
        "Supply vector artwork (SVG or CMYK PDF) to the packaging printer.",
      ],
      ctas: [
        "Scan for the latest patient leaflet",
        "Watch how to use your inhaler",
        "Leaflet in large print and other languages",
      ],
      faqs: [
        {
          question: "Are QR codes allowed on medicine packaging?",
          answer:
            "In many countries, yes, but the content they link to usually needs regulatory approval and must match the approved product information. Rules differ by country and product type, so check with the relevant regulator before printing.",
        },
        {
          question: "Is this the same as the 2D code used for serialisation?",
          answer:
            "No. Anti-counterfeiting and track-and-trace schemes typically use a GS1 DataMatrix with the product code and serial number. A QR code for patient information is separate and can sit alongside it.",
        },
        {
          question: "Why use a dynamic code on a medicine pack?",
          answer:
            "Because packs stay in cupboards for years. A dynamic code lets you update the linked leaflet with each approved revision, so an old pack still opens current information.",
        },
      ],
      related: ["packaging", "labels", "product-manuals", "shelves"],
    },
    {
      slug: "education",
      name: "Schools and universities",
      noun: "schools and universities",
      title: "QR codes for schools and universities",
      seoTitle: "QR Codes for Schools, Classrooms and Campuses",
      metaDescription:
        "QR codes for schools and universities: classroom resources, attendance, campus maps, parent newsletters, open days and library guides. Sizes and tips.",
      summary: "Classroom resources, attendance, campus maps and open days.",
      intro: [
        "Teachers use QR codes to get thirty students to the same web page without anyone mistyping a URL. The same trick works for parents (the newsletter, the permission form), visitors (the campus map) and prospective students (the open-day booking page).",
        "School years repeat. A code on the classroom wall or in the student handbook can point at this term's resources and be updated next year, which makes dynamic codes better value than reprinting every September.",
      ],
      useCases: [
        {
          title: "Classroom resources",
          description:
            "A code on the worksheet or the board opens the reading, the video or the shared document for the lesson.",
        },
        {
          title: "Attendance and sign-ins",
          description:
            "A code at the door that opens a sign-in form for lectures, clubs or visitors.",
        },
        {
          title: "Campus maps and wayfinding",
          description:
            "Codes on building signs that open the map and accessible routes, useful during freshers' week and open days.",
        },
        {
          title: "Parents and admissions",
          description:
            "Newsletters, permission forms and open-day registrations, with separate codes to see which channel reaches parents.",
        },
      ],
      recommended: [
        {
          kind: "static",
          type: "attendance",
          why: "Check-ins through a Google Form, free and with no QRdx account needed.",
        },
        {
          kind: "static",
          type: "google-drive",
          why: "Opens a Drive folder, Doc or Sheet with the lesson materials. Check the sharing settings first.",
        },
        {
          kind: "page",
          page: "event",
          why: "Open days, parent evenings and performances with add-to-calendar buttons.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Handbooks, prospectuses and policies that you replace each year behind the same printed code.",
        },
      ],
      distances: [
        { label: "Worksheet or handout", meters: 0.35 },
        { label: "Building entrance sign", meters: 2 },
        { label: "Classroom board, front rows", meters: 3 },
      ],
      tips: [
        "On a projector, leave the code on screen long enough for the back row, and make it large: from 6 m it needs to be about 70 cm wide.",
        "Students often scan with older phones with weaker cameras; strong contrast and no logo in the middle help.",
        "For worksheets photocopied many times, use a short link so the code stays simple and survives copier blur.",
        "Check that linked documents are shared with the right people before printing; a code to a private Drive file just shows a sign-in wall.",
      ],
      ctas: [
        "Scan for today's reading",
        "Sign in for this session",
        "Campus map and accessible routes",
        "Book your open-day place",
      ],
      faqs: [
        {
          question: "Can students scan QR codes without an app?",
          answer:
            "Yes. The camera apps on current iPhones and Android phones read QR codes directly. School-managed Chromebooks and tablets may need a scanning app or extension.",
        },
        {
          question: "Are QR codes useful on worksheets that get photocopied?",
          answer:
            "Yes, if they are simple. A short dynamic link produces a code with fewer, larger modules, which survives photocopying better than a long URL encoded directly.",
        },
        {
          question: "Can we reuse the same codes next school year?",
          answer:
            "With dynamic codes, yes. Point them at next year's resources in the dashboard; the printed posters and handbooks stay the same.",
        },
      ],
      related: ["presentations", "posters", "certificates", "books"],
    },
    {
      slug: "government",
      name: "Government and councils",
      noun: "government services",
      title: "QR codes for government and public services",
      seoTitle: "QR Codes for Councils and Public Services",
      metaDescription:
        "QR codes for government and councils: public notices, service pages, consultations, multilingual information and safe payment links, with anti-fraud tips.",
      summary:
        "Public notices, consultations, service pages and multilingual information.",
      intro: [
        "Public notices are printed small and legalistic, and most residents walk past them. A QR code on a planning notice, a roadworks sign or a bin can open the full details, the consultation form or the service page in plain language, in the resident's language.",
        "Government codes are also a target for fraud: fake stickers placed over real codes on parking meters and signs. Using your own domain for short links, and telling residents what it is, is the most effective defence.",
      ],
      useCases: [
        {
          title: "Notices and consultations",
          description:
            "Planning notices, road closures and consultations link to the full plans and a comment form.",
        },
        {
          title: "Service information",
          description:
            "Bin collection days, library hours and permit rules on the service page, updated without new signs.",
        },
        {
          title: "Multilingual information",
          description:
            "One code that opens information in the phone's language, for public health or emergency notices.",
        },
        {
          title: "Reporting problems",
          description:
            "Codes on street furniture and park signs that open the report form for that location.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link on your own domain",
          why: "Short links on a custom domain such as go.yourcity.gov tell residents the code is genuine. Custom domains are on Pro and Business.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "Plans, notices and reports hosted as PDFs you can replace with the latest version.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Short consultations and service feedback with choice and rating fields, exportable as CSV.",
        },
        {
          kind: "static",
          type: "maps",
          why: "Opens the exact site of a planning application or closure in Google Maps.",
        },
      ],
      distances: [
        { label: "Notice on a lamp post", meters: 0.8 },
        { label: "Office or library poster", meters: 2 },
        { label: "Roadside sign, pedestrians", meters: 4 },
      ],
      tips: [
        "Print the expected short-link domain as text under every code, and tell residents on your website which domains you use.",
        "Inspect high-value codes (parking, payments) regularly for stickers placed on top.",
        "Use a fallback URL on Pro so expired consultations open the outcome page instead of a closed form.",
        "Mount notices at 1.2 to 1.5 m and in accessible locations, with the reference number as text.",
      ],
      ctas: [
        "Scan for the full plans and to comment",
        "Collection days for this street",
        "Information in your language",
        "Report a problem here",
      ],
      faqs: [
        {
          question: "How do residents know a council QR code is genuine?",
          answer:
            "Use a short-link domain you own, print it under the code, and publish the list of official domains on your website. QRdx custom domains (Pro and Business) put your domain in every short link.",
        },
        {
          question: "What is QR code fraud on parking meters?",
          answer:
            "Criminals stick their own codes over genuine ones to send people to fake payment pages, sometimes called quishing. Tamper-evident labels, regular inspections and an official domain printed on the sign all reduce the risk.",
        },
        {
          question: "Can one code serve information in several languages?",
          answer:
            "Yes. Language routing on Pro sends each scan to the version matching the phone's language setting, with a default for everyone else.",
        },
      ],
      related: ["signs", "posters", "direct-mail", "envelopes"],
    },
    {
      slug: "nonprofits",
      name: "Nonprofits and charities",
      noun: "nonprofits and charities",
      title: "QR codes for nonprofits and charities",
      seoTitle: "QR Codes for Nonprofits: Donations and Volunteers",
      metaDescription:
        "QR codes for nonprofits: donation pages, volunteer sign-ups, impact stories, event registration and annual reports, with print tips and wording ideas.",
      summary:
        "Donations, volunteer sign-ups, impact stories and event registration.",
      intro: [
        "A nonprofit's printed materials (appeal letters, collection tins, event banners, annual reports) reach people at the moment they feel like helping. A QR code turns that moment into a donation or a volunteer sign-up before it passes.",
        "Budgets are tight, so it matters that codes are free to make, keep working without a subscription, and show which appeal actually raised the money. Separate dynamic codes per campaign give you that without paying for a separate tool.",
      ],
      useCases: [
        {
          title: "Donate from the appeal",
          description:
            "A code on the letter, tin or poster opens the donation page with the campaign already selected.",
        },
        {
          title: "Volunteer sign-up",
          description:
            "A short form at events and on flyers that collects names, contact details and availability.",
        },
        {
          title: "Show the impact",
          description:
            "A video or photo story of the project the donation funds, linked from the thank-you card.",
        },
        {
          title: "Events and fundraisers",
          description:
            "Galas, runs and quiz nights with registration and calendar buttons.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic link per appeal",
          why: "One code per mailing or poster run, each pointing at the donation page. Compare scans to see which appeal performs.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Volunteer sign-ups with text, email, phone and choice fields, collected in your dashboard.",
        },
        {
          kind: "page",
          page: "video",
          why: "An impact story from YouTube or Vimeo on a fast mobile page.",
        },
        {
          kind: "static",
          type: "upi",
          why: "In India, a UPI code on a collection box lets people give from any UPI app.",
        },
      ],
      distances: [
        { label: "Appeal letter or thank-you card", meters: 0.35 },
        { label: "Collection tin or counter", meters: 0.6 },
        { label: "Event banner", meters: 4 },
      ],
      tips: [
        "Print the code next to the emotional part of the appeal, not on the back page with the legal text.",
        "On collection tins, keep the code flat on a label wrapped around the widest, straightest part.",
        "Write the donation URL under the code for supporters who prefer to type it.",
        "If a campaign ends, point its codes at your general donation page rather than letting them go stale.",
      ],
      ctas: [
        "Scan to give in under a minute",
        "Join our volunteers",
        "See what your donation does",
        "Sign up for the charity run",
      ],
      faqs: [
        {
          question: "Do QR codes increase donations?",
          answer:
            "They remove the step where supporters have to remember and type a URL later, which is where many intended donations are lost. Measure it for your own appeals by giving each one its own dynamic code.",
        },
        {
          question: "Can we make QR codes for free as a nonprofit?",
          answer:
            "Yes. Static codes are free and unlimited without an account, and the Free plan includes dynamic codes with unlimited scans. QRdx is also open source, so you can self-host it.",
        },
        {
          question: "What happens to old appeal codes?",
          answer:
            "Repoint them. A dynamic code from last year's mailing can open this year's appeal or your general donation page, so the printed letters people kept still work.",
        },
      ],
      related: ["direct-mail", "flyers", "t-shirts", "tv-and-video"],
    },
    {
      slug: "churches",
      name: "Churches and places of worship",
      noun: "churches and places of worship",
      title: "QR codes for churches and places of worship",
      seoTitle: "QR Codes for Churches: Giving, Bulletins, Sermons",
      metaDescription:
        "QR codes for churches and places of worship: online giving, weekly bulletins, sermon recordings, prayer requests, events and volunteer rotas.",
      summary:
        "Giving, weekly bulletins, sermon recordings and prayer requests.",
      intro: [
        "Fewer people carry cash, and a collection plate passed down the row doesn't help them. A QR code in the pew or on the bulletin that opens your giving page lets every member give in the way that suits them.",
        "Weekly bulletins, rotas and event notices change every week. A permanent code in the pews that opens this week's bulletin saves printing, and a code at the door can open the recording of last week's sermon.",
      ],
      useCases: [
        {
          title: "Giving",
          description:
            "A code in pews, on the bulletin and by the door that opens your online giving page.",
        },
        {
          title: "This week's bulletin",
          description:
            "One printed code that opens the current bulletin, updated each week from the office.",
        },
        {
          title: "Sermons and music",
          description:
            "Recordings of last week's sermon or the choir, linked from the bulletin or newsletter.",
        },
        {
          title: "Prayer requests and volunteering",
          description:
            "A private form for prayer requests, and sign-ups for rotas, groups and events.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "pdf",
          why: "Upload each week's bulletin; the pew card always opens the latest one.",
        },
        {
          kind: "page",
          page: "mp3",
          why: "Sermon recordings in an audio player with a playlist of recent weeks.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Prayer requests and volunteer sign-ups with text and choice fields, visible to the team in the dashboard.",
        },
        {
          kind: "page",
          page: "event",
          why: "Services, festivals and community events with calendar buttons for the newsletter.",
        },
      ],
      distances: [
        { label: "Pew card or bulletin", meters: 0.4 },
        { label: "Noticeboard", meters: 1.2 },
        { label: "Banner outside", meters: 5 },
      ],
      tips: [
        "Churches are often dim. Print pew cards in black on white and test them in your darkest corner.",
        "Place giving codes where people pause: the pew back, the entrance table and the bulletin cover.",
        "Keep the giving page fast; a slow page loses people between the pew and the payment.",
        "Offer an alternative for members without smartphones, such as envelopes or a card reader.",
      ],
      ctas: [
        "Scan to give",
        "This week's bulletin",
        "Listen to Sunday's sermon",
        "Share a prayer request",
      ],
      faqs: [
        {
          question: "Can we use one QR code for every week's bulletin?",
          answer:
            "Yes. Print a dynamic code that opens a PDF page, then upload the new bulletin each week. The code in the pews never changes.",
        },
        {
          question: "Is online giving through a QR code safe?",
          answer:
            "The code only opens a web page; the payment runs through your giving provider. Use your provider's official page, check the code hasn't been covered with a sticker, and print your domain under it.",
        },
        {
          question: "Can we see how many people use the codes?",
          answer:
            "Yes. Dynamic codes count scans over time, so you can compare the pew cards with the bulletin and see which services or events draw interest.",
        },
      ],
      related: ["table-tents", "posters", "envelopes", "signs"],
    },
  ],
};
