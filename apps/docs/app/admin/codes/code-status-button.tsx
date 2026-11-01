import { AdminAction } from "../_components/admin-action";

/** Disable (anti-phishing) or re-enable a code, with a reason for the log. */
export function CodeStatusButton({
  codeId,
  slug,
  isActive,
}: {
  codeId: string;
  slug: string;
  isActive: boolean;
}) {
  return (
    <AdminAction
      action="setCodeActive"
      confirmLabel={isActive ? "Disable" : "Enable"}
      description={
        isActive
          ? `Scans of /q/${slug} show a "no longer active" page and the owner can't re-enable it.`
          : `/q/${slug} redirects again and the owner regains control.`
      }
      destructive={isActive}
      input={{ codeId, active: !isActive }}
      label={isActive ? "Disable" : "Enable"}
      success={isActive ? `Disabled /q/${slug}` : `Enabled /q/${slug}`}
      title={isActive ? `Disable /q/${slug}` : `Enable /q/${slug}`}
    />
  );
}
