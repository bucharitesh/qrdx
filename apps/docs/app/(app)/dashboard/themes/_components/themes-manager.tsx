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
import { useTranslations } from "next-intl";
import { useState } from "react";
import { HairlineFigure } from "@/components/mockups/hairline";
import { playgroundHref } from "@/lib/playground-links";
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
    /** A viewer or billing member here: shared themes are view-only */
    readOnly?: boolean;
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
  const t = useTranslations("app.dashboard.themes.themesManager");
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
              aria-label={t("searchThemes")}
              className="pl-8"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchThemes2")}
              value={search}
            />
          </div>
          <Select
            onValueChange={(value) => setSort(value as SortOption)}
            value={sort}
          >
            <SelectTrigger aria-label={t("sortThemes")} className="w-44 gap-2">
              <ArrowUpDown className="text-muted-foreground size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("defaultFirst")}</SelectItem>
              <SelectItem value="newest">{t("newestFirst")}</SelectItem>
              <SelectItem value="oldest">{t("oldestFirst")}</SelectItem>
              <SelectItem value="name">{t("nameAZ")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {noMatches && (
        <Card className="items-center py-12 text-center">
          <Search className="text-muted-foreground size-10" />
          <div>
            <h3 className="text-lg font-medium">{t("noThemesFound")}</h3>
            <p className="text-muted-foreground text-sm text-pretty">
              {t("noThemesMatchSearch", { search: search.trim() })}
            </p>
          </div>
        </Card>
      )}

      {team && !noMatches && (
        <section className="space-y-4">
          <SectionHeading
            description={
              team.canManage
                ? t("sharedWithEveryoneInName", { name: team.name })
                : team.readOnly
                  ? t("sharedWithEveryoneInName2", { name: team.name })
                  : t("sharedWithEveryoneInName3", { name: team.name })
            }
            title={t("sharedThemes")}
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
                  {t("existingSharedThemesKeepWorking", {
                    planName: team.planName,
                  })}
                </p>
              )}
            </>
          ) : query ? null : team.themesAllowed ? (
            <Card className="text-muted-foreground px-6 py-8 text-center text-sm">
              {team.canManage
                ? t("noSharedThemesYetUse")
                : t("noSharedThemesYetOwners")}
            </Card>
          ) : (
            <Card className="flex-col items-start gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="bg-muted rounded-md p-2">
                  <Lock className="text-muted-foreground size-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {t("shareThemesWithThisWorkspace")}
                  </p>
                  <p className="text-muted-foreground text-sm text-pretty">
                    {t("sharedThemesPlan", {
                      plan: team.planName,
                      workspace: team.name,
                    })}
                    {!team.canUpgrade && ` ${t("askAWorkspaceOwnerTo")}`}
                  </p>
                </div>
              </div>
              {team.canUpgrade && (
                <UpgradeButton size="sm">{t("upgrade")}</UpgradeButton>
              )}
            </Card>
          )}
        </section>
      )}

      {!noMatches && (
        <section className="space-y-4">
          {team && (
            <SectionHeading
              description={t("savedInYourOwnWorkspace")}
              title={t("yourThemes")}
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
              <HairlineFigure className="aspect-square w-32" figure="Palette" />
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">
                  {t("noSavedThemesYet")}
                </h3>
                <p className="text-muted-foreground mx-auto max-w-md text-sm text-pretty">
                  {t("designAQrCodeIn")}
                </p>
              </div>
              <Button asChild>
                <Link href={playgroundHref({ tab: "design" })}>
                  <Plus className="size-4" />
                  {t("createATheme")}
                </Link>
              </Button>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
