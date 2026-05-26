import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { OAuthAuthorizeContent } from "./oauth-authorize-content";

export default function OAuthAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-background">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <OAuthAuthorizeContent />
    </Suspense>
  );
}
