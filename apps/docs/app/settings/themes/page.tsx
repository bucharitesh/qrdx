import { permanentRedirect } from "next/navigation";

// Saved themes moved to the workspace (Dashboard → Themes).
export default function LegacyThemesPage() {
  permanentRedirect("/dashboard/themes");
}
