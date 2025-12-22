import { Icons } from "@/components/icons";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Icons.Loader className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}
