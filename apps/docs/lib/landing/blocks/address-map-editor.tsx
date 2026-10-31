"use client";

import { SwitchField, TextField } from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { AddressMapProps } from "./address-map";

export function AddressMapEditor({
  value,
  onChange,
}: BlockEditorProps<AddressMapProps>) {
  const set = (patch: Partial<AddressMapProps>) =>
    onChange({ ...value, ...patch });
  const setAddress = (patch: Partial<AddressMapProps["address"]>) =>
    set({ address: { ...value.address, ...patch } });
  return (
    <div className="space-y-4">
      <TextField
        label="Section title"
        maxLength={80}
        onChange={(title) => set({ title })}
        placeholder="Optional, e.g. Visit us"
        value={value.title}
      />
      <TextField
        label="Place name"
        maxLength={100}
        onChange={(name) => set({ name })}
        placeholder="Optional, e.g. Café Luna"
        value={value.name}
      />
      <TextField
        label="Street"
        maxLength={200}
        onChange={(street) => setAddress({ street })}
        value={value.address.street}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="City"
          maxLength={100}
          onChange={(city) => setAddress({ city })}
          value={value.address.city}
        />
        <TextField
          label="Postal code"
          maxLength={20}
          onChange={(postalCode) => setAddress({ postalCode })}
          value={value.address.postalCode}
        />
        <TextField
          label="State / region"
          maxLength={100}
          onChange={(region) => setAddress({ region })}
          value={value.address.region}
        />
        <TextField
          label="Country"
          maxLength={100}
          onChange={(country) => setAddress({ country })}
          value={value.address.country}
        />
      </div>
      <TextField
        label="Note"
        maxLength={200}
        onChange={(note) => set({ note })}
        placeholder="Optional, e.g. Entrance on 2nd Street"
        value={value.note}
      />
      <SwitchField
        checked={value.showMap}
        hint="Embeds Google Maps, which loads content from Google for visitors."
        label="Show a map"
        onChange={(showMap) => set({ showMap })}
      />
    </div>
  );
}
