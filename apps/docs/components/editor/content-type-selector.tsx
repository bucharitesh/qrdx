"use client";

import { Button } from "@repo/design-system/components/ui/button";
import * as React from "react";
import { ContentTypeModal } from "@/components/editor/content-type-modal";
import { useQREditorStore } from "@/store/editor-store";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";
import { LucideIcon } from "lucide-react";
import { Icons } from "../icons";

// Map icon names to actual icon components
const iconMap: Record<string, LucideIcon> = {
  AtSign: Icons.AtSign,
  Bitcoin: Icons.Bitcoin,
  Calendar: Icons.Calendar,
  Camera: Icons.Camera,
  ClipboardCheck: Icons.ClipboardCheck,
  CreditCard: Icons.CreditCard,
  DollarSign: Icons.DollarSign,
  FileText: Icons.FileText,
  Hexagon: Icons.Hexagon,
  Image: Icons.Image,
  Instagram: Icons.Instagram,
  Link: Icons.Link,
  Link2: Icons.Link2,
  Linkedin: Icons.Linkedin,
  Mail: Icons.Mail,
  MapPin: Icons.MapPin,
  MessageCircle: Icons.MessageCircle,
  MessageSquare: Icons.MessageSquare,
  Music: Icons.Music,
  Phone: Icons.Phone,
  Share2: Icons.Share2,
  ShoppingBag: Icons.ShoppingBag,
  ShoppingCart: Icons.ShoppingCart,
  Store: Icons.Store,
  Star: Icons.Star,
  Twitter: Icons.Twitter,
  UserCircle: Icons.UserCircle,
  Video: Icons.Video,
  Wifi: Icons.Wifi,
  Wrench: Icons.Wrench,
  Youtube: Icons.Youtube,
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
        <Icons.ChevronDown className="size-4 text-muted-foreground" />
      </Button>

      <ContentTypeModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
