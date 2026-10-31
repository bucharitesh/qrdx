import { VCardQrCode } from "@/registry/qrdx/vcard-qr-code";

export default function VCardQrCodeDemo() {
  return (
    <VCardQrCode
      contact={{
        firstName: "Ada",
        lastName: "Lovelace",
        title: "Engineer",
        organization: "Analytical Engines",
        email: "ada@example.com",
        phone: "+44 20 7946 0000",
        url: "https://example.com",
      }}
    />
  );
}
