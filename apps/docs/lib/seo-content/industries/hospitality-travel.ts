import type { SeoGroup } from "../types";

export const hospitalityTravel: SeoGroup = {
  id: "hospitality-travel",
  title: "Hospitality, travel and events",
  description: "Guest information, audio guides, schedules, tickets and RSVPs.",
  items: [
    {
      slug: "hotels",
      name: "Hotels",
      noun: "hotels",
      title: "QR codes for hotels and guesthouses",
      seoTitle: "QR Codes for Hotels: Wi-Fi, Guest Info and Reviews",
      metaDescription:
        "How hotels use QR codes for Wi-Fi, digital compendiums, room service menus, local guides, checkout feedback and reviews, with sizes for rooms and lobbies.",
      summary:
        "In-room Wi-Fi, a digital guest compendium, room service and reviews.",
      intro: [
        "The printed guest compendium in a hotel room goes out of date the week it is printed: the spa hours change, the restaurant gets a new menu, the shuttle schedule moves. A QR code on the desk card that opens a hosted guide lets housekeeping stop replacing binders and lets guests read it in their own time.",
        "The other codes every hotel needs are simpler: Wi-Fi in every room and at reception, and a review request at checkout. Wi-Fi works as a free static code; reviews and the guide work better as dynamic codes you can measure.",
      ],
      useCases: [
        {
          title: "Wi-Fi in every room",
          description:
            "A static Wi-Fi code on the key-card holder or desk card connects a phone in one scan, without the guest typing a 16-character password.",
        },
        {
          title: "A guest guide that stays current",
          description:
            "Breakfast times, spa booking, gym hours, checkout time and taxi numbers on a page you edit from the front desk.",
        },
        {
          title: "Room service and the restaurant",
          description:
            "A menu page by the phone, with prices and dietary tags you can update without reprinting cards for every room.",
        },
        {
          title: "Feedback before checkout",
          description:
            "Ask for private feedback on the last night, so problems reach the manager while the guest is still there, and show the public review link to everyone.",
        },
      ],
      recommended: [
        {
          kind: "static",
          type: "wifi",
          why: "Encodes the network and password so guests join without typing. If each floor or room type has its own network, make one code each.",
        },
        {
          kind: "page",
          page: "links",
          why: "The digital compendium: buttons for breakfast, spa, transfers, local tips and the hotel app, all editable by staff.",
        },
        {
          kind: "page",
          page: "menu",
          why: "Room-service and restaurant menus with sections, prices and allergen tags.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "A short stay survey with star ratings; the public review link stays visible to every guest whatever they score.",
        },
      ],
      distances: [
        { label: "Desk card or key holder", meters: 0.4 },
        { label: "Reception counter", meters: 1 },
        { label: "Lobby or lift poster", meters: 2 },
      ],
      tips: [
        "Put the Wi-Fi code where guests unpack, on the desk or the key-card holder, rather than inside a binder.",
        "Bedside lighting is dim and warm; use black on white and avoid gold-on-cream brand palettes for the code itself.",
        "Use a separate dynamic code for the lift posters and the room cards so you can see which channel guests use.",
        "Keep a phone number on the card next to the code for guests who prefer to call reception.",
      ],
      ctas: [
        "Scan to connect to Wi-Fi",
        "Everything about your stay, in one scan",
        "Order room service",
        "How was your stay? Tell us before you leave",
      ],
      faqs: [
        {
          question: "Can a QR code replace the hotel room compendium?",
          answer:
            "Mostly. A hosted guide is easier to keep current and to translate. Keep a short printed card with the essentials (Wi-Fi, reception number, checkout time) for guests without a phone handy.",
        },
        {
          question: "Do Wi-Fi QR codes work on every phone?",
          answer:
            "Recent iPhones and Android phones join a network straight from the camera. The code uses the standard WIFI: format, so it needs no app. Older phones may need a QR app.",
        },
        {
          question: "Is it safe to put the Wi-Fi password in a QR code?",
          answer:
            "It is as safe as printing the password on the card, which is what the code replaces. Use a separate guest network, isolated from staff and payment systems.",
        },
      ],
      related: ["table-tents", "signs", "menus", "emails"],
      image: "hotelWifi",
    },
    {
      slug: "tourism",
      name: "Tourism and attractions",
      noun: "tourism and attractions",
      title: "QR codes for tourism and attractions",
      seoTitle: "QR Codes for Tourism, Trails and Attractions",
      metaDescription:
        "QR codes for tourism boards and attractions: trail markers, multilingual audio guides, maps, opening times and offers. Weatherproof sizing and placement.",
      summary:
        "Trail markers, audio guides, maps and visitor information in any language.",
      intro: [
        "Tourism signs have to serve visitors who speak different languages, arrive at different times of year and stand in the rain. A QR code on a trail marker or information board can open a page in the visitor's language, with an audio guide and a map, while the physical sign stays simple.",
        "Signs in parks and on streets last years, while opening times, routes and events change every season. Dynamic codes keep the sign accurate without replacing it.",
      ],
      useCases: [
        {
          title: "Trail markers and viewpoints",
          description:
            "Each marker opens what the visitor is looking at: history, wildlife, the next stop and the distance back.",
        },
        {
          title: "Audio guides without an app",
          description:
            "An audio page per stop plays in the browser, so visitors don't need to download an app on roaming data.",
        },
        {
          title: "Visitor centre information",
          description:
            "Opening hours, tours, ticket prices and accessibility information behind one code on the door, updated for each season.",
        },
        {
          title: "Offers from local businesses",
          description:
            "Partner coupons for restaurants and shops near the attraction, which tourism boards can measure by scans.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "mp3",
          why: "An audio player per stop, with a playlist for the whole route. Upload new recordings without touching the sign.",
        },
        {
          kind: "static",
          type: "maps",
          why: "Opens the exact location or the next stop in Google Maps, free and with no account.",
        },
        {
          kind: "page",
          page: "business",
          why: "Seasonal opening hours, address, contact buttons and amenities for a visitor centre or attraction.",
        },
        {
          kind: "page",
          page: "coupon",
          why: "Partner offers with a redemption code and validity dates, counted per code.",
        },
      ],
      distances: [
        { label: "Trail marker, standing", meters: 0.8 },
        { label: "Information board", meters: 1.5 },
        { label: "Entrance sign", meters: 4 },
      ],
      tips: [
        "Mobile signal is weak on trails. Keep pages light; audio files should be short per stop rather than one long recording.",
        "Outdoor signs need UV-stable inks and an anti-graffiti laminate. Faded codes fail long before the rest of the sign looks old.",
        "Mount codes at about 1.2 to 1.5 m, angled slightly up, so people can scan without kneeling and wheelchair users can reach.",
        "Print a short web address under the code as a fallback for people who can't scan.",
      ],
      ctas: [
        "Listen to the story of this place",
        "Scan for the trail map",
        "Opening times and tickets",
        "Show this offer at nearby cafés",
      ],
      faqs: [
        {
          question: "Can one QR code show information in several languages?",
          answer:
            "Yes. On Pro, language-based routing sends each scan to the page in the phone's preferred language. Without it, one page can link to each language version.",
        },
        {
          question: "How long does a QR code on an outdoor sign last?",
          answer:
            "The code itself never expires; the print is the weak point. With UV-stable inks and a protective laminate, outdoor codes usually last years. Static and QRdx dynamic codes both keep working on every plan.",
        },
        {
          question: "Do visitors need an app to use an audio guide?",
          answer:
            "No. A hosted audio page plays in the phone's browser. That matters for international visitors who don't want to download an app on roaming data.",
        },
      ],
      related: ["signs", "posters", "brochures", "tickets"],
    },
    {
      slug: "museums",
      name: "Museums and galleries",
      noun: "museums and galleries",
      title: "QR codes for museums and galleries",
      seoTitle: "QR Codes for Museums and Galleries",
      metaDescription:
        "QR codes for museums and galleries: object labels, audio guides, accessible descriptions, membership and donations. Label sizes and gallery lighting tips.",
      summary:
        "Object labels with audio, accessible descriptions and donations.",
      intro: [
        "Wall labels in a museum hold about 60 words. Curators have far more to say, and visitors want different things: a child wants a story, a student wants the provenance, a blind visitor wants an audio description. A small code on the label can offer all three without crowding the wall.",
        "Exhibitions rotate, loans come and go and research updates the text. Dynamic codes on labels and in the exhibition guide keep the content current without reprinting.",
      ],
      useCases: [
        {
          title: "Audio and long-form labels",
          description:
            "Each object label opens a page with an audio commentary, extra images and the curator's longer text.",
        },
        {
          title: "Accessibility",
          description:
            "Audio descriptions for blind and partially sighted visitors, transcripts for deaf visitors and easy-read versions, all from the same label.",
        },
        {
          title: "Exhibition guide and map",
          description:
            "A code at the entrance replaces the paper guide, with a gallery map and today's talks.",
        },
        {
          title: "Membership and donations",
          description:
            "A code by the exit or donation box opens your membership or donation page at the moment visitors feel most generous.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "mp3",
          why: "Audio commentary and audio descriptions per object, with a playlist for the whole room.",
        },
        {
          kind: "page",
          page: "images",
          why: "Detail shots, the back of a painting or an X-ray: images visitors can't see on the wall.",
        },
        {
          kind: "page",
          page: "event",
          why: "Talks, late openings and workshops with add-to-calendar buttons, on posters in the foyer.",
        },
      ],
      distances: [
        { label: "Object label", meters: 0.5 },
        { label: "Gallery wall panel", meters: 1.2 },
        { label: "Foyer poster", meters: 2.5 },
      ],
      tips: [
        "Gallery lighting is low to protect objects. Print labels with strong contrast and a matte finish; test under the actual lux levels.",
        "Put the code in the same corner of every label so visitors learn where to look.",
        "Mount labels at a height that works for wheelchair users and children (around 90 to 120 cm to the centre), and include a short room or object number for audio-guide users without phones.",
        "Codes on labels can stay small: about 6 cm works from half a metre with a short link, less if visitors lean in.",
      ],
      ctas: [
        "Listen to the curator",
        "Audio description of this work",
        "Gallery map and today's talks",
        "Support the museum",
      ],
      faqs: [
        {
          question: "Do museum QR codes replace audio guide devices?",
          answer:
            "For many visitors, yes: they use their own phone and headphones. Keep a few devices or printed guides for visitors without a smartphone, and make sure the audio works without logging in.",
        },
        {
          question: "How do I know which exhibits visitors engage with?",
          answer:
            "Give each label its own dynamic code. QRdx counts scans per code and shows them over time, so you can compare objects and rooms, and see when visitors scan.",
        },
        {
          question: "What happens to the codes when an exhibition closes?",
          answer:
            "Repoint them. Labels that travel with a loaned object can point at the next venue's page, and closed-exhibition codes can open a page about the collection online.",
        },
      ],
      related: ["signs", "posters", "tickets", "books"],
    },
    {
      slug: "events",
      name: "Events and conferences",
      noun: "events and conferences",
      title: "QR codes for events and conferences",
      seoTitle: "QR Codes for Events and Conferences",
      metaDescription:
        "QR codes for events: tickets, agendas that change on the day, badges that share contacts, session feedback and sponsor offers. Sizes for badges and stages.",
      summary:
        "Agendas that change on the day, networking badges and session feedback.",
      intro: [
        "Event schedules change up to the last minute: a speaker's flight is late, a room floods, the keynote overruns. Codes on signs, badges and printed programmes need to point at an agenda you can edit on the day, which rules out static links to a PDF.",
        "Events also have the clearest measure of success of any QR use: how many attendees scanned for the agenda, how many left session feedback, how many visited the sponsor's offer. Separate dynamic codes give organisers and sponsors those numbers.",
      ],
      useCases: [
        {
          title: "A live agenda",
          description:
            "One code on every sign and lanyard opens the current schedule with room changes, so you never reprint the programme.",
        },
        {
          title: "Badges that share contacts",
          description:
            "Print each attendee's vCard Plus code on their badge so others save their details in one scan.",
        },
        {
          title: "Session feedback",
          description:
            "A code on the last slide of every talk opens a two-question form while the audience is still seated.",
        },
        {
          title: "Sponsor offers",
          description:
            "Each sponsor gets its own code and coupon, so you can show them scans when the renewal conversation comes.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "event",
          why: "Date, time, venue map and add-to-calendar buttons for invitations and save-the-date mailings.",
        },
        {
          kind: "page",
          page: "vcard",
          why: "A contact page per attendee or speaker with a Save contact button, linked from the badge.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "Star ratings and comments per session, with responses in the dashboard and CSV export.",
        },
        {
          kind: "static",
          type: "attendance",
          why: "Check people in with a Google Form, free and without building a registration system.",
        },
      ],
      distances: [
        { label: "Name badge, face to face", meters: 0.7 },
        { label: "Session room door sign", meters: 1.5 },
        { label: "Slide on the stage screen", meters: 10 },
      ],
      tips: [
        "Badges flip around on lanyards. Print the code on both sides or use a double clip so it faces out.",
        "On stage screens, leave the code on the slide for at least 30 seconds and make it fill a large part of the slide; the back row is often 15 m or more away.",
        "Wi-Fi at venues is overloaded. Keep linked pages small and avoid autoplaying video.",
        "Use expiry dates or a fallback URL on Pro so post-event scans of the agenda open a recap page instead of a stale schedule.",
      ],
      ctas: [
        "Scan for the live agenda and room changes",
        "Scan my badge to save my contact",
        "Rate this session in 20 seconds",
        "Exclusive offer for attendees",
      ],
      faqs: [
        {
          question: "How big should a QR code on a conference slide be?",
          answer:
            "Bigger than most people make it. From 10 m a short-link code needs to be over a metre wide on screen; the table above uses QRdx's print size formula. If your screen is smaller, keep the code up longer and repeat it at the end.",
        },
        {
          question: "Can I change the agenda link after printing badges?",
          answer:
            "Yes, if the badges use a dynamic code. Edit the destination or the hosted event page and every printed badge, sign and programme follows.",
        },
        {
          question: "What happens to event codes after the event?",
          answer:
            "On Pro you can set an expiry date with a fallback URL, such as the recordings page. Codes never end up on a QRdx advert; expired codes go to your fallback or a neutral 'this campaign has ended' page.",
        },
      ],
      related: ["badges", "tickets", "presentations", "posters"],
      image: "eventCheckIn",
    },
    {
      slug: "weddings",
      name: "Weddings",
      noun: "weddings",
      title: "QR codes for weddings",
      seoTitle: "Wedding QR Codes: RSVPs, Photos and Schedules",
      metaDescription:
        "Wedding QR codes for invitations, RSVPs, the day's schedule, directions, guest photo sharing and gift registries, plus print sizes and wording ideas.",
      summary:
        "RSVPs on the invitation, directions, the day's schedule and photo sharing.",
      intro: [
        "Wedding invitations go out months before the day, and plans change in between: the ceremony time moves, the shuttle gets added, the hotel block fills. A small QR code on the invitation that opens your wedding page keeps every guest up to date without a second mailing.",
        "On the day, codes on welcome signs and tables can share the schedule, the Wi-Fi and a shared photo album, so you get the photos guests take, not just the photographer's.",
      ],
      useCases: [
        {
          title: "RSVP from the invitation",
          description:
            "A code on the RSVP card opens a short form with attendance, meal choice and dietary needs, collected in one list.",
        },
        {
          title: "Directions and travel",
          description:
            "Maps for the ceremony and reception, parking, shuttle times and hotel details on one page.",
        },
        {
          title: "The day's schedule",
          description:
            "A welcome-sign code that opens the timeline, so guests know when the speeches and the last bus are.",
        },
        {
          title: "Guest photo sharing",
          description:
            "Table cards linking to your shared album, such as a Google Drive folder, so guests upload what they shoot.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "event",
          why: "Date, time, venue map and add-to-calendar buttons for the save-the-date.",
        },
        {
          kind: "page",
          page: "feedback",
          why: "An RSVP form with choice fields for attending and meal options, exportable as CSV for the caterer.",
        },
        {
          kind: "static",
          type: "google-drive",
          why: "Opens a shared Drive folder for guests' photos. Set the folder's sharing so guests can upload.",
        },
        {
          kind: "page",
          page: "links",
          why: "One page with the schedule, travel, gift registry and photo album behind the invitation code.",
        },
      ],
      distances: [
        { label: "Invitation or RSVP card", meters: 0.3 },
        { label: "Table card at dinner", meters: 0.5 },
        { label: "Welcome sign", meters: 2 },
      ],
      tips: [
        "Match the code to your stationery colours, but keep it dark on a light background; pale blush or gold codes often fail.",
        "Letterpress, foil and deckled-edge paper soften fine detail. Ask the printer to proof the code on the real stock.",
        "Put a short URL under the code for older guests, and keep a phone number for RSVPs.",
        "Use one code for the invitation and another for the day, so you can change the day-of page without affecting RSVPs.",
      ],
      ctas: [
        "Scan to RSVP by 1 June",
        "Directions, parking and hotels",
        "Share your photos from today",
        "Our gift registry",
      ],
      faqs: [
        {
          question: "Can I add a QR code to printed wedding invitations?",
          answer:
            "Yes. Design it in the playground to match your stationery, download it as SVG or a print-ready PDF, and send it to your printer. Use a dynamic code so you can update the details after the invitations are posted.",
        },
        {
          question: "Will the wedding QR code still work years later?",
          answer:
            "Static codes always work. QRdx dynamic codes keep redirecting on every plan, even if you never pay, so a code on a keepsake invitation keeps opening your page or photo album.",
        },
        {
          question: "How do I collect RSVPs with a QR code?",
          answer:
            "Point the code at a feedback form with fields for name, attending and meal choice, or at the RSVP form your wedding website already has. QRdx forms collect responses in your dashboard with CSV export.",
        },
      ],
      related: ["envelopes", "table-tents", "signs", "direct-mail"],
    },
  ],
};
