import type { SeoGroup } from "../types";

export const screens: SeoGroup = {
  id: "screens",
  title: "Screens and digital",
  description:
    "Emails, slide decks, TV and video, where the code moves people to their phone.",
  items: [
    {
      slug: "emails",
      name: "Emails",
      noun: "emails",
      title: "QR codes in emails",
      seoTitle: "QR Codes in Emails and Newsletters",
      metaDescription:
        "When QR codes in emails make sense: desktop-to-phone handoffs, app downloads, event check-in and Wi-Fi, plus image sizing, alt text and email client tips.",
      summary: "Desktop-to-phone handoffs, app installs and event check-in.",
      intro: [
        "In an email, a link is usually better than a QR code: the reader can just tap it. QR codes earn their place when the reader is on a desktop and the action happens on the phone, such as installing an app, adding a pass, joining Wi-Fi or showing a code at an event.",
        "Email clients block images by default, scale them unpredictably and strip some formats, so treat the code as a convenience next to a normal link, never as the only way in.",
      ],
      useCases: [
        {
          title: "Install the app",
          description:
            "A desktop reader scans the code with their phone to open the right app store.",
        },
        {
          title: "Event confirmation",
          description:
            "A code that opens the event page or venue map on the phone people bring to the event. Entry tickets still come from your ticketing system.",
        },
        {
          title: "Wi-Fi for guests",
          description:
            "Hotel or co-working welcome emails with a Wi-Fi code to scan from the laptop screen.",
        },
        {
          title: "Continue on mobile",
          description:
            "Hand off a sign-up or verification step that works better on a phone.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "apps",
          why: "Opens the App Store or Google Play depending on the phone that scans it.",
        },
        {
          kind: "static",
          type: "wifi",
          why: "Lets guests join the network by scanning the email on their laptop.",
        },
        {
          kind: "page",
          page: "event",
          why: "The event details, map and calendar buttons on the phone they'll carry.",
        },
      ],
      distances: [
        { label: "Laptop screen", meters: 0.5 },
        { label: "Desktop monitor", meters: 0.7 },
      ],
      tips: [
        "Embed the code as a PNG at 2× its display size (for example 400 px displayed at 200 px) so it stays sharp on high-density screens.",
        "Always add alt text and a normal link next to the code, for blocked images and mobile readers.",
        "Avoid SVG in email: many clients don't render it.",
        "On a screen, a code about 6 to 8 cm wide on screen scans comfortably from a laptop.",
      ],
      ctas: [
        "On your computer? Scan to get the app",
        "Scan to join the Wi-Fi",
        "Your event details on your phone",
        "Continue on your phone",
      ],
      faqs: [
        {
          question: "Should I put a QR code in a marketing email?",
          answer:
            "Only when the action belongs on the phone and many readers are on desktop. Otherwise a button converts better, because mobile readers can't scan their own screen.",
        },
        {
          question: "What format should an email QR code be?",
          answer:
            "PNG, at twice the display size, with alt text. SVG and some CSS tricks don't render in many email clients.",
        },
        {
          question: "Can I track scans from an email QR code?",
          answer:
            "Yes, with a dynamic code. Use a separate code from your print campaigns so the email's scans are counted on their own.",
        },
      ],
      related: ["hotels", "events", "banks", "marketing-agencies"],
    },
    {
      slug: "presentations",
      name: "Presentations",
      noun: "presentations",
      title: "QR codes in presentations",
      seoTitle: "QR Codes on Slides: Size, Timing and Placement",
      metaDescription:
        "QR codes in presentations and slide decks: how big on screen for the back row, how long to show them, and what to link to, from slides to feedback forms.",
      summary: "Back-row sizing, how long to show it and what to link to.",
      intro: [
        "The QR code on the last slide is the most common call to action at conferences and in classrooms, and the most commonly too small. A code that looks fine on your laptop can be unscannable from row 20.",
        "Size the code for the back of the room, leave it up long enough, and point it at something worth scanning: the slides, the resources or a two-question feedback form.",
      ],
      useCases: [
        {
          title: "Get the slides",
          description:
            "A code that opens your slides or resources, so the audience stops photographing every slide.",
        },
        {
          title: "Session feedback",
          description:
            "A two-question form on the last slide while the audience is still seated.",
        },
        {
          title: "Connect with the speaker",
          description:
            "A vCard Plus or LinkedIn code for networking after the talk.",
        },
        {
          title: "Live polls and Q&A",
          description:
            "A code that opens your polling or Q&A tool for the session.",
        },
      ],
      recommended: [
        {
          kind: "page",
          page: "feedback",
          why: "A short session feedback form with star ratings and a comment.",
        },
        {
          kind: "page",
          page: "vcard",
          why: "Your contact card with photo and socials, for networking after the talk.",
        },
        {
          kind: "page",
          page: "pdf",
          why: "The slide deck as a PDF, replaceable with the corrected version after the talk.",
        },
      ],
      distances: [
        { label: "Meeting room screen", meters: 4 },
        { label: "Lecture hall, middle rows", meters: 10 },
        { label: "Conference hall, back rows", meters: 20 },
      ],
      tips: [
        "Make the code fill much of the slide height: from 10 m it needs to be over a metre wide on screen.",
        "Leave it up for at least 30 seconds, and put it on the first and the last slide.",
        "Keep a white quiet zone around the code; dark slide templates need a white box behind it.",
        "Use a short link so the code has fewer, larger modules on projectors with low resolution.",
      ],
      ctas: [
        "Scan for the slides and resources",
        "Rate this talk in 20 seconds",
        "Let's connect",
        "Ask a question",
      ],
      faqs: [
        {
          question: "How big should a QR code be on a slide?",
          answer:
            "Big enough for the back row: about a tenth of the distance, a bit more for a short link. From 10 m, over a metre on screen; in a small room, 40 to 50 cm.",
        },
        {
          question: "How long should I show a QR code in a presentation?",
          answer:
            "At least 30 seconds, and repeat it at the end. People need time to unlock their phone and open the camera.",
        },
        {
          question: "Can I update the link after the talk?",
          answer:
            "Yes, with a dynamic code. Point it at the recording once it's online; people who scanned during the talk can come back later.",
        },
      ],
      related: ["events", "education", "law-firms", "marketing-agencies"],
    },
    {
      slug: "tv-and-video",
      name: "TV and video",
      noun: "TV and video",
      title: "QR codes on TV and in video",
      seoTitle: "QR Codes on TV Ads, Streams and Video",
      metaDescription:
        "QR codes on TV ads, live streams and YouTube videos: on-screen size, how long to show them, where to place them and how to measure response per channel.",
      summary:
        "On-screen size, timing and per-channel tracking for TV and video.",
      intro: [
        "TV is watched from the sofa with a phone in hand, which makes it one of the easiest places to scan from. A code in a TV ad, a live stream or a YouTube video turns a viewer into a visitor without them typing a URL they'll forget.",
        "Response comes in a spike while the code is on screen, so timing and size matter more than anywhere else. And because the same ad runs on several channels or streams, separate dynamic codes tell you which one worked.",
      ],
      useCases: [
        {
          title: "TV ads",
          description:
            "An offer or app download with a code that stays on screen long enough to scan.",
        },
        {
          title: "Live streams",
          description:
            "A corner code that opens the product, donation page or merch store during the stream.",
        },
        {
          title: "YouTube and recorded video",
          description:
            "An on-screen code for viewers watching on a TV, where clickable links don't work.",
        },
        {
          title: "Shows and broadcasts",
          description:
            "Polls, recipes and competitions from a programme, linked to a page for that episode.",
        },
      ],
      recommended: [
        {
          kind: "dynamic",
          label: "Dynamic code per channel or stream",
          why: "Compare response across channels and air times, and change the destination after the campaign.",
        },
        {
          kind: "page",
          page: "apps",
          why: "App install ads with one code for both stores.",
        },
        {
          kind: "page",
          page: "coupon",
          why: "A viewer offer with a code and validity dates.",
        },
      ],
      distances: [
        { label: "Laptop or tablet", meters: 0.6 },
        { label: "TV from the sofa", meters: 3 },
      ],
      tips: [
        "Keep the code on screen for at least 10 to 15 seconds in an ad, longer in programmes.",
        "The 10:1 rule gives about 35 cm on screen for a sofa 3 m away, about half the height of a 55-inch TV. Phones often read smaller codes in good conditions, so test on a real TV before going smaller.",
        "Place it away from the edges: TV overscan and streaming overlays can crop the corners.",
        "Avoid motion or transitions over the code while it's on screen; a still frame scans best.",
      ],
      ctas: [
        "Scan now for 20% off",
        "Scan to get the app",
        "Scan to vote",
        "Recipe from this episode",
      ],
      faqs: [
        {
          question: "How long should a QR code be on screen in a TV ad?",
          answer:
            "Long enough to unlock a phone and open the camera: aim for at least 10 to 15 seconds, and show it early as well as at the end.",
        },
        {
          question: "How big should a QR code be on TV?",
          answer:
            "From a sofa 3 m away, about 35 cm on screen with a short link. On smaller screens or with longer links, bigger.",
        },
        {
          question: "How do I measure TV ad response with QR codes?",
          answer:
            "Use a separate dynamic code per channel, station or stream. Every scan is timestamped per code, so you can match spikes to air times.",
        },
      ],
      related: ["marketing-agencies", "retail", "nonprofits", "events"],
    },
  ],
};
