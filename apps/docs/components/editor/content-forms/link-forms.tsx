"use client";

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
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: "Username, channel or group",
          required: true,
          placeholder: "@username or a t.me link",
          hint: "A public username, or paste an invite link (t.me/+…) for a private group.",
        },
        {
          name: "phoneNumber",
          label: "Phone number",
          required: true,
          placeholder: "+1 202 555 0142",
          inputMode: "tel",
          hint: "With the country code. It opens a chat if that person's privacy settings allow it.",
        },
      ]}
      modes={{
        label: "Open",
        options: [
          {
            value: "username",
            label: "A username, channel or group",
            fields: ["username"],
          },
          {
            value: "phone",
            label: "A chat with a phone number",
            fields: ["phoneNumber"],
          },
        ],
      }}
      note="Scanning opens Telegram, or t.me in the browser when the app isn't installed."
      schema={telegramSchema}
      type="telegram"
    />
  );
}

export function SignalForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "phoneNumber",
          label: "Phone number",
          required: true,
          placeholder: "+1 202 555 0142",
          inputMode: "tel",
          hint: "With the country code.",
        },
        {
          name: "link",
          label: "Username or group link",
          required: true,
          placeholder: "https://signal.me/#eu/…",
          hint: "Usernames can't be turned into links outside Signal. Copy yours in Signal: Settings › Profile › Username › QR code or link. For a group, copy its link in the group's settings.",
          mono: true,
        },
      ]}
      modes={{
        label: "Open",
        options: [
          {
            value: "phone",
            label: "A chat with a phone number",
            fields: ["phoneNumber"],
          },
          {
            value: "link",
            label: "A username or group link",
            fields: ["link"],
          },
        ],
      }}
      note="Scanning opens a chat in Signal."
      schema={signalSchema}
      type="signal"
    />
  );
}

export function DiscordForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "invite",
          label: "Invite link or code",
          required: true,
          placeholder: "discord.gg/abc123",
          hint: "Invites expire after 7 days unless you set Expire after to Never when you create the invite.",
        },
      ]}
      note="Scanning opens the invite in Discord, or in the browser without the app."
      schema={discordSchema}
      type="discord"
    />
  );
}

export function LineForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: "LINE ID",
          required: true,
          placeholder: "your-line-id or @official",
          hint: "Official accounts start with @. You can also paste a line.me link.",
        },
      ]}
      note="Scanning opens LINE to add you as a friend."
      schema={lineSchema}
      type="line"
    />
  );
}

export function BlueskyForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "handle",
          label: "Handle",
          required: true,
          placeholder: "yourname.bsky.social",
          hint: "A custom domain handle works too.",
        },
      ]}
      note="Scanning opens the profile on Bluesky."
      schema={blueskySchema}
      type="bluesky"
    />
  );
}

export function MastodonForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "handle",
          label: "Handle",
          required: true,
          placeholder: "@you@mastodon.social",
          hint: "Your full handle, server included, or your profile link.",
        },
      ]}
      note="Scanning opens the profile on its server."
      schema={mastodonSchema}
      type="mastodon"
    />
  );
}

export function TwitchForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: "Twitch username",
          required: true,
          placeholder: "yourchannel",
        },
      ]}
      note="Scanning opens the channel on Twitch."
      schema={twitchSchema}
      type="twitch"
    />
  );
}

export function SoundCloudForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: "Profile name or link",
          required: true,
          placeholder: "yourname, or a track link",
          hint: "Paste a track or playlist link to open it directly.",
        },
      ]}
      note="Scanning opens SoundCloud."
      schema={soundcloudSchema}
      type="soundcloud"
    />
  );
}

export function ZoomForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "meeting",
          label: "Meeting ID or invite link",
          required: true,
          placeholder: "123 4567 8901",
          hint: "Paste the invite link to keep its passcode. With just the ID, Zoom asks for the passcode.",
        },
      ]}
      note="Scanning opens the meeting in Zoom."
      schema={zoomSchema}
      type="zoom"
    />
  );
}

export function GoogleMeetForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "meeting",
          label: "Meeting code or link",
          required: true,
          placeholder: "abc-defg-hij",
        },
      ]}
      note="Scanning opens the call in Google Meet."
      schema={googleMeetSchema}
      type="google-meet"
    />
  );
}

export function WazeForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "location",
          label: "Address or coordinates",
          required: true,
          placeholder: "Pike Place Market, Seattle, or 47.6097, -122.3422",
        },
        {
          name: "navigate",
          label: "Start directions right away",
          kind: "switch",
          initial: true,
        },
      ]}
      note="Scanning opens Waze, or waze.com when the app isn't installed."
      schema={wazeSchema}
      type="waze"
    />
  );
}

export function CashAppForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: "$Cashtag",
          required: true,
          placeholder: "$yourcashtag",
        },
      ]}
      note="Scanning opens your Cash App profile, where people can pay you."
      schema={cashappSchema}
      type="cashapp"
    />
  );
}

export function RevolutForm() {
  return (
    <SchemaForm
      fields={[
        {
          name: "username",
          label: "Revolut username",
          required: true,
          placeholder: "@yourname",
          hint: "Your Revtag, as in revolut.me/yourname.",
        },
      ]}
      note="Scanning opens your revolut.me page, where people can pay you."
      schema={revolutSchema}
      type="revolut"
    />
  );
}
