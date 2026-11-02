import { Book1, type Icon, Lifebuoy, Sms, Star } from "iconsax-reactjs";

/** The Help menu and the ⌘K "Help" group. */
export interface HelpLink {
  id: "docs" | "help" | "changelog" | "support";
  label: string;
  href: string;
  icon: Icon;
  keywords: string[];
}

export const HELP_LINKS: readonly HelpLink[] = [
  {
    id: "docs",
    label: "Docs",
    href: "/docs",
    icon: Book1,
    keywords: ["documentation", "guides", "api reference"],
  },
  {
    id: "help",
    label: "Help center",
    href: "/docs/help",
    icon: Lifebuoy,
    keywords: ["faq", "how to", "questions"],
  },
  {
    id: "changelog",
    label: "What's new",
    href: "/changelogs",
    icon: Star,
    keywords: ["changelog", "releases", "updates"],
  },
  {
    id: "support",
    label: "Contact support",
    href: "/docs/help/contact",
    icon: Sms,
    keywords: ["email", "bug", "problem"],
  },
];
