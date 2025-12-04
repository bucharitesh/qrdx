"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { ArrowUpDown, Palette, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQRThemes } from "@/lib/hooks/use-qr-themes";
import { QRThemeCard } from "./qr-theme-card";

interface ThemesListProps {
  themes: Array<{
    id: string;
    name: string;
    style: {
      bgColor?: string;
      fgColor?: string;
      eyeColor?: string;
      dotColor?: string;
      bodyPattern?: string;
      cornerEyePattern?: string;
      cornerEyeDotPattern?: string;
      level?: string;
      templateId?: string;
      showLogo?: boolean;
      customLogo?: string;
    };
    createdAt: Date | string;
  }>;
}

export function ThemesList({ themes: initialThemes }: ThemesListProps) {
  // Use React Query to fetch themes so it updates when cache is invalidated
  const { data: themes = initialThemes, isLoading } = useQRThemes();
  const [filteredThemes, setFilteredThemes] = useState(themes || []);

  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("newest");
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!themes) return;

    const filtered = themes.filter((theme) =>
      theme.name?.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    // Sort based on selected option
    const sorted = [...filtered].sort((a, b) => {
      const dateA =
        a.createdAt instanceof Date
          ? a.createdAt.getTime()
          : new Date(a.createdAt).getTime();
      const dateB =
        b.createdAt instanceof Date
          ? b.createdAt.getTime()
          : new Date(b.createdAt).getTime();

      switch (sortOption) {
        case "newest":
          return (dateB || 0) - (dateA || 0);
        case "oldest":
          return (dateA || 0) - (dateB || 0);
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        default:
          return 0;
      }
    });

    setFilteredThemes(sorted);
  }, [themes, searchTerm, sortOption]);

  // Show empty state if no themes at all (not just filtered)
  if (!isLoading && (!themes || themes.length === 0)) {
    return (
      <Card className="flex flex-col items-center justify-center p-4 py-12 text-center">
        <div className="bg-primary/10 mb-6 rounded-full p-4">
          <Palette className="text-primary size-12" />
        </div>
        <h2 className="mb-2 text-xl font-semibold md:text-2xl">
          No themes created yet
        </h2>
        <p className="text-muted-foreground mb-6 max-w-md text-pretty">
          Create your first custom theme to personalize your projects with
          unique color palettes.
        </p>
        <div className="w-full max-w-md">
          <Link href="/editor/qr">
            <Button size="lg" className="w-full gap-2">
              <Plus className="size-4" />
              Create Your First QR Theme
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="ml-auto flex w-fit flex-row gap-2">
        <div className="relative w-fit">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            placeholder="Search themes..."
            className="w-full pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={sortOption} onValueChange={setSortOption}>
          <SelectTrigger className="w-[80px] gap-2 md:w-[180px]">
            <ArrowUpDown className="text-muted-foreground h-4 w-4" />
            {!isMobile && <SelectValue placeholder="Sort by" />}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="space-y-4 p-4">
        {isLoading ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">Loading themes...</p>
          </div>
        ) : filteredThemes.length === 0 && searchTerm ? (
          <div className="py-12 text-center">
            <Search className="text-muted-foreground mx-auto mb-4 size-12" />
            <h3 className="mb-1 text-lg font-medium">No themes found</h3>
            <p className="text-muted-foreground text-pretty">
              No themes match your search term &quot;{searchTerm}&quot;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredThemes.map((theme) => (
              <QRThemeCard key={theme.id} theme={theme} />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
