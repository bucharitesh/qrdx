-- An index on verification.identifier. Every read of the table is by
-- identifier: sign-in and email-change codes, "Confirm it's you" and its
-- strong marker, the "sign in again" intent, trusted devices, and on
-- signed-in requests the SSO-required marker and a session's origin
-- (packages/auth/ee/sso-required.ts, packages/auth/session-origin.ts).
-- Without it each of those scans the table.
--
-- Additive and idempotent: one new index, no table or column changes, safe
-- to run more than once. CONCURRENTLY builds it without locking writes, so
-- it can't run inside a transaction: run this statement on its own.
--
-- Rollback: nothing to do. Code from before this change works with or
-- without the index; leave it in place.
--
-- Order: any time. The code doesn't depend on it; it only makes the lookups
-- cheaper. Apply it before or right after the release that adds the
-- per-request lookups.
CREATE INDEX CONCURRENTLY IF NOT EXISTS verification_identifier_idx
  ON verification (identifier);
