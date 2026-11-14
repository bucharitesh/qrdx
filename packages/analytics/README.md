# @repo/analytics

QRdx's browser-side analytics and cookie consent: the cookie banner and preferences (c15t, local mode), the tools they gate, and `track()`. Client code only. The app's server parts stay in `apps/app/lib/analytics` (`server.ts` for server events, `acquisition.ts`, `usage.ts`, the sign-up recorder), as does the server action that reads a user's plan (`apps/app/actions/analytics.ts`).

| Module | What it holds |
| --- | --- |
| `index.ts` (`@repo/analytics`) | `track`, `trackPageview`, `resetAnalytics` and the event types |
| `events.ts` | The event catalogue: every event and its properties |
| `track.ts` | Sends an event to Umami and (with consent) PostHog, after `privacy.ts` strips it |
| `privacy.ts` | PII guards for properties, URLs and titles; `registerUntrackedPaths` and `isUntrackedAnalyticsPath`; Do Not Track and Global Privacy Control |
| `posthog.ts` | PostHog, loaded only after the "Analytics" choice, through the same-origin `/ingest` proxy (`@repo/next-config` rewrites it) |
| `umami.ts` | Umami: cookieless, no consent needed, off under Do Not Track or Global Privacy Control |
| `identity.ts` | Keeps PostHog in step with the Better Auth session (user id, never email) |
| `analytics.tsx` | `<Analytics>`: the Umami script, pageviews on App Router navigations, identity |
| `featurebase.tsx`, `featurebase-launcher.ts` | The Featurebase widget (after the "Functionality" choice) and the hook that moves its launcher aside |
| `config.ts` | Where analytics may run (the app's own host; local development only with the debug switch), and the consent mirror cookie |
| `keys.ts` | The public ids it reads: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, `NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_FEATUREBASE_APP_ID` (the app's `env.ts` extends it) |
| `consent/*` | `<ConsentManager>` (banner, preferences, the tools above), `<CookieSettingsButton>`, the early banner script, the banner inset the editor's popovers keep clear of |

## What an app passes in

- **Its untracked pages.** Which pages record nothing (the main app's customer pages, the scanner, template demos) depends on the app's routes, so the app registers them once, before anything can be tracked: `registerUntrackedPaths(isUntrackedPath)`. Until it does, every page counts as untracked and nothing is sent, so a missing registration loses numbers rather than recording a customer's page. The main app registers in `apps/app/lib/analytics/privacy.ts`, which every analytics path in the app imports first.
- **A link component** for the privacy policy links: `<ConsentManager link={…}>`. The main app passes `LocaleLink`, which keeps the visitor's language.
- **Optionally, `getPlan`**: a function (the main app's server action) that returns the signed-in user's plan for PostHog's person properties. It's only called after the visitor allowed analytics. Without it, the plan is left out.
- **Copy**: the components read the `consent` messages through next-intl, so the app's `NextIntlClientProvider` must include that namespace.

```tsx
<ConsentManager link={LocaleLink} getPlan={getAnalyticsPlan} />
```

The main app wraps this in `apps/app/components/consent/consent-manager.tsx`, and the files left at the old paths in `apps/app/lib/analytics` and `apps/app/components/consent` re-export this package so the app's imports keep working. The tests live in the app (`apps/app/tests/lib/analytics.test.ts`, `apps/app/tests/lib/consent-manager.test.tsx`).
