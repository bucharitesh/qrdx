"use client";

import { newItemId } from "@/components/landing/block-kit";
import {
  ChoiceField,
  ListEditor,
  SelectField,
  UrlField,
} from "@/components/landing/editor/fields";
import {
  getSocialNetwork,
  networkForUrl,
  SOCIAL_NETWORKS,
} from "@/components/landing/social-networks";
import type { BlockEditorProps } from "../registry";
import type { SocialItem, SocialsProps } from "./socials";

const NETWORK_OPTIONS = SOCIAL_NETWORKS.map((network) => ({
  value: network.id,
  label: network.label,
}));

export function SocialsEditor({
  value,
  onChange,
}: BlockEditorProps<SocialsProps>) {
  const set = (patch: Partial<SocialsProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <ListEditor<SocialItem>
        addLabel="Add profile"
        create={() => ({ id: newItemId(), network: "instagram", url: "" })}
        itemLabel={(item) => getSocialNetwork(item.network).label}
        items={value.items}
        max={30}
        onChange={(items) => set({ items })}
        renderItem={(item, update) => (
          <>
            <SelectField
              label="Network"
              onChange={(network) => update({ network })}
              options={NETWORK_OPTIONS}
              value={item.network}
            />
            <UrlField
              allowActions
              label="Profile link"
              onChange={(url) => {
                // Pick the network automatically when a known link is pasted.
                const detected = networkForUrl(url);
                update(
                  detected && item.url === ""
                    ? { url, network: detected.id }
                    : { url },
                );
              }}
              placeholder={getSocialNetwork(item.network).placeholder}
              value={item.url}
            />
          </>
        )}
      />
      <ChoiceField
        label="Style"
        onChange={(style) => set({ style })}
        options={[
          { value: "icons", label: "Icons" },
          { value: "buttons", label: "Buttons" },
        ]}
        value={value.style}
      />
    </div>
  );
}
