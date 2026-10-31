import { Spinner } from "@repo/design-system/components/icons";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}
