// A sign-in that arrived without QRdx asking for it: today, a SAML response
// started at the identity provider (./ee/sso.ts marks it while it reads the
// response). It signs the person in, but proves less than a sign-in they
// started here: an unused response someone else got hold of can be posted
// from any browser. So it never counts as "Confirm it's you"
// (./new-sign-in.ts). Its second step, when there is one, still does.
//
// Keyed by the request's auth context, the same object in every hook of one
// request; nothing outlives the request.

const unsolicited = new WeakSet<object>();

export function markUnsolicitedSignIn(context: object): void {
  unsolicited.add(context);
}

export function isUnsolicitedSignIn(
  context: object | null | undefined
): boolean {
  return Boolean(context && unsolicited.has(context));
}
