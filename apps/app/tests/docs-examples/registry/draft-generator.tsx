import { QrCodeGenerator } from "@/registry/qrdx/qr-code-generator";

export function DraftGenerator({
  saveDraft,
}: {
  saveDraft: (draft: { value: string; style: object }) => void;
}) {
  return (
    <QrCodeGenerator
      onChange={({ value, preset }) =>
        saveDraft({ value, style: preset.style })
      }
    />
  );
}
