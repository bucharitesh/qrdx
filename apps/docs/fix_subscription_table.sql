-- Drop the old subscription table
DROP TABLE IF EXISTS subscription CASCADE;

-- Create the new subscription table with correct column names
CREATE TABLE subscription (
  id text PRIMARY KEY NOT NULL,
  created_at timestamp NOT NULL,
  modified_at timestamp,
  amount integer NOT NULL,
  currency text NOT NULL,
  recurring_interval text NOT NULL,
  status text NOT NULL,
  current_period_start timestamp NOT NULL,
  current_period_end timestamp NOT NULL,
  cancel_at_period_end boolean DEFAULT false NOT NULL,
  canceled_at timestamp,
  started_at timestamp NOT NULL,
  ends_at timestamp,
  ended_at timestamp,
  customer_id text NOT NULL,
  product_id text NOT NULL,
  discount_id text,
  checkout_id text NOT NULL,
  customer_cancellation_reason text,
  customer_cancellation_comment text,
  metadata text,
  custom_field_data text,
  user_id text REFERENCES "user"(id)
);

