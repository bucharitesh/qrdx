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
import {
  ArrangeVertical as ArrowUpDown,
  Lock,
  Add as Plus,
  SearchNormal1 as Search,
} from "iconsax-reactjs";
import Link from "next/link";
import { useState } from "react";
import { HairlineFigure } from "@/components/mockups/hairline";
import { UpgradeButton } from "../../team/_components/small-actions";
import type { SavedTheme } from "../_lib/theme";
import { ThemeCard } from "./theme-card";

type SortOption = "default" | "newest" | "oldest" | "name";

interface ThemesManagerProps {
  personalThemes: SavedTheme[];
  teamThemes: SavedTheme[];
  /** Set while a team is the active workspace */
  team: {
    name: string;
    /** Owner or admin of the team */
    canManage: boolean;
    /** The team owner's plan includes team themes */
    themesAllowed: boolean;
    /** Owners can upgrade; other members ask an owner */
    canUpgrade: boolean;
    /** Cheapest plan with team themes, e.g. "Business" */
    planName: string;
  } | null;
}

function sortThemes(themes: SavedTheme[], option: SortOption) {
  return [...themes].sort((a, b) => {
    switch (option) {
      case "name":
        return a.name.localeCompare(b.name);
      case "oldest":
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      case "newest":
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      default:
        return (
          Number(b.isActiveDefault) - Number(a.isActiveDefault) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  });
}

function ThemeGrid({
  themes,
  workspace,
  canCopyToTeam,
}: {
  themes: SavedTheme[];
  workspace: "personal" | "team";
  canCopyToTeam: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {themes.map((theme) => (
        <ThemeCard
          canCopyToTeam={canCopyToTeam}
          key={theme.id}
          theme={theme}
          workspace={workspace}
        />
      ))}
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

export function ThemesManager({
  personalThemes,
  teamThemes,
  team,
}: ThemesManagerProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("default");

  const query = search.trim().toLowerCase();
  const filter = (themes: SavedTheme[]) =>
    sortThemes(
      query
        ? themes.filter((theme) => theme.name.toLowerCase().includes(query))
        : themes,
      sort,
    );
  const shownPersonal = filter(personalThemes);
  const shownTeam = filter(teamThemes);

  const workspace = team ? "team" : "personal";
  const canCopyToTeam = Boolean(team?.canManage && team.themesAllowed);
  const hasAny = personalThemes.length + teamThemes.length > 0;
  const noMatches =
    query !== "" && shownPersonal.length === 0 && shownTeam.length === 0;

  return (
    <div className="space-y-8">
      {hasAny && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
            <Input
              aria-label="Search themes"
              className="pl-8"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search themes..."
              value={search}
            />
          </div>
          <Select
            onValueChange={(value) => setSort(value as SortOption)}
            value={sort}
          >
            <SelectTrigger aria-label="Sort themes" className="w-44 gap-2">
              <ArrowUpDown className="text-muted-foreground size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default first</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {noMatches && (
        <Card className="items-center py-12 text-center">
          <Search className="text-muted-foreground size-10" />
          <div>
            <h3 className="text-lg font-medium">No themes found</h3>
            <p className="text-muted-foreground text-sm text-pretty">
              No themes match &quot;{search.trim()}&quot;.
            </p>
          </div>
        </Card>
      )}

      {team && !noMatches && (
        <section className="space-y-4">
          <SectionHeading
            description={
              team.canManage
                ? `Shared with everyone in ${team.name}. As an owner or admin you can edit them and pick the team default.`
                : `Shared with everyone in ${team.name}. Team owners and admins can edit them.`
            }
            title="Team themes"
          />
          {shownTeam.length > 0 ? (
            <>
              <ThemeGrid
                canCopyToTeam={false}
                themes={shownTeam}
                workspace={workspace}
              />
              {!team.themesAllowed && (
                <p className="text-muted-foreground text-sm">
                  Existing team themes keep working. Adding new ones needs the{" "}
                  {team.planName} plan.
                </p>
              )}
            </>
          ) : query ? null : team.themesAllowed ? (
            <Card className="text-muted-foreground px-6 py-8 text-center text-sm">
              {team.canManage
                ? 'No team themes yet. Use "Copy to team" on one of your themes below to share it.'
                : "No team themes yet. Team owners and admins can share themes here."}
            </Card>
          ) : (
            <Card className="flex-col items-start gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="bg-muted rounded-md p-2">
                  <Lock className="text-muted-foreground size-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-medium">Share themes with your team</p>
                  <p className="text-muted-foreground text-sm text-pretty">
                    Team themes are part of the {team.planName} plan: everyone
                    in {team.name} can pick them in the editor, and the team
                    default applies to new codes.
                    {!team.canUpgrade && " Ask a team owner to upgrade."}
                  </p>
                </div>
              </div>
              {team.canUpgrade && (
                <UpgradeButton size="sm">Upgrade</UpgradeButton>
              )}
            </Card>
          )}
        </section>
      )}

      {!noMatches && (
        <section className="space-y-4">
          {team && (
            <SectionHeading
              description="Only you can see these. They are available in every workspace."
              title="Your themes"
            />
          )}
          {shownPersonal.length > 0 ? (
            <ThemeGrid
              canCopyToTeam={canCopyToTeam}
              themes={shownPersonal}
              workspace={workspace}
            />
          ) : query ? null : (
            <Card className="items-center gap-4 px-6 py-12 text-center">
              <HairlineFigure className="aspect-square w-32" figure="Stack" />
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">No saved themes yet</h3>
                <p className="text-muted-foreground mx-auto max-w-md text-sm text-pretty">
                  Design a QR code in the playground and click Save to keep its
                  colors, patterns and logo here. Set one as default and new
                  codes start from it.
                </p>
              </div>
              <Button asChild>
                <Link href="/playground?tab=customisations">
                  <Plus className="size-4" />
                  Create a theme
                </Link>
              </Button>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
