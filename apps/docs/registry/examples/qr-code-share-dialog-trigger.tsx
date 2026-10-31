import { QrCode } from "lucide-react";
import { QrCodeShareDialog } from "@/registry/qrdx/qr-code-share-dialog";
import { Button } from "@/registry/ui/button";

export default function QrCodeShareDialogTrigger() {
  return (
    <QrCodeShareDialog
      description="Scan the code to open the invite on your phone."
      filename="team-invite"
      qr={{
        fgColor: "#155DFC",
        bodyPattern: "rounded",
        cornerEyePattern: "extra-rounded",
      }}
      title="Invite your team"
      url="https://qrdx.dev/invite/7f3a9c"
    >
      <Button aria-label="Show QR code" size="icon" variant="outline">
        <QrCode aria-hidden="true" />
      </Button>
    </QrCodeShareDialog>
  );
}
