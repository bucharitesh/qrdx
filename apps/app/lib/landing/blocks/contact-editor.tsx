"use client";

import { newItemId } from "@/components/landing/block-kit";
import {
  ImageField,
  ListEditor,
  SelectField,
  SwitchField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { ContactProps } from "./contact";

type Phone = ContactProps["phones"][number];
type Email = ContactProps["emails"][number];

const PHONE_OPTIONS = [
  { value: "mobile", label: "Mobile" },
  { value: "work", label: "Work" },
  { value: "home", label: "Home" },
  { value: "fax", label: "Fax" },
  { value: "other", label: "Other" },
] as const;

const EMAIL_OPTIONS = [
  { value: "work", label: "Work" },
  { value: "home", label: "Personal" },
  { value: "other", label: "Other" },
] as const;

export function ContactEditor({
  value,
  onChange,
}: BlockEditorProps<ContactProps>) {
  const set = (patch: Partial<ContactProps>) =>
    onChange({ ...value, ...patch });
  const setAddress = (patch: Partial<ContactProps["address"]>) =>
    set({ address: { ...value.address, ...patch } });

  return (
    <div className="space-y-4">
      <ImageField
        label="Photo"
        onChange={(photo) => set({ photo })}
        value={value.photo}
      />
      <ImageField
        hint="Optional wide photo across the top of the card, like your office or work."
        label="Cover image"
        onChange={(cover) => set({ cover })}
        value={value.cover}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          autoComplete="given-name"
          label="First name"
          maxLength={60}
          onChange={(firstName) => set({ firstName })}
          value={value.firstName}
        />
        <TextField
          autoComplete="family-name"
          label="Last name"
          maxLength={60}
          onChange={(lastName) => set({ lastName })}
          value={value.lastName}
        />
        <TextField
          label="Job title"
          maxLength={100}
          onChange={(jobTitle) => set({ jobTitle })}
          value={value.jobTitle}
        />
        <TextField
          label="Company"
          maxLength={100}
          onChange={(company) => set({ company })}
          value={value.company}
        />
      </div>
      <TextField
        label="Bio"
        maxLength={500}
        multiline
        onChange={(bio) => set({ bio })}
        value={value.bio}
      />

      <ListEditor<Phone>
        addLabel="Add phone"
        create={() => ({
          id: newItemId(),
          type: "mobile",
          number: "",
          whatsapp: false,
        })}
        itemLabel={(item, index) => item.number || `Phone ${index + 1}`}
        items={value.phones}
        label="Phones"
        max={5}
        onChange={(phones) => set({ phones })}
        renderItem={(item, update) => (
          <>
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <SelectField
                label="Type"
                onChange={(type) => update({ type })}
                options={PHONE_OPTIONS}
                value={item.type}
              />
              <TextField
                inputMode="tel"
                label="Number"
                maxLength={32}
                onChange={(number) => update({ number })}
                placeholder="+1 555 0100"
                type="tel"
                value={item.number}
              />
            </div>
            <SwitchField
              checked={item.whatsapp}
              label="Reachable on WhatsApp"
              onChange={(whatsapp) => update({ whatsapp })}
            />
          </>
        )}
      />

      <ListEditor<Email>
        addLabel="Add email"
        create={() => ({ id: newItemId(), type: "work", address: "" })}
        itemLabel={(item, index) => item.address || `Email ${index + 1}`}
        items={value.emails}
        label="Emails"
        max={5}
        onChange={(emails) => set({ emails })}
        renderItem={(item, update) => (
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <SelectField
              label="Type"
              onChange={(type) => update({ type })}
              options={EMAIL_OPTIONS}
              value={item.type}
            />
            <TextField
              inputMode="email"
              label="Address"
              maxLength={254}
              onChange={(address) => update({ address })}
              placeholder="name@example.com"
              type="email"
              value={item.address}
            />
          </div>
        )}
      />

      <UrlField
        label="Website"
        onChange={(website) => set({ website })}
        value={value.website}
      />

      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-xs font-medium">Address</legend>
        <TextField
          autoComplete="street-address"
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
      </fieldset>

      <SwitchField
        checked={value.showSave}
        hint="Visitors download a vCard (.vcf) with these details and photo."
        label="Save contact button"
        onChange={(showSave) => set({ showSave })}
      />
      <SwitchField
        checked={value.showShare}
        label="Share button"
        onChange={(showShare) => set({ showShare })}
      />
    </div>
  );
}
