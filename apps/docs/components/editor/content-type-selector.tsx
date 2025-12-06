"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  AtSign,
  Camera,
  ChevronDown,
  CreditCard,
  DollarSign,
  Image,
  Instagram,
  Link,
  Linkedin,
  type LucideIcon,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Share2,
  Store,
  Twitter,
  UserCircle,
  Video,
  Wifi,
  Youtube,
} from "lucide-react";
import * as React from "react";
import { ContentTypeModal } from "@/components/editor/content-type-modal";
import { useQREditorStore } from "@/store/editor-store";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";

// Map icon names to actual icon components
const iconMap: Record<string, LucideIcon> = {
  AtSign,
  Camera,
  CreditCard,
  DollarSign,
  Image,
  Instagram,
  Link,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Share2,
  Store,
  Twitter,
  UserCircle,
  Video,
  Wifi,
  Youtube,
};

export function ContentTypeSelector() {
  const { contentType } = useQREditorStore();
  const [modalOpen, setModalOpen] = React.useState(false);

  const currentType = CONTENT_TYPES_METADATA.find(
    (m) => m.type === contentType,
  );
  const Icon =
    (currentType ? iconMap[currentType.icon] : iconMap.Link) || iconMap.Link;

  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-between h-auto py-3"
        onClick={() => setModalOpen(true)}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium">
              {currentType?.label || "Select Type"}
            </div>
            <div className="text-muted-foreground text-xs">
              {currentType?.description || "Choose a QR code type"}
            </div>
          </div>
        </div>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>

      <ContentTypeModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
