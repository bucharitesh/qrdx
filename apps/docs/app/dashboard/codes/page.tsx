import { redirect } from "next/navigation";

// The codes list lives at /dashboard; detail pages are /dashboard/codes/<id>.
export default function CodesIndexPage() {
  redirect("/dashboard");
}
