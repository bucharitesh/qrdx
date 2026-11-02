"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Add } from "iconsax-reactjs";
import { useCreate } from "@/components/app-shell/create-actions";

/** Home's primary action: the same new-code dialog as Create in the top bar. */
export function NewCodeButton() {
  const create = useCreate();
  return (
    <Button onClick={() => create("code")}>
      <Add aria-hidden />
      New dynamic code
    </Button>
  );
}
