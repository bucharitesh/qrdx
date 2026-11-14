"use client";

import {
  ImageField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { AppsProps } from "./apps";
import { APP_STORE_HOSTS, hostIn, PLAY_STORE_HOSTS } from "./apps-platform";

const storeHint = (url: string, hosts: readonly string[], fallback: string) =>
  url && /^https?:\/\//i.test(url) && !hostIn(url, hosts)
    ? `This doesn't look like a ${hosts[0]} link.`
    : fallback;

export function AppsEditor({ value, onChange }: BlockEditorProps<AppsProps>) {
  const set = (patch: Partial<AppsProps>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="App name"
        maxLength={80}
        onChange={(name) => set({ name })}
        value={value.name}
      />
      <TextField
        label="Description"
        maxLength={300}
        multiline
        onChange={(description) => set({ description })}
        rows={2}
        value={value.description}
      />
      <ImageField
        label="App icon"
        onChange={(icon) => set({ icon })}
        value={value.icon}
      />
      <UrlField
        hint={storeHint(
          value.appStoreUrl,
          APP_STORE_HOSTS,
          "Shown first on iPhone and iPad.",
        )}
        label="App Store link"
        onChange={(appStoreUrl) => set({ appStoreUrl })}
        placeholder="https://apps.apple.com/app/…"
        value={value.appStoreUrl}
      />
      <UrlField
        hint={storeHint(
          value.playStoreUrl,
          PLAY_STORE_HOSTS,
          "Shown first on Android phones and tablets.",
        )}
        label="Google Play link"
        onChange={(playStoreUrl) => set({ playStoreUrl })}
        placeholder="https://play.google.com/store/apps/details?id=…"
        value={value.playStoreUrl}
      />
      <UrlField
        hint="Shown first on computers and other devices."
        label="Website or web app"
        onChange={(webUrl) => set({ webUrl })}
        value={value.webUrl}
      />
      {value.webUrl && (
        <TextField
          label="Website button label"
          maxLength={40}
          onChange={(webLabel) => set({ webLabel })}
          placeholder="Open in your browser"
          value={value.webLabel}
        />
      )}
    </div>
  );
}
