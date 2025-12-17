import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col dark:bg-neutral-950">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
