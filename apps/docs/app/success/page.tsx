import { Button } from "@repo/design-system/components/ui/button";
import { CheckCircle } from "lucide-react";
import Link from "next/link";

export default function SuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="mx-auto max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Welcome to Pro! 🎉</h1>
          <p className="text-muted-foreground">
            Your subscription is now active. Enjoy unlimited QR themes and all Pro features!
          </p>
        </div>
        <div className="flex flex-col gap-3 pt-4">
          <Button asChild size="lg">
            <Link href="/editor/qr">Start Creating</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/settings">Manage Subscription</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}








