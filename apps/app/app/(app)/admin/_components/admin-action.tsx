"use client";

import { useConfirmation } from "@/components/confirm-identity/provider";
import {
  banUserAction,
  removeCommunityThemeAction,
  revokeUserSessionsAction,
  setUserRoleAction,
  unbanUserAction,
} from "../actions";
import {
  approveAffiliateAction,
  markAffiliatePaidAction,
  reinstateAffiliateAction,
  rejectAffiliateAction,
  suspendAffiliateAction,
  voidCommissionAction,
} from "../affiliates/actions";
import {
  setDynamicCodeActiveAction,
  setDynamicCodePausedAction,
} from "../codes/actions";
import {
  cancelImportAction,
  cancelTwoFactorResetAction,
  changeEmailAction,
  deleteUserAccountAction,
  disconnectIntegrationAction,
  markEmailVerifiedAction,
  requeueImportAction,
  resendInvitationAction,
  resetTwoFactorAction,
  retryWebhookDeliveryAction,
  setOAuthAppSuspendedAction,
  setOAuthAppVerifiedAction,
  unlinkSignInMethodAction,
} from "../users/support-actions";
import {
  AdminActionButton,
  type AdminActionButtonProps,
  type AdminServerAction,
} from "./admin-action-button";

// Server actions by name, so server components can render a confirm button
// for any of them with plain (serializable) props. Each action re-checks
// admin, validates and audits on the server; the button
// (./admin-action-button.tsx) only collects input.
const ACTIONS = {
  ban: banUserAction,
  unban: unbanUserAction,
  revokeSessions: revokeUserSessionsAction,
  setRole: setUserRoleAction,
  removeCommunityTheme: removeCommunityThemeAction,
  setCodeActive: setDynamicCodeActiveAction,
  setCodePaused: setDynamicCodePausedAction,
  markEmailVerified: markEmailVerifiedAction,
  changeEmail: changeEmailAction,
  unlinkSignIn: unlinkSignInMethodAction,
  resetTwoFactor: resetTwoFactorAction,
  cancelTwoFactorReset: cancelTwoFactorResetAction,
  retryDelivery: retryWebhookDeliveryAction,
  requeueImport: requeueImportAction,
  cancelImport: cancelImportAction,
  disconnectIntegration: disconnectIntegrationAction,
  setAppVerified: setOAuthAppVerifiedAction,
  setAppSuspended: setOAuthAppSuspendedAction,
  resendInvitation: resendInvitationAction,
  deleteAccount: deleteUserAccountAction,
  approveAffiliate: approveAffiliateAction,
  rejectAffiliate: rejectAffiliateAction,
  suspendAffiliate: suspendAffiliateAction,
  reinstateAffiliate: reinstateAffiliateAction,
  markAffiliatePaid: markAffiliatePaidAction,
  voidCommission: voidCommissionAction,
} as const;

export type AdminActionName = keyof typeof ACTIONS;

export interface AdminActionProps
  extends Omit<AdminActionButtonProps, "run" | "withConfirmation"> {
  action: AdminActionName;
}

/**
 * A button that opens a confirm dialog with a reason, then runs the named
 * action. Actions that hand over an account ask the admin to confirm it's
 * them (with a second factor) first; the others never answer that.
 */
export function AdminAction({ action, ...props }: AdminActionProps) {
  const { withConfirmation } = useConfirmation();
  return (
    <AdminActionButton
      {...props}
      run={ACTIONS[action] as AdminServerAction}
      withConfirmation={(run) => withConfirmation(run, "support-change")}
    />
  );
}
