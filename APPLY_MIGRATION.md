# Apply Integration Table Migration

The integration table needs to be created in your database. Here are your options:

## Option 1: Using Drizzle Kit (Recommended)

1. **First, set up your environment variables** in `apps/docs/.env`:

```env
# Database
DATABASE_URL=your_neon_database_url

# Auth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_API_KEY=your_google_api_key

# Payments
POLAR_ACCESS_TOKEN=your_polar_token
POLAR_WEBHOOK_SECRET=your_polar_webhook_secret

# Integrations - Dub
DUB_CLIENT_ID=your_dub_client_id
DUB_CLIENT_SECRET=your_dub_client_secret
DUB_REDIRECT_URI=http://localhost:3000/api/integrations/dub/callback

# Integration Encryption (generate a random 32+ char string)
INTEGRATION_ENCRYPTION_KEY=your-random-32-character-encryption-key-here
```

2. **Generate encryption key** (if needed):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. **Apply migration**:
```bash
cd apps/docs
pnpm db:push
```

## Option 2: Direct SQL Execution

If you want to apply the migration directly to your database:

1. **Copy the SQL from** `apps/docs/drizzle/0001_past_ironclad.sql`

2. **Run it in your database** (Neon, Supabase, etc.):

```sql
CREATE TABLE "integration" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp,
	"scopes" text,
	"metadata" json,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

ALTER TABLE "integration" ADD CONSTRAINT "integration_user_id_user_id_fk" 
FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") 
ON DELETE cascade ON UPDATE no action;
```

## Option 3: Using Neon Console

1. Go to your Neon dashboard
2. Open SQL Editor
3. Paste the SQL from above
4. Click "Run"

## Verify Migration

After applying the migration, verify it worked:

```bash
cd apps/docs
pnpm dev
```

Then navigate to `http://localhost:3000/settings/integrations`

The error should be gone and you should see the integrations page!

## Next Steps

Once the migration is applied:

1. ✅ Set up your Dub OAuth app at https://app.dub.co/settings/oauth
2. ✅ Add the credentials to your `.env` file
3. ✅ Test connecting Dub.sh from the integrations page
4. ✅ Start using `getDubClient(userId)` in your code!

## Troubleshooting

**"Column does not exist" error:**
→ Migration not applied. Follow steps above.

**"Invalid environment variables" error:**
→ Your `.env` file is missing required variables.

**"Integration encryption key" error:**
→ Generate a new key with the command above.

