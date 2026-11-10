-- Affiliate program (apps/docs/lib/affiliates): four new tables.
--
--   affiliate             one row per person who applied: status (pending,
--                         approved, rejected, suspended), referral code,
--                         PayPal email (set only once approved), the
--                         application answers, link clicks, who approved.
--   affiliate_referral    the account a referral brought in, which affiliate,
--                         how it was attributed, and the customer's first
--                         paid order (their 12 months start there).
--   affiliate_payout      a payout the owner sent by hand through PayPal:
--                         total, currency, PayPal reference, when, who.
--   affiliate_commission  one per paid Polar order from a referred customer
--                         (polar_order_id is unique: a repeated webhook finds
--                         the same row), with the amount it's based on, the
--                         rate, the commission, its status (pending,
--                         approved, void, paid), when it becomes payable, why
--                         it was voided, and the payout that covered it.
--
-- Money is in integer minor units, in the currency Polar reports.
--
-- Additive and idempotent: new tables, their constraints and indexes only,
-- safe to run more than once, in one transaction. No existing table or
-- column changes. The foreign keys are inside CREATE TABLE so that running
-- it again adds nothing twice.
--
-- Order: apply it BEFORE deploying the code that uses it, with the owner's
-- yes. If the code runs first, nothing breaks: sign-up, checkout and the
-- Polar webhook catch the missing table, log it once per process and carry
-- on; the affiliate pages say the program isn't available yet; no referral
-- or commission is recorded until the tables exist.
--
-- Rollback: the code before this feature never reads or writes these
-- tables, so it keeps working with them present. Leave them in place when
-- rolling back; dropping them is a separate change.
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   SELECT count(*) FROM affiliate;             -- 0 right after
--   \d affiliate_commission
--
-- Names match what drizzle-kit generates from packages/database/schema.ts
-- (affiliate, affiliateReferral, affiliatePayout, affiliateCommission), so a
-- later `drizzle-kit push` sees no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "affiliate" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "code" text NOT NULL,
  "paypal_email" text,
  "application" jsonb,
  "click_count" integer DEFAULT 0 NOT NULL,
  "approved_at" timestamp,
  "approved_by" text,
  "reviewed_at" timestamp,
  "reviewed_by" text,
  "status_note" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "affiliate_user_id_unique" UNIQUE ("user_id"),
  CONSTRAINT "affiliate_code_unique" UNIQUE ("code"),
  CONSTRAINT "affiliate_user_id_user_id_fk" FOREIGN KEY ("user_id")
    REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "affiliate_referral" (
  "id" text PRIMARY KEY NOT NULL,
  "affiliate_id" text NOT NULL,
  "referred_user_id" text NOT NULL,
  "attributed_via" text NOT NULL,
  "first_paid_at" timestamp,
  "created_at" timestamp NOT NULL,
  CONSTRAINT "affiliate_referral_referred_user_id_unique" UNIQUE ("referred_user_id"),
  CONSTRAINT "affiliate_referral_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id")
    REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "affiliate_referral_referred_user_id_user_id_fk" FOREIGN KEY ("referred_user_id")
    REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "affiliate_payout" (
  "id" text PRIMARY KEY NOT NULL,
  "affiliate_id" text NOT NULL,
  "currency" text NOT NULL,
  "amount" integer NOT NULL,
  "commission_count" integer NOT NULL,
  "paypal_email" text NOT NULL,
  "paypal_reference" text NOT NULL,
  "paid_at" timestamp NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp NOT NULL,
  CONSTRAINT "affiliate_payout_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id")
    REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "affiliate_commission" (
  "id" text PRIMARY KEY NOT NULL,
  "affiliate_id" text NOT NULL,
  "referral_id" text,
  "referred_user_id" text,
  "polar_order_id" text NOT NULL,
  "polar_customer_id" text,
  "currency" text NOT NULL,
  "order_amount" integer NOT NULL,
  "rate_bps" integer NOT NULL,
  "amount" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "order_paid_at" timestamp NOT NULL,
  "available_at" timestamp NOT NULL,
  "voided_at" timestamp,
  "void_reason" text,
  "void_refund_id" text,
  "payout_id" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "affiliate_commission_polar_order_id_unique" UNIQUE ("polar_order_id"),
  CONSTRAINT "affiliate_commission_affiliate_id_affiliate_id_fk" FOREIGN KEY ("affiliate_id")
    REFERENCES "public"."affiliate"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "affiliate_commission_referral_id_affiliate_referral_id_fk" FOREIGN KEY ("referral_id")
    REFERENCES "public"."affiliate_referral"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "affiliate_commission_payout_id_affiliate_payout_id_fk" FOREIGN KEY ("payout_id")
    REFERENCES "public"."affiliate_payout"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "affiliate_status_idx"
  ON "affiliate" USING btree ("status");

CREATE INDEX IF NOT EXISTS "affiliate_referral_affiliate_id_idx"
  ON "affiliate_referral" USING btree ("affiliate_id");

CREATE INDEX IF NOT EXISTS "affiliate_payout_affiliate_id_idx"
  ON "affiliate_payout" USING btree ("affiliate_id", "paid_at" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "affiliate_commission_affiliate_status_idx"
  ON "affiliate_commission" USING btree ("affiliate_id", "status");

-- The daily cron: pending commissions whose 30 days are over.
CREATE INDEX IF NOT EXISTS "affiliate_commission_status_available_idx"
  ON "affiliate_commission" USING btree ("status", "available_at");

CREATE INDEX IF NOT EXISTS "affiliate_commission_payout_id_idx"
  ON "affiliate_commission" USING btree ("payout_id");

COMMIT;
