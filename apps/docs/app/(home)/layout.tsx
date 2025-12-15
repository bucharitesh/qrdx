import { HomeLayout } from "fumadocs-ui/layouts/home";
import { BookIcon, CreditCard, QrCodeIcon, Sparkles } from "lucide-react";
import { baseOptions, linkItems } from "@/lib/layout.shared";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <HomeLayout
      {...baseOptions()}
      links={[
        {
          icon: <BookIcon />,
          text: "Documentation",
          url: "/docs",
          secondary: false,
        },
        {
          icon: <QrCodeIcon />,
          text: "Playground",
          url: "/playground",
          secondary: false,
        },
        {
          icon: <CreditCard />,
          text: "Pricing",
          url: "/pricing",
          secondary: false,
        },
        {
          icon: <Sparkles />,
          text: "AI",
          url: "/ai",
          secondary: false,
        },
        ...linkItems,
      ]}
      className="dark:bg-neutral-950 dark:[--color-fd-background:var(--color-neutral-950)] [--color-fd-primary:var(--color-brand)]"
    >
      {children}
    </HomeLayout>
  );
}
