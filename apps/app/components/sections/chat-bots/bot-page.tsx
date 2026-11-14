import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { getCatalogEntry } from "@repo/integrations/src/catalog";
import {
  ArrowRight,
  Book1,
  Category,
  ExportSquare,
  Information,
} from "iconsax-reactjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import {
  CardGrid,
  type CardIcon,
  cardClass,
  IconTile,
  interactiveCardClass,
  LinkCard,
  SectionHeading,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { SpotlightLink } from "@/components/sections/tools/spotlight-link";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { TrackedAnchor, TrackedLink } from "@/lib/analytics/react";
import { isPathAvailable } from "@/lib/feature-availability";
import { CHAT_BOTS, type ChatBotId, chatBot } from "./bots";

// The layout every chat bot landing page shares (app/(app)/(home)/slack, telegram
// and discord): the hero with the add button and the conversation mockup,
// three steps, the commands, privacy, links to the docs and the other bots,
// and the FAQ (with FAQPage JSON-LD from FaqList). The copy is each page's.

export interface BotStep {
  title: string;
  body: string;
}

export interface BotCommand {
  icon: CardIcon;
  title: string;
  /** What to type, shown as code. */
  usage?: string;
  description: string;
}

export interface BotLandingPageProps {
  bot: ChatBotId;
  /** The H1. */
  title: string;
  intro: string[];
  /** The add button: a page here, or an API route that redirects away. */
  action: { label: string; href: string; leavesSite: boolean };
  /** One line under the buttons: what it costs and who needs an account. */
  note: string;
  mock: ReactNode;
  steps: { title: string; description?: string; items: BotStep[] };
  commands: { title: string; description?: ReactNode; items: BotCommand[] };
  privacy: { title: string; paragraphs: string[] };
  faqs: { question: string; answer: string }[];
}

const inkButtonClass =
  "border-transparent bg-black text-white shadow-none hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90";

function AddButton({
  bot,
  action,
}: Pick<BotLandingPageProps, "bot" | "action">) {
  const props = { bot } as const;
  return (
    <Button asChild className={inkButtonClass}>
      {action.leavesSite ? (
        <TrackedAnchor
          event="chat_bot_add_clicked"
          props={props}
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {action.label}
          <ExportSquare aria-hidden className="size-4 opacity-70" />
        </TrackedAnchor>
      ) : (
        <TrackedLink
          event="chat_bot_add_clicked"
          props={props}
          href={action.href}
        >
          {action.label}
          <ArrowRight aria-hidden className="size-4" />
        </TrackedLink>
      )}
    </Button>
  );
}

/** A card linking to another bot's page, with its app's logo. */
function BotCard({ id }: { id: ChatBotId }) {
  const bot = chatBot(id);
  const logo = getCatalogEntry(bot.catalogSlug)?.logo;
  return (
    <SpotlightLink
      href={bot.path}
      className={cn(
        cardClass,
        interactiveCardClass,
        "flex h-full min-w-0 items-start gap-3.5 p-4",
      )}
    >
      {logo && <IntegrationLogo logo={logo} size="sm" />}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start gap-2 text-sm font-medium leading-snug text-foreground">
          <span className="min-w-0 text-pretty">{bot.name}</span>
          <ArrowRight
            aria-hidden
            className="mt-0.5 ml-auto size-3.5 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </span>
        <span className="line-clamp-2 text-sm leading-snug text-muted-foreground text-pretty">
          {bot.summary}
        </span>
      </span>
    </SpotlightLink>
  );
}

export function BotLandingPage({
  bot: id,
  title,
  intro,
  action,
  note,
  mock,
  steps,
  commands,
  privacy,
  faqs,
}: BotLandingPageProps) {
  const bot = chatBot(id);
  // The other bots, where this deployment has them set up.
  const others = CHAT_BOTS.filter(
    (other) => other.id !== id && isPathAvailable(other.path),
  );
  const more = [
    { kind: "docs" as const },
    ...others.map((other) => ({ kind: "bot" as const, id: other.id })),
    { kind: "integrations" as const },
  ];

  return (
    <main className="flex min-h-screen w-full flex-col divide-y divide-border">
      <ToolHero
        pattern="wave"
        crumbs={[
          { name: "Home", path: "/" },
          { name: bot.name, path: bot.path },
        ]}
        title={title}
        intro={intro}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-2.5">
            <AddButton bot={id} action={action} />
            <Button asChild variant="outline">
              <Link href={bot.docs}>
                <Book1 aria-hidden className="size-4" />
                Read the docs
              </Link>
            </Button>
          </div>
          <p className="flex items-center gap-2 text-center text-xs text-muted-foreground text-pretty">
            <Information aria-hidden className="size-3.5 shrink-0" />
            {note}
          </p>
        </div>
        <div className="mt-4 w-full max-w-xl">{mock}</div>
      </ToolHero>

      <section
        aria-labelledby="how"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="how"
          eyebrow="How it works"
          title={steps.title}
          description={steps.description}
        />
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.items.map((step, index) => (
            <li key={step.title} className="min-w-0">
              <Card className="h-full gap-3 p-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40 font-mono text-sm text-foreground/80">
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="font-medium text-foreground">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                    {step.body}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="commands"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="commands"
          eyebrow="What you can do"
          title={commands.title}
          description={commands.description}
        />
        <CardGrid count={commands.items.length}>
          {commands.items.map((command) => (
            <Card key={command.title} className="h-full gap-3 p-5">
              <IconTile icon={command.icon} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="font-medium text-foreground">{command.title}</h3>
                {command.usage && (
                  <code className="w-fit max-w-full rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs break-words text-foreground/80">
                    {command.usage}
                  </code>
                )}
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                  {command.description}
                </p>
              </div>
            </Card>
          ))}
        </CardGrid>
      </section>

      <section
        aria-labelledby="privacy"
        className="grid w-full gap-8 px-10 py-12 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      >
        <SectionHeading id="privacy" eyebrow="Privacy" title={privacy.title} />
        <div className="flex max-w-2xl flex-col gap-4 text-base leading-relaxed text-muted-foreground text-pretty">
          {privacy.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="more"
        className="flex w-full flex-col gap-8 px-10 py-12 md:py-16"
      >
        <SectionHeading
          id="more"
          eyebrow="More"
          title={
            others.length > 0
              ? "The docs, and QRdx in other chat apps"
              : "The docs and more integrations"
          }
        />
        <CardGrid count={more.length}>
          {more.map((item) =>
            item.kind === "docs" ? (
              <LinkCard
                key="docs"
                href={bot.docs}
                icon={Book1}
                title={`${bot.name} docs`}
                description="Every command, step by step, plus removing the bot and self-hosting."
              />
            ) : item.kind === "bot" ? (
              <BotCard key={item.id} id={item.id} />
            ) : (
              <LinkCard
                key="integrations"
                href="/integrations"
                icon={Category}
                title="All integrations"
                description="Alerts, automation, short links, storage and the other tools QRdx connects to."
              />
            ),
          )}
        </CardGrid>
      </section>

      <FaqList title={`${bot.name} FAQ`} faqs={faqs} />
    </main>
  );
}
