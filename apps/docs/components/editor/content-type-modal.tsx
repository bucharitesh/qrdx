/** biome-ignore-all lint/suspicious/noArrayIndexKey: needed for list rendering */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { cn } from "@repo/design-system/lib/utils";
import {
  AtSign,
  Camera,
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
  Search,
  Share2,
  Sparkles,
  Store,
  Twitter,
  UserCircle,
  Video,
  Wifi,
  Youtube,
} from "lucide-react";
import * as React from "react";
import { Carousel, CarouselItem } from "@/components/carousel";
import { ContentTypeCard } from "@/components/editor/content-type-card";
import { useQREditorStore } from "@/store/editor-store";
import type { ContentType } from "@/types/qr-content";
import {
  CONTENT_CATEGORIES,
  CONTENT_TYPES_METADATA,
  FOR_YOU_SECTIONS,
} from "@/types/qr-content";

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
  Sparkles,
  Store,
  Twitter,
  UserCircle,
  Video,
  Wifi,
  Youtube,
};

interface ContentTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContentTypeModal({
  open,
  onOpenChange,
}: ContentTypeModalProps) {
  const { contentType, setContentType } = useQREditorStore();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("for-you");

  const handleSelectType = (type: ContentType) => {
    setContentType(type);
    onOpenChange(false);
  };

  const filteredContent = CONTENT_TYPES_METADATA.filter(
    (meta) =>
      meta.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meta.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getContentByCategory = (category: ContentType[]) => {
    return CONTENT_TYPES_METADATA.filter((meta) =>
      category.includes(meta.type),
    );
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        closeButtonClassName="hidden md:flex"
        className="gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <div className="flex h-[80vh] flex-col md:h-[70vh]">
          {/* Header - Desktop only */}
          <div className="hidden md:block">
            <div className="flex items-center">
              {/* Left: Title (same width as sidebar) */}
              <div className="w-64 shrink-0 px-6 py-6">
                <ResponsiveDialogTitle className="text-md font-bold">
                  QR Content Categories
                </ResponsiveDialogTitle>
              </div>
              {/* Right: Search bar (aligns with content) */}
              <div className="flex-1 px-2">
                <div className="relative w-full">
                  <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                  <Input
                    placeholder="What would you like to create?"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Search - Mobile only */}
          <div className="px-4 py-3 md:hidden">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                placeholder="What would you like to create?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Category Pills - Mobile horizontal scroll */}
          <div className="md:hidden">
            <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
              {CONTENT_CATEGORIES.map((category) => {
                const Icon = category.icon
                  ? iconMap[category.icon as keyof typeof iconMap]
                  : null;
                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setActiveCategory(category.id);
                      setSearchQuery("");
                    }}
                    type="button"
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                      activeCategory === category.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {Icon && <Icon className="size-4" />}
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Content - Split Layout */}
          <div className="flex min-h-0 flex-1">
            {/* Left Sidebar - Categories - Desktop only */}
            <div className="hidden w-64 shrink-0 md:block">
              <ScrollArea className="h-full">
                <div className="space-y-1 p-4">
                  {CONTENT_CATEGORIES.map((category) => {
                    const Icon = category.icon
                      ? iconMap[category.icon as keyof typeof iconMap]
                      : null;
                    return (
                      <button
                        key={category.id}
                        onClick={() => {
                          setActiveCategory(category.id);
                          setSearchQuery("");
                        }}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm transition-colors",
                          activeCategory === category.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {Icon && <Icon className="size-4" />}
                        {category.label}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Right Content - Scrollable Rows */}
            <div className="flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-6 p-4 md:space-y-8">
                  {searchQuery === "" ? (
                    <>
                      {activeCategory === "for-you" &&
                        FOR_YOU_SECTIONS.map((section) => {
                          return (
                            <section key={section.id}>
                              <h2 className="mb-3 text-xl font-bold md:mb-4">
                                {section.title}
                              </h2>
                              <div className="relative w-full">
                                <Carousel
                                  opts={{
                                    align: "start",
                                    slidesToScroll: 3,
                                    loop: false,
                                  }}
                                  className="w-full"
                                >
                                  {getContentByCategory(section.types).map(
                                    (meta, index) => {
                                      const Icon = iconMap[
                                        meta.icon
                                      ] as LucideIcon;

                                      return (
                                        <CarouselItem
                                          key={index}
                                          className="basis-1/2 md:basis-1/4 pl-2 md:pl-4"
                                        >
                                          <div
                                            onClick={() =>
                                              handleSelectType(meta.type)
                                            }
                                            className="space-y-3 cursor-pointer"
                                          >
                                            <Card>
                                              <CardContent className="flex aspect-video items-center justify-center p-0">
                                                <div className="rounded-full p-3 md:p-4">
                                                  <Icon className="size-6 md:size-8" />
                                                </div>
                                              </CardContent>
                                            </Card>
                                            <div className="text-start">
                                              <h6 className="text-xs font-medium text-muted-foreground">
                                                {meta.label}
                                              </h6>
                                            </div>
                                          </div>
                                        </CarouselItem>
                                      );
                                    },
                                  )}
                                </Carousel>
                              </div>
                            </section>
                          );
                        })}

                      {/* Other categories - show only relevant content */}
                      {activeCategory !== "for-you" && (
                        <section>
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                            {getContentByCategory(
                              CONTENT_CATEGORIES.find(
                                (cat) => cat.id === activeCategory,
                              )?.types || [],
                            ).map((meta, index) => {
                              const Icon = iconMap[meta.icon] as LucideIcon;
                              const isActive = contentType === meta.type;

                              return (
                                <ContentTypeCard
                                  key={index}
                                  label={meta.label}
                                  description={meta.description}
                                  icon={Icon}
                                  isActive={isActive}
                                  onClick={() => handleSelectType(meta.type)}
                                  variant="default"
                                />
                              );
                            })}
                          </div>
                        </section>
                      )}
                    </>
                  ) : (
                    // Search results
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold">
                        {filteredContent.length} result
                        {filteredContent.length !== 1 ? "s" : ""}
                      </h3>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                        {filteredContent.map((meta, index) => {
                          const Icon = iconMap[meta.icon] as LucideIcon;
                          const isActive = contentType === meta.type;

                          return (
                            <ContentTypeCard
                              key={index}
                              label={meta.label}
                              description={meta.description}
                              icon={Icon}
                              isActive={isActive}
                              onClick={() => handleSelectType(meta.type)}
                              variant="default"
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
