import { cn } from "@repo/design-system/lib/utils";
import {
  Personalcard as Contact,
  Global as Globe,
  Sms as Mail,
  Location as MapPin,
  MessageCircle,
  Call as Phone,
  UserAdd as UserPlus,
} from "iconsax-reactjs";
import { z } from "zod";
import { buildVCard, vcardFilename } from "@/app/api/vcard/[slug]/vcard";
import {
  addressSchema,
  buttonClass,
  emailSchema,
  formatAddress,
  imageSchema,
  itemIdSchema,
  lineText,
  linkProps,
  longText,
  mailHref,
  mapLinks,
  mutedTextClass,
  phoneSchema,
  telHref,
  whatsAppHref,
} from "@/components/landing/block-kit";
import { ShareButton } from "@/components/landing/share-button";
import { landingUrlSchema } from "@/types/landing";
import { type BlockRenderProps, registerBlock } from "../registry";
import { ContactEditor } from "./contact-editor";

export const PHONE_TYPES = ["mobile", "work", "home", "fax", "other"] as const;
export const EMAIL_TYPES = ["work", "home", "other"] as const;

export const PHONE_TYPE_LABELS: Record<(typeof PHONE_TYPES)[number], string> = {
  mobile: "Mobile",
  work: "Work",
  home: "Home",
  fax: "Fax",
  other: "Phone",
};
export const EMAIL_TYPE_LABELS: Record<(typeof EMAIL_TYPES)[number], string> = {
  work: "Work",
  home: "Personal",
  other: "Email",
};

export const contactSchema = z.object({
  photo: imageSchema.optional(),
  firstName: lineText(60).default(""),
  lastName: lineText(60).default(""),
  jobTitle: lineText(100).default(""),
  company: lineText(100).default(""),
  bio: longText(500).default(""),
  phones: z
    .array(
      z.object({
        id: itemIdSchema,
        type: z.enum(PHONE_TYPES).default("mobile"),
        number: phoneSchema,
        /** Also offer a WhatsApp chat for this number */
        whatsapp: z.boolean().default(false),
      }),
    )
    .max(5)
    .default([]),
  emails: z
    .array(
      z.object({
        id: itemIdSchema,
        type: z.enum(EMAIL_TYPES).default("work"),
        address: emailSchema,
      }),
    )
    .max(5)
    .default([]),
  website: z.union([landingUrlSchema, z.literal("")]).default(""),
  address: addressSchema.prefault({}),
  /** "Save contact" downloads a .vcf (vCard) of these details */
  showSave: z.boolean().default(true),
  showShare: z.boolean().default(true),
});

export type ContactProps = z.output<typeof contactSchema>;

/** "First Last", else the company. */
export function contactDisplayName(props: ContactProps): string {
  return (
    [props.firstName, props.lastName].filter(Boolean).join(" ") || props.company
  );
}

function QuickAction({
  href,
  label,
  icon: Icon,
  blockId,
  target,
}: {
  href: string;
  label: string;
  icon: typeof Phone;
  blockId: string;
  target: string;
}) {
  return (
    <a
      className="flex max-w-20 min-w-0 flex-1 flex-col items-center gap-1.5 text-center text-xs font-medium"
      {...linkProps(href, blockId, target)}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-(--lp-primary) text-(--lp-primary-fg)">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      {label}
    </a>
  );
}

function DetailRow({
  href,
  icon: Icon,
  label,
  value,
  blockId,
  target,
}: {
  href?: string;
  icon: typeof Phone;
  label: string;
  value: string;
  blockId: string;
  target: string;
}) {
  const body = (
    <>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 opacity-70" />
      <span className="min-w-0">
        <span className={cn("block text-xs", mutedTextClass)}>{label}</span>
        <span className="block break-words whitespace-pre-line">{value}</span>
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <a
          className="flex gap-3 px-4 py-3 hover:bg-black/5"
          {...linkProps(href, blockId, target)}
        >
          {body}
        </a>
      ) : (
        <div className="flex gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  );
}

function ContactBlock({ id, props, context }: BlockRenderProps<ContactProps>) {
  const name = [props.firstName, props.lastName].filter(Boolean).join(" ");
  const role = [props.jobTitle, props.company].filter(Boolean).join(" · ");
  const addressLines = formatAddress(props.address);
  const maps = addressLines.length ? mapLinks(addressLines.join(", ")) : null;
  const [phone] = props.phones;
  const [email] = props.emails;
  const whatsapp = props.phones.find((item) => item.whatsapp);
  // Template demos have no saved page: the .vcf is built into the link.
  const demoVCard = context.demo
    ? {
        href: `data:text/vcard;charset=utf-8,${encodeURIComponent(
          buildVCard({
            contact: props,
            photo: props.photo ? { kind: "uri", uri: props.photo.url } : null,
          }),
        )}`,
        filename: vcardFilename(props),
      }
    : null;
  const vcardHref =
    demoVCard?.href ??
    (context.pageId
      ? `/api/vcard/${encodeURIComponent(context.pageId)}?b=${encodeURIComponent(id)}`
      : "#");

  return (
    <section aria-label={name || "Contact"} className="space-y-5">
      {(props.photo || name || role || props.bio) && (
        <div className="flex flex-col items-center gap-3 text-center">
          {props.photo && (
            <img
              alt={props.photo.alt || name}
              className="size-28 rounded-full object-cover shadow-sm ring-4 ring-(--lp-bg)"
              decoding="async"
              height={112}
              src={props.photo.url}
              width={112}
            />
          )}
          {name && (
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance">
              {name}
            </h1>
          )}
          {role && <p className={cn("text-[15px]", mutedTextClass)}>{role}</p>}
          {props.bio && (
            <p className="text-[15px] leading-relaxed whitespace-pre-line">
              {props.bio}
            </p>
          )}
        </div>
      )}

      {(phone || email || props.website || maps || whatsapp) && (
        <div className="flex justify-center gap-2">
          {phone && (
            <QuickAction
              blockId={id}
              href={telHref(phone.number)}
              icon={Phone}
              label="Call"
              target="call"
            />
          )}
          {whatsapp && (
            <QuickAction
              blockId={id}
              href={whatsAppHref(whatsapp.number)}
              icon={MessageCircle}
              label="WhatsApp"
              target="whatsapp"
            />
          )}
          {email && (
            <QuickAction
              blockId={id}
              href={mailHref(email.address)}
              icon={Mail}
              label="Email"
              target="email"
            />
          )}
          {props.website && (
            <QuickAction
              blockId={id}
              href={props.website}
              icon={Globe}
              label="Website"
              target="website"
            />
          )}
          {maps && (
            <QuickAction
              blockId={id}
              href={maps.google}
              icon={MapPin}
              label="Directions"
              target="directions"
            />
          )}
        </div>
      )}

      {(props.showSave || props.showShare) && (
        <div className="grid gap-2">
          {props.showSave && (
            <a
              className={buttonClass("filled")}
              data-lp-block={id}
              data-lp-target="save-contact"
              download={demoVCard?.filename}
              href={vcardHref}
              rel="nofollow"
            >
              <UserPlus aria-hidden="true" className="size-4" />
              Save contact
            </a>
          )}
          {props.showShare && (
            <ShareButton
              blockId={id}
              title={name || props.company || "Contact"}
            />
          )}
        </div>
      )}

      {(props.phones.length > 0 ||
        props.emails.length > 0 ||
        props.website ||
        addressLines.length > 0) && (
        <ul className="divide-y divide-current/10 overflow-hidden rounded-(--lp-radius) bg-(--lp-muted) text-[15px]">
          {props.phones.map((item) => (
            <DetailRow
              blockId={id}
              href={telHref(item.number)}
              icon={Phone}
              key={item.id}
              label={PHONE_TYPE_LABELS[item.type]}
              target={`phone:${item.id}`}
              value={item.number}
            />
          ))}
          {props.emails.map((item) => (
            <DetailRow
              blockId={id}
              href={mailHref(item.address)}
              icon={Mail}
              key={item.id}
              label={EMAIL_TYPE_LABELS[item.type]}
              target={`email:${item.id}`}
              value={item.address}
            />
          ))}
          {props.website && (
            <DetailRow
              blockId={id}
              href={props.website}
              icon={Globe}
              label="Website"
              target="website"
              value={props.website
                .replace(/^https?:\/\/(www\.)?/, "")
                .replace(/\/$/, "")}
            />
          )}
          {maps && (
            <DetailRow
              blockId={id}
              href={maps.google}
              icon={MapPin}
              label="Address"
              target="address"
              value={addressLines.join("\n")}
            />
          )}
        </ul>
      )}
    </section>
  );
}

export const contactBlock = registerBlock({
  type: "contact",
  category: "contact",
  label: "Contact card",
  description: "Name, phones, emails and a Save contact button (vCard)",
  icon: Contact,
  schema: contactSchema,
  defaults: {
    firstName: "Alex",
    lastName: "Morgan",
    jobTitle: "Founder",
    company: "Example Co.",
  },
  Render: ContactBlock,
  Editor: ContactEditor,
});
