"use client";

import {
  ChoiceField,
  SwitchField,
  TextField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { WifiProps } from "./menu-wifi";

export function WifiEditor({ value, onChange }: BlockEditorProps<WifiProps>) {
  const set = (patch: Partial<WifiProps>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        maxLength={60}
        onChange={(title) => set({ title })}
        placeholder="Wi-Fi"
        value={value.title}
      />
      <TextField
        label="Network name (SSID)"
        maxLength={32}
        onChange={(ssid) => set({ ssid })}
        value={value.ssid}
      />
      <ChoiceField
        label="Security"
        onChange={(security) => set({ security })}
        options={[
          { value: "WPA", label: "WPA/WPA2/WPA3" },
          { value: "WEP", label: "WEP" },
          { value: "nopass", label: "None" },
        ]}
        value={value.security}
      />
      {value.security !== "nopass" && (
        <TextField
          hint="Anyone who opens this page can see the password."
          label="Password"
          maxLength={63}
          onChange={(password) => set({ password })}
          value={value.password}
        />
      )}
      <SwitchField
        checked={value.hidden}
        hint="The network doesn't broadcast its name"
        label="Hidden network"
        onChange={(hidden) => set({ hidden })}
      />
      <TextField
        label="Note"
        maxLength={160}
        onChange={(note) => set({ note })}
        placeholder="Ask staff if you can't connect"
        value={value.note}
      />
    </div>
  );
}
