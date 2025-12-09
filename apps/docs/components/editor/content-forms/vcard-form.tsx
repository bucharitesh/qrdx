"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { VCardContent } from "@/types/qr-content";
import { encodeVCard } from "@/utils/qr-content-encoder";

export function VCardForm() {
  const { setValue } = useQREditorStore();
  const [vcardData, setVcardData] = React.useState<Omit<VCardContent, "type">>({
    firstName: "",
    lastName: "",
    organization: "",
    phone: "",
    email: "",
    url: "",
    address: "",
    note: "",
  });

  React.useEffect(() => {
    const encoded = encodeVCard({ type: "vcard", ...vcardData });
    setValue(encoded);
  }, [vcardData, setValue]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="vcard-firstname">
            First Name *
          </Label>
          <Input
            id="vcard-firstname"
            type="text"
            placeholder="John"
            value={vcardData.firstName}
            onChange={(e) =>
              setVcardData({ ...vcardData, firstName: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="vcard-lastname">
            Last Name
          </Label>
          <Input
            id="vcard-lastname"
            type="text"
            placeholder="Doe"
            value={vcardData.lastName}
            onChange={(e) =>
              setVcardData({ ...vcardData, lastName: e.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="vcard-organization">
          Organization
        </Label>
        <Input
          id="vcard-organization"
          type="text"
          placeholder="Company Name"
          value={vcardData.organization}
          onChange={(e) =>
            setVcardData({ ...vcardData, organization: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="vcard-phone">
          Phone
        </Label>
        <Input
          id="vcard-phone"
          type="tel"
          placeholder="+1234567890"
          value={vcardData.phone}
          onChange={(e) =>
            setVcardData({ ...vcardData, phone: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="vcard-email">
          Email
        </Label>
        <Input
          id="vcard-email"
          type="email"
          placeholder="john@example.com"
          value={vcardData.email}
          onChange={(e) =>
            setVcardData({ ...vcardData, email: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="vcard-url">
          Website
        </Label>
        <Input
          id="vcard-url"
          type="url"
          placeholder="https://example.com"
          value={vcardData.url}
          onChange={(e) => setVcardData({ ...vcardData, url: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="vcard-address">
          Address
        </Label>
        <Input
          id="vcard-address"
          type="text"
          placeholder="123 Main St, City, Country"
          value={vcardData.address}
          onChange={(e) =>
            setVcardData({ ...vcardData, address: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="vcard-note">
          Note
        </Label>
        <Textarea
          id="vcard-note"
          placeholder="Additional notes"
          value={vcardData.note}
          onChange={(e) => setVcardData({ ...vcardData, note: e.target.value })}
          rows={3}
          className="resize-none"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will save this contact to the device
      </p>
    </div>
  );
}


