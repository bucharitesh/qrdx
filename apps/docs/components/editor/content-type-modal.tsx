/** biome-ignore-all lint/suspicious/noArrayIndexKey: needed for list rendering */
"use client";

import { Input } from "@repo/design-system/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { cn } from "@repo/design-system/lib/utils";
import {
  Link,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Search,
  Sparkles,
  Store,
  UserCircle,
  Wifi,
} from "lucide-react";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { ContentType } from "@/types/qr-content";
import {
  CONTENT_CATEGORIES,
  CONTENT_TYPES_METADATA,
  FOR_YOU_SECTIONS,
} from "@/types/qr-content";

// Map icon names to actual icon components
const iconMap = {
  Link,
  Mail,
  Phone,
  MessageSquare,
  MessageCircle,
  Wifi,
  UserCircle,
  MapPin,
  Store,
  Sparkles,
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
                      {activeCategory === "for-you" && (
                        <>
                          {FOR_YOU_SECTIONS.map((section) => (
                            <section key={section.id}>
                              <h3 className="mb-3 text-base font-bold md:mb-4 md:text-sm md:font-semibold">
                                {section.title}
                              </h3>
                              <div className="relative -mx-4 md:mx-0">
                                <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide md:gap-4 md:px-0">
                                  {getContentByCategory(section.types).map(
                                    (meta, index) => {
                                      const Icon =
                                        iconMap[
                                          meta.icon as keyof typeof iconMap
                                        ];
                                      const isActive =
                                        contentType === meta.type;

                                      return (
                                        <button
                                          key={index}
                                          onClick={() =>
                                            handleSelectType(meta.type)
                                          }
                                          type="button"
                                          className={cn(
                                            "group relative flex w-[140px] shrink-0 flex-col gap-2 overflow-hidden rounded-xl bg-muted/30 transition-all hover:bg-accent md:w-[180px] md:flex-col md:items-center md:gap-3 md:bg-muted/20 md:p-6",
                                            isActive &&
                                              "bg-primary/5 md:bg-primary/5",
                                          )}
                                        >
                                          <div
                                            className={cn(
                                              "bg-gradient-to-br from-primary/20 to-primary/5 flex aspect-[4/3] w-full items-center justify-center rounded-t-xl transition-all md:aspect-auto md:size-16 md:shrink-0 md:rounded-2xl",
                                              isActive && "md:scale-105",
                                            )}
                                          >
                                            <Icon
                                              className={cn(
                                                "text-primary/60 size-10 md:size-8",
                                                isActive && "text-primary",
                                              )}
                                            />
                                          </div>
                                          <div className="space-y-0.5 px-3 pb-3 text-left md:space-y-1 md:p-0 md:text-center">
                                            <div className="text-sm font-medium">
                                              {meta.label}
                                            </div>
                                            <div className="text-muted-foreground hidden text-xs md:block">
                                              {meta.description}
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                            </section>
                          ))}
                        </>
                      )}

                      {/* Other categories - show only relevant content */}
                      {activeCategory !== "for-you" && (
                        <section>
                          <div className="relative -mx-4 md:mx-0">
                            <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide md:gap-4 md:px-0">
                              {getContentByCategory(
                                CONTENT_CATEGORIES.find(
                                  (cat) => cat.id === activeCategory,
                                )?.types || [],
                              ).map((meta, index) => {
                                const Icon =
                                  iconMap[meta.icon as keyof typeof iconMap];
                                const isActive = contentType === meta.type;

                                return (
                                  <button
                                    key={index}
                                    onClick={() => handleSelectType(meta.type)}
                                    type="button"
                                    className={cn(
                                      "group relative flex w-[140px] shrink-0 flex-col gap-2 overflow-hidden rounded-xl border bg-muted/30 transition-all hover:border-primary hover:bg-accent md:w-[180px] md:gap-3 md:border md:bg-transparent md:p-6",
                                      isActive
                                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                        : "border-border",
                                    )}
                                  >
                                    {/* Preview Area - Mobile optimized */}
                                    <div
                                      className={cn(
                                        "bg-gradient-to-br from-primary/20 to-primary/5 flex aspect-[4/3] w-full items-center justify-center rounded-t-xl transition-all md:aspect-auto md:size-16 md:shrink-0 md:rounded-2xl",
                                        isActive && "md:scale-110",
                                      )}
                                    >
                                      <Icon
                                        className={cn(
                                          "text-primary/60 size-10 md:size-8",
                                          isActive && "text-primary",
                                        )}
                                      />
                                    </div>
                                    <div className="space-y-0.5 px-3 pb-3 md:space-y-1 md:p-0 md:text-center">
                                      <div className="text-sm font-medium">
                                        {meta.label}
                                      </div>
                                      <div className="text-muted-foreground hidden text-xs md:block">
                                        {meta.description}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
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
                          const Icon =
                            iconMap[meta.icon as keyof typeof iconMap];
                          const isActive = contentType === meta.type;

                          return (
                            <button
                              key={index}
                              onClick={() => handleSelectType(meta.type)}
                              type="button"
                              className={cn(
                                "group relative flex flex-col items-center gap-3 overflow-hidden rounded-xl border p-6 text-center transition-all hover:border-primary hover:bg-accent",
                                isActive
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-border",
                              )}
                            >
                              <div
                                className={cn(
                                  "bg-muted flex size-16 items-center justify-center rounded-2xl transition-all",
                                  isActive && "bg-primary/10 scale-110",
                                )}
                              >
                                <Icon
                                  className={cn(
                                    "text-muted-foreground size-8",
                                    isActive && "text-primary",
                                  )}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-sm font-medium">
                                  {meta.label}
                                </div>
                                <div className="text-muted-foreground text-xs">
                                  {meta.description}
                                </div>
                              </div>
                            </button>
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
