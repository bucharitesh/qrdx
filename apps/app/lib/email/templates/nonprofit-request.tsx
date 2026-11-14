import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { DetailsTable, MutedText } from "./parts";

// To QRdx: a non-profit or charity asked for the non-profit discount on the
// pricing page. QRdx checks the registration and replies with a Polar
// discount code; replying to this email reaches the requester.

export interface NonprofitRequestEmailProps {
  organization: string;
  country: string;
  registration: string;
  contactEmail: string;
  /** "Pro" or "Business" */
  plan: string;
  /** "50% off Pro or Business" */
  offer: string;
  accountEmail: string;
  accountId: string;
  workspace: { name: string; slug: string } | null;
}

export const nonprofitRequestSubject = (organization: string, plan: string) =>
  `Non-profit discount request: ${plan} for ${organization}`;

export function NonprofitRequestEmail(props: NonprofitRequestEmailProps) {
  const rows = [
    { label: "Plan", value: props.plan },
    { label: "Organization", value: props.organization },
    { label: "Country", value: props.country },
    { label: "Registration", value: props.registration },
    { label: "Contact email", value: props.contactEmail },
    {
      label: "Workspace",
      value: props.workspace
        ? `${props.workspace.name} (${props.workspace.slug})`
        : "Not signed in to one",
    },
    { label: "Account", value: `${props.accountEmail} (${props.accountId})` },
  ];
  return (
    <EmailLayout
      preview={nonprofitRequestSubject(props.organization, props.plan)}
      reason="Sent by the non-profit discount form on the pricing page."
    >
      <EmailHeading>Non-profit discount request</EmailHeading>
      <EmailText>
        {props.organization} asked for the non-profit discount ({props.offer})
        on {props.plan}. Reply to this email to reach {props.contactEmail}.
      </EmailText>
      <DetailsTable rows={rows} />
      <EmailDivider />
      <MutedText>
        Nothing was charged and no plan changed. Check the registration, then
        reply with a single-use Polar discount code if the organization
        qualifies.
      </MutedText>
    </EmailLayout>
  );
}

export default NonprofitRequestEmail;
