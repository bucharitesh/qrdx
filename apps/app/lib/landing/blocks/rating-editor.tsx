"use client";

import {
  ListEditor,
  SelectField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { ReviewLinksProps, ReviewPlatform } from "./rating";

type ReviewLink = ReviewLinksProps["links"][number];

// Runtime values duplicated from ./rating on purpose: importing them would
// make the block and its editor import each other.
const PLATFORMS: Array<{ value: ReviewPlatform; label: string }> = [
  { value: "google", label: "Google" },
  { value: "tripadvisor", label: "Tripadvisor" },
  { value: "yelp", label: "Yelp" },
  { value: "facebook", label: "Facebook" },
  { value: "trustpilot", label: "Trustpilot" },
  { value: "other", label: "Other" },
];

const HINTS: Record<ReviewPlatform, string> = {
  google:
    'In Google Business Profile, choose "Ask for reviews" and copy the link.',
  tripadvisor: 'Your Tripadvisor "Write a review" link.',
  yelp: 'Your Yelp business page or its "Write a review" link.',
  facebook: "Your Facebook page's Reviews tab.",
  trustpilot: "Your Trustpilot review page (trustpilot.com/evaluate/…).",
  other: "Any page where customers can leave a review.",
};

const newLink = (): ReviewLink => ({
  id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
  platform: "google",
  url: "",
  label: "",
});

export function ReviewLinksEditor({
  value,
  onChange,
}: BlockEditorProps<ReviewLinksProps>) {
  const set = (patch: Partial<ReviewLinksProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        maxLength={100}
        onChange={(title) => set({ title })}
        value={value.title}
      />
      <TextField
        label="Text"
        maxLength={300}
        multiline
        onChange={(description) => set({ description })}
        rows={2}
        value={value.description}
      />
      <ListEditor<ReviewLink>
        addLabel="Add review site"
        create={newLink}
        itemLabel={(link) =>
          PLATFORMS.find((platform) => platform.value === link.platform)
            ?.label ?? "Review site"
        }
        items={value.links}
        label="Review sites"
        max={6}
        onChange={(links) => set({ links })}
        renderItem={(link, update) => (
          <div className="space-y-3">
            <SelectField<ReviewPlatform>
              label="Site"
              onChange={(platform) => update({ platform })}
              options={PLATFORMS}
              value={link.platform}
            />
            <UrlField
              hint={HINTS[link.platform]}
              label="Review link"
              onChange={(url) => update({ url })}
              value={link.url}
            />
            <TextField
              label="Button text"
              maxLength={60}
              onChange={(label) => update({ label })}
              placeholder="Review us on Google"
              value={link.label}
            />
          </div>
        )}
      />
      <p className="text-muted-foreground text-xs">
        Shown to every visitor. Review sites, Google included, don't allow
        showing review links only to people who rated you highly.
      </p>
    </div>
  );
}
