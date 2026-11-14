import { hasAdminRole } from "@repo/auth/admin";
import { DeleteAccountAction, ExportDataAction } from "./account-actions";
import { AdminAction } from "./admin-action";

/** Account-level support actions at the top of the user 360 page. */
export function UserActions({
  userId,
  email,
  banned,
  emailVerified,
  role,
  isSelf,
}: {
  userId: string;
  email: string;
  banned: boolean;
  emailVerified: boolean;
  role: string | null;
  isSelf: boolean;
}) {
  const isAdminRole = hasAdminRole(role);

  return (
    <div className="flex flex-wrap gap-2">
      {banned ? (
        <AdminAction
          action="unban"
          confirmLabel="Unban"
          description={`${email} can sign in again.`}
          input={{ userId }}
          label="Unban"
          success={`Unbanned ${email}`}
          title="Unban user"
        />
      ) : (
        <AdminAction
          action="ban"
          confirmLabel="Ban"
          description="Signs them out everywhere and blocks new sign-ins. They see the reason when they try to sign in."
          destructive
          disabled={isSelf}
          disabledHint="You can't ban yourself"
          input={{ userId }}
          label="Ban"
          numberField={{
            name: "expiresInDays",
            label: "Lift automatically after (days, optional)",
            min: 1,
            max: 3650,
          }}
          success={`Banned ${email}`}
          title={`Ban ${email}`}
        />
      )}
      <AdminAction
        action="revokeSessions"
        confirmLabel="Sign out everywhere"
        description="Ends every session on every device. They can sign in again right away (e.g. after a lost laptop)."
        input={{ userId }}
        label="Revoke sessions"
        success="Sessions revoked"
        title="Revoke all sessions"
      />
      {!emailVerified && (
        <AdminAction
          action="markEmailVerified"
          confirmLabel="Mark verified"
          description={`Only when ${email} is confirmed to belong to this person.`}
          input={{ userId }}
          label="Mark email verified"
          success="Email marked verified"
          title="Mark email verified"
        />
      )}
      <AdminAction
        action="setRole"
        confirmLabel={isAdminRole ? "Remove admin" : "Make admin"}
        description={
          isAdminRole
            ? "They lose access to this panel."
            : "They get full access to this panel, including these actions."
        }
        destructive={!isAdminRole}
        disabled={isSelf && isAdminRole}
        disabledHint="You can't remove your own admin role"
        input={{ userId, role: isAdminRole ? "user" : "admin" }}
        label={isAdminRole ? "Remove admin" : "Make admin"}
        success={isAdminRole ? "Admin role removed" : "Admin role granted"}
        title={isAdminRole ? "Remove admin role" : "Grant admin role"}
        variant="ghost"
      />
      <ExportDataAction email={email} userId={userId} />
      <DeleteAccountAction email={email} isSelf={isSelf} userId={userId} />
    </div>
  );
}
