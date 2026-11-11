"use client";
import { useTranslations } from "next-intl";

// Forms for the types whose code is a link built from a handle, code or
// number: messaging apps, social profiles, meetings, Waze and payment links.

import {
  blueskySchema,
  cashappSchema,
  discordSchema,
  googleMeetSchema,
  lineSchema,
  mastodonSchema,
  revolutSchema,
  signalSchema,
  soundcloudSchema,
  telegramSchema,
  twitchSchema,
  wazeSchema,
  zoomSchema,
} from "@/lib/validations/qr-content";
import { SchemaForm } from "./schema-form";

export function TelegramForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: t("usernameChannelOrGroup"),
          required: true,
          placeholder: t("usernameOrATMe"),
          hint: t("aPublicUsernameOrPaste"),
        },
        {
          name: "phoneNumber",
          label: t("phoneNumber"),
          required: true,
          placeholder: "+1 202 555 0142",
          inputMode: "tel",
          hint: t("withTheCountryCodeIt"),
        },
      ]}
      modes={{
        label: t("open"),
        options: [
          {
            value: "username",
            label: t("aUsernameChannelOrGroup"),
            fields: ["username"],
          },
          {
            value: "phone",
            label: t("aChatWithAPhone"),
            fields: ["phoneNumber"],
          },
        ],
      }}
      note={t("scanningOpensTelegramOrT")}
      schema={telegramSchema}
      type="telegram"
    />
  );
}

export function SignalForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "phoneNumber",
          label: t("phoneNumber"),
          required: true,
          placeholder: "+1 202 555 0142",
          inputMode: "tel",
          hint: t("withTheCountryCode"),
        },
        {
          name: "link",
          label: t("usernameOrGroupLink"),
          required: true,
          placeholder: "https://signal.me/#eu/…",
          hint: t("usernamesCantBeTurnedInto"),
          mono: true,
        },
      ]}
      modes={{
        label: t("open"),
        options: [
          {
            value: "phone",
            label: t("aChatWithAPhone"),
            fields: ["phoneNumber"],
          },
          {
            value: "link",
            label: t("aUsernameOrGroupLink"),
            fields: ["link"],
          },
        ],
      }}
      note={t("scanningOpensAChatIn")}
      schema={signalSchema}
      type="signal"
    />
  );
}

export function DiscordForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "invite",
          label: t("inviteLinkOrCode"),
          required: true,
          placeholder: t("discordGgAbc123"),
          hint: t("invitesExpireAfter7Days"),
        },
      ]}
      note={t("scanningOpensTheInviteIn")}
      schema={discordSchema}
      type="discord"
    />
  );
}

export function LineForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: t("lineId"),
          required: true,
          placeholder: t("yourLineIdOrOfficial"),
          hint: t("officialAccountsStartWithYou"),
        },
      ]}
      note={t("scanningOpensLineToAdd")}
      schema={lineSchema}
      type="line"
    />
  );
}

export function BlueskyForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "handle",
          label: t("handle"),
          required: true,
          placeholder: "yourname.bsky.social",
          hint: t("aCustomDomainHandleWorks"),
        },
      ]}
      note={t("scanningOpensTheProfileOn")}
      schema={blueskySchema}
      type="bluesky"
    />
  );
}

export function MastodonForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "handle",
          label: t("handle"),
          required: true,
          placeholder: t("youMastodonSocial"),
          hint: t("yourFullHandleServerIncluded"),
        },
      ]}
      note={t("scanningOpensTheProfileOn2")}
      schema={mastodonSchema}
      type="mastodon"
    />
  );
}

export function TwitchForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: t("twitchUsername"),
          required: true,
          placeholder: t("yourchannel"),
        },
      ]}
      note={t("scanningOpensTheChannelOn")}
      schema={twitchSchema}
      type="twitch"
    />
  );
}

export function SoundCloudForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: t("profileNameOrLink"),
          required: true,
          placeholder: t("yournameOrATrackLink"),
          hint: t("pasteATrackOrPlaylist"),
        },
      ]}
      note={t("scanningOpensSoundcloud")}
      schema={soundcloudSchema}
      type="soundcloud"
    />
  );
}

export function ZoomForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "meeting",
          label: t("meetingIdOrInviteLink"),
          required: true,
          placeholder: "123 4567 8901",
          hint: t("pasteTheInviteLinkTo"),
        },
      ]}
      note={t("scanningOpensTheMeetingIn")}
      schema={zoomSchema}
      type="zoom"
    />
  );
}

export function GoogleMeetForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "meeting",
          label: t("meetingCodeOrLink"),
          required: true,
          placeholder: t("abcDefgHij"),
        },
      ]}
      note={t("scanningOpensTheCallIn")}
      schema={googleMeetSchema}
      type="google-meet"
    />
  );
}

export function WazeForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "location",
          label: t("addressOrCoordinates"),
          required: true,
          placeholder: t("pikePlaceMarketSeattleOr"),
        },
        {
          name: "navigate",
          label: t("startDirectionsRightAway"),
          kind: "switch",
          initial: true,
        },
      ]}
      note={t("scanningOpensWazeOrWaze")}
      schema={wazeSchema}
      type="waze"
    />
  );
}

export function CashAppForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: t("cashtag"),
          required: true,
          placeholder: t("yourcashtag"),
        },
      ]}
      note={t("scanningOpensYourCashApp")}
      schema={cashappSchema}
      type="cashapp"
    />
  );
}

export function RevolutForm() {
  const t = useTranslations("editor.contentForms.linkForms");
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: t("revolutUsername"),
          required: true,
          placeholder: t("yourname"),
          hint: t("yourRevtagAsInRevolut"),
        },
      ]}
      note={t("scanningOpensYourRevolutMe")}
      schema={revolutSchema}
      type="revolut"
    />
  );
}
