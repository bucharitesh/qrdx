"use client";

import { authClient } from "@repo/auth/client";
import {
  SSO_JOIN_ROLES,
  type SsoJoinRole,
  type SsoServiceProviderUrls,
} from "@repo/auth/sso-rules";
import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  TickCircle as CheckCircle2,
  Clock,
  Edit2,
  Refresh2 as RefreshCw,
  Trash as Trash2,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { RoleSelect } from "@/app/dashboard/team/_components/role-select";
import {
  ConfirmIdentityProvider,
  useConfirmation,
} from "@/components/confirm-identity/provider";
import { CopyButton } from "@/components/copy-button";
import {
  createSso,
  removeSso,
  type SsoActionResult,
  setSsoRole,
  updateSso,
  verifySso,
} from "@/ee/sso/actions";
import type { SsoConnectionView, SsoOverview } from "@/ee/sso/connections";
import { SSO_REAUTH_MESSAGE } from "@/ee/sso/messages";

const PROTOCOL_NAMES = { oidc: "OIDC", saml: "SAML" } as const;

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** A value the admin copies into their identity provider. */
function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="flex items-start gap-1 rounded-md border px-3 py-2">
        <code className="min-w-0 flex-1 font-mono text-xs break-all">
          {value}
        </code>
        <CopyButton
          className="-my-2 size-10 shrink-0"
          successMessage={{ title: `${label} copied` }}
          textToCopy={value}
        />
      </div>
    </div>
  );
}

/**
 * The TXT record, as copyable rows: a table squeezes the long name and value
 * into narrow columns on a phone.
 */
function DnsRecord({
  domain,
  record,
}: {
  domain: string;
  record: NonNullable<SsoConnectionView["record"]>;
}) {
  // Most DNS providers want the name relative to the domain.
  const name = record.name.endsWith(`.${domain}`)
    ? record.name.slice(0, -(domain.length + 1))
    : record.name;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-muted-foreground text-xs">Type</div>
        <code className="font-mono text-xs font-medium">{record.type}</code>
      </div>
      <CopyRow label="Name" value={name} />
      <p className="text-muted-foreground -mt-2 text-xs break-all">
        Full name: {record.name}
      </p>
      <CopyRow label="Value" value={record.value} />
    </div>
  );
}

function IdpValues({
  protocol,
  urls,
}: {
  protocol: "oidc" | "saml";
  urls: SsoServiceProviderUrls;
}) {
  return protocol === "oidc" ? (
    <CopyRow label="Redirect URI" value={urls.oidcRedirectUri} />
  ) : (
    <div className="space-y-3">
      <CopyRow
        label="Assertion Consumer Service (ACS) URL"
        value={urls.samlAcsUrl}
      />
      <CopyRow label="Entity ID (audience)" value={urls.samlEntityId} />
      <CopyRow label="Metadata URL" value={urls.samlMetadataUrl} />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return (
    <p
      aria-live="polite"
      className="text-destructive text-sm text-pretty empty:hidden"
      role={error ? "alert" : undefined}
    >
      {error}
    </p>
  );
}

/** The existing "sign in again" step (Settings → Profile & security). */
function ReauthNotice() {
  const router = useRouter();
  return (
    <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <p className="text-sm text-pretty">{SSO_REAUTH_MESSAGE}</p>
      <Button
        onClick={async () => {
          await authClient.signOut().catch(() => {});
          router.push("/sign-in");
        }}
        className="max-sm:h-10"
        size="sm"
      >
        Sign out
      </Button>
    </div>
  );
}

type Reporter = <T>(result: SsoActionResult<T>) => T | null;

function SetupCard({
  draft,
  report,
}: {
  draft: SsoOverview["draft"];
  report: Reporter;
}) {
  const id = useId();
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [protocol, setProtocol] = useState<"oidc" | "saml">("oidc");
  const [samlMode, setSamlMode] = useState<"metadata" | "manual">("metadata");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    setError(null);
    setBusy(true);
    try {
      const result = await withConfirmation(
        () =>
          createSso(
            protocol === "oidc"
              ? {
                  providerId: draft.providerId,
                  protocol,
                  domain: text("domain"),
                  issuer: text("issuer"),
                  clientId: text("clientId"),
                  clientSecret: text("clientSecret"),
                }
              : {
                  providerId: draft.providerId,
                  protocol,
                  domain: text("domain"),
                  ...(samlMode === "metadata"
                    ? { metadataXml: text("metadataXml") }
                    : {
                        ssoUrl: text("ssoUrl"),
                        entityId: text("entityId"),
                        certificate: text("certificate"),
                      }),
                },
          ),
        "sso",
      );
      if (result === null) return;
      if (!result.success) {
        if (!result.error.reauth) setError(result.error.message);
        report(result);
        return;
      }
      toast.success("Connection saved", {
        description: `Next, verify ${result.data.domain} with the DNS record shown.`,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up single sign-on</CardTitle>
        <CardDescription>
          Create an app for QRdx in your identity provider with the values
          below, then fill in what it gives you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          <Tabs
            onValueChange={(value) => {
              setProtocol(value as "oidc" | "saml");
              setError(null);
            }}
            value={protocol}
          >
            <TabsList className="max-sm:h-11">
              <TabsTrigger value="oidc">OIDC</TabsTrigger>
              <TabsTrigger value="saml">SAML 2.0</TabsTrigger>
            </TabsList>
          </Tabs>

          <IdpValues protocol={protocol} urls={draft.urls} />

          <Field
            hint="People whose address is at this domain (or a subdomain of it) sign in through your identity provider."
            htmlFor={`${id}-domain`}
            label="Email domain"
          >
            <Input
              autoComplete="off"
              id={`${id}-domain`}
              name="domain"
              placeholder="acme.com"
              required
            />
          </Field>

          {protocol === "oidc" ? (
            <>
              <Field
                hint="QRdx reads its settings from the issuer's /.well-known/openid-configuration."
                htmlFor={`${id}-issuer`}
                label="Issuer URL"
              >
                <Input
                  autoComplete="off"
                  id={`${id}-issuer`}
                  name="issuer"
                  placeholder="https://login.acme.com"
                  required
                  type="url"
                />
              </Field>
              <Field htmlFor={`${id}-client-id`} label="Client ID">
                <Input
                  autoComplete="off"
                  id={`${id}-client-id`}
                  name="clientId"
                  required
                />
              </Field>
              <Field htmlFor={`${id}-client-secret`} label="Client secret">
                <Input
                  autoComplete="off"
                  id={`${id}-client-secret`}
                  name="clientSecret"
                  required
                  type="password"
                />
              </Field>
            </>
          ) : samlMode === "metadata" ? (
            <Field
              hint={
                <>
                  Paste the XML your identity provider offers as its SAML
                  metadata.{" "}
                  <button
                    className="block min-h-10 underline"
                    onClick={() => setSamlMode("manual")}
                    type="button"
                  >
                    Enter the details instead
                  </button>
                </>
              }
              htmlFor={`${id}-metadata`}
              label="Identity provider metadata (XML)"
            >
              <Textarea
                className="min-h-32 font-mono text-xs"
                id={`${id}-metadata`}
                name="metadataXml"
                placeholder="<EntityDescriptor …>"
                required
              />
            </Field>
          ) : (
            <>
              <Field htmlFor={`${id}-sso-url`} label="Sign-in URL (SSO URL)">
                <Input
                  autoComplete="off"
                  id={`${id}-sso-url`}
                  name="ssoUrl"
                  required
                  type="url"
                />
              </Field>
              <Field
                htmlFor={`${id}-entity-id`}
                label="Identity provider entity ID (issuer)"
              >
                <Input
                  autoComplete="off"
                  id={`${id}-entity-id`}
                  name="entityId"
                  required
                />
              </Field>
              <Field
                hint={
                  <button
                    className="min-h-10 underline"
                    onClick={() => setSamlMode("metadata")}
                    type="button"
                  >
                    Paste metadata XML instead
                  </button>
                }
                htmlFor={`${id}-certificate`}
                label="Signing certificate"
              >
                <Textarea
                  className="min-h-28 font-mono text-xs"
                  id={`${id}-certificate`}
                  name="certificate"
                  placeholder="-----BEGIN CERTIFICATE-----"
                  required
                />
              </Field>
            </>
          )}

          <ErrorLine error={error} />
          <div className="flex justify-end">
            <Button disabled={busy} type="submit">
              {busy && <Spinner />}
              Save connection
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="secondary">
      <CheckCircle2 />
      Verified
    </Badge>
  ) : (
    <Badge variant="outline">
      <Clock />
      Waiting for DNS
    </Badge>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="min-w-0 text-sm break-all">{value}</dd>
    </div>
  );
}

function UpdateDialog({
  connection,
  open,
  onOpenChange,
  report,
}: {
  connection: SsoConnectionView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: Reporter;
}) {
  const id = useId();
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSaml = connection.protocol === "saml";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await withConfirmation(
        () =>
          updateSso(
            isSaml
              ? { protocol: "saml", certificate: value }
              : { protocol: "oidc", clientSecret: value },
          ),
        "sso",
      );
      if (result === null) return;
      if (!result.success) {
        if (!result.error.reauth) setError(result.error.message);
        else onOpenChange(false);
        report(result);
        return;
      }
      toast.success(isSaml ? "Certificate updated" : "Client secret updated");
      setValue("");
      onOpenChange(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSaml
              ? "Replace the signing certificate"
              : "Replace the client secret"}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {isSaml
              ? "Paste the new certificate from your identity provider. Sign-ins signed with the old one stop working."
              : "Paste the new secret from your identity provider. The old one stops working here straight away."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label className="sr-only" htmlFor={`${id}-value`}>
              {isSaml ? "Signing certificate" : "Client secret"}
            </Label>
            {isSaml ? (
              <Textarea
                className="min-h-28 font-mono text-xs"
                id={`${id}-value`}
                onChange={(event) => setValue(event.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----"
                required
                value={value}
              />
            ) : (
              <Input
                autoComplete="off"
                id={`${id}-value`}
                onChange={(event) => setValue(event.target.value)}
                required
                type="password"
                value={value}
              />
            )}
          </div>
          <ErrorLine error={error} />
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={busy || !value.trim()} type="submit">
              {busy && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionCard({
  connection,
  canManage,
  allowed,
  report,
}: {
  connection: SsoConnectionView;
  canManage: boolean;
  allowed: boolean;
  report: Reporter;
}) {
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSaml = connection.protocol === "saml";

  const remove = async () => {
    setBusy(true);
    try {
      const result = await withConfirmation(() => removeSso(), "sso");
      setRemoving(false);
      if (result === null) return;
      if (!result.success) {
        if (!result.error.reauth) toast.error(result.error.message);
        report(result);
        return;
      }
      toast.success(`Single sign-on for ${result.data.domain} removed`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="font-mono text-base break-all">
                {connection.domain}
              </CardTitle>
              <StatusBadge verified={connection.verified} />
            </div>
            <CardDescription>
              {connection.verified
                ? allowed
                  ? `People at ${connection.domain} can sign in with ${PROTOCOL_NAMES[connection.protocol]}.`
                  : "Paused: the workspace's plan doesn't include single sign-on."
                : "Nobody can sign in with it until the domain is verified."}
            </CardDescription>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              {allowed && !connection.fromMetadata && (
                <Button
                  className="max-sm:h-10"
                  onClick={() => setUpdating(true)}
                  size="sm"
                  variant="outline"
                >
                  <Edit2 />
                  {isSaml ? "Replace certificate" : "Replace secret"}
                </Button>
              )}
              <Button
                aria-label="Remove single sign-on"
                className="max-sm:size-10"
                onClick={() => setRemoving(true)}
                size="icon-sm"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2">
          <Detail
            label="Protocol"
            value={PROTOCOL_NAMES[connection.protocol]}
          />
          <Detail
            label={isSaml ? "IdP entity ID" : "Issuer"}
            value={
              <code className="font-mono text-xs">{connection.idpId}</code>
            }
          />
          {connection.clientIdHint && (
            <Detail
              label="Client ID"
              value={
                <code className="font-mono text-xs">
                  {connection.clientIdHint}
                </code>
              }
            />
          )}
          {connection.samlSsoUrl && (
            <Detail
              label="Sign-in URL"
              value={
                <code className="font-mono text-xs">
                  {connection.samlSsoUrl}
                </code>
              }
            />
          )}
          {connection.certificate && (
            <Detail
              label="Certificate"
              value={`Expires ${dateFormat.format(new Date(connection.certificate.expiresAt))}`}
            />
          )}
        </dl>
      </CardContent>

      <UpdateDialog
        connection={connection}
        onOpenChange={setUpdating}
        open={updating}
        report={report}
      />
      <AlertDialog onOpenChange={setRemoving} open={removing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove single sign-on?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              People at {connection.domain} can no longer sign in with your
              identity provider. They stay in the workspace and can sign in with
              an email code, Google or GitHub.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button disabled={busy} onClick={remove} variant="destructive">
              {busy && <Spinner />}
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function VerifyCard({
  connection,
  report,
}: {
  connection: SsoConnectionView;
  report: Reporter;
}) {
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const record = connection.record;

  const verify = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await withConfirmation(() => verifySso(), "sso");
      if (result === null) return;
      if (!result.success) {
        setMessage(result.error.message);
        report(result);
        return;
      }
      toast.success(`${connection.domain} is verified`, {
        description: "People at this domain can now sign in with SSO.",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>Verify {connection.domain}</CardTitle>
            <CardDescription>
              Add this TXT record at your DNS provider, then click Verify. It
              proves this workspace owns the domain.
            </CardDescription>
          </div>
          <Button
            className="max-sm:h-10"
            disabled={busy || !record}
            onClick={verify}
            size="sm"
          >
            {busy ? <Spinner /> : <RefreshCw />}
            Verify
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {record ? (
          <DnsRecord domain={connection.domain} record={record} />
        ) : (
          <p className="text-muted-foreground text-sm">
            The verification record couldn't be loaded. Reload the page.
          </p>
        )}
        {message && (
          <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function JoinRoleCard({
  role,
  report,
}: {
  role: SsoJoinRole;
  report: Reporter;
}) {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState<SsoJoinRole>(role);
  const [busy, setBusy] = useState(false);

  const change = async (next: SsoJoinRole) => {
    const previous = value;
    setValue(next);
    setBusy(true);
    try {
      const result = await setSsoRole(next);
      if (!result.success) {
        setValue(previous);
        toast.error(result.error.message);
        report(result);
        return;
      }
      toast.success("Saved");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New members</CardTitle>
        <CardDescription>
          The first time someone signs in with SSO, they join this workspace
          with this role. You can change anyone's role later in Team.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Label htmlFor={`${id}-role`}>Join as</Label>
        <RoleSelect
          disabled={busy}
          id={`${id}-role`}
          onChange={(next) => change(next as SsoJoinRole)}
          roles={SSO_JOIN_ROLES}
          value={value}
        />
      </CardContent>
    </Card>
  );
}

/** Settings → Single sign-on, below the header. */
export function SsoManager({ overview }: { overview: SsoOverview }) {
  const { connection, canManage, allowed, joinRole, draft } = overview;
  // Setting up needs a recent sign-in: say so before the form is filled in.
  const [needsReauth, setNeedsReauth] = useState(
    canManage && !connection && !overview.recentSignIn,
  );

  const report: Reporter = (result) => {
    if (result.success) return result.data;
    if (result.error.reauth) setNeedsReauth(true);
    return null;
  };

  if (!connection) {
    if (!canManage) {
      return (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          Single sign-on isn't set up for this workspace.
        </p>
      );
    }
    return (
      <ConfirmIdentityProvider>
        <div className="space-y-6">
          {needsReauth && <ReauthNotice />}
          <SetupCard draft={draft} report={report} />
        </div>
      </ConfirmIdentityProvider>
    );
  }

  return (
    <ConfirmIdentityProvider>
      <div className="space-y-6">
        {needsReauth && <ReauthNotice />}
        <ConnectionCard
          allowed={allowed}
          canManage={canManage}
          connection={connection}
          report={report}
        />
        {canManage && allowed && !connection.verified && (
          <VerifyCard connection={connection} report={report} />
        )}
        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle>In your identity provider</CardTitle>
              <CardDescription>
                {connection.protocol === "oidc"
                  ? "Your QRdx app there must allow this redirect URI."
                  : 'Your QRdx app there must use these values. Send the email address as the NameID or as an "email" attribute.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IdpValues
                protocol={connection.protocol}
                urls={connection.urls}
              />
            </CardContent>
          </Card>
        )}
        {canManage && allowed && (
          <JoinRoleCard report={report} role={joinRole} />
        )}
      </div>
    </ConfirmIdentityProvider>
  );
}
